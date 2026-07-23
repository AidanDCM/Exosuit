using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;

namespace Exosuit.Agent;

public sealed record FieldKvpRuntimeConfiguration(
    int ContractVersion,
    FieldReference Field,
    string AgentId,
    string KeyId,
    string SecretPath,
    string BootstrapReportPath,
    int HeartbeatIntervalMilliseconds);

public static class FieldKvpRuntime
{
    public const string HandshakeValueName = "Exosuit.Field.Handshake";
    public const string BootstrapValueName = "Exosuit.Field.Bootstrap";
    public const string HeartbeatValueName = "Exosuit.Field.Heartbeat";
    private const string GuestKvpRegistryPath = @"SOFTWARE\Microsoft\Virtual Machine\Guest";
    // Hyper-V KVP values are bounded to 2,048 bytes. Keep UTF-16 values at or
    // below 1,000 characters so a heartbeat fits atomically with safety margin.
    private const int KvpChunkCharacters = 1000;
    private static readonly JsonSerializerOptions WireJson = CreateWireJson();

    public static async Task RunGuestAsync(string configurationPath, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Field KVP runtime requires Windows.");
        var configuration = ReadConfiguration(configurationPath);
        var secret = ReadSecret(configuration.SecretPath);
        var bootId = Guid.NewGuid();
        long sequence = 0;
        long heartbeatSequence = 0;

        using var guestKey = Registry.LocalMachine.CreateSubKey(GuestKvpRegistryPath, writable: true)
            ?? throw new InvalidOperationException("The Hyper-V guest KVP registry key could not be opened.");

        WriteEnvelope(guestKey, HandshakeValueName, CreateEnvelope(
            configuration, secret, bootId, sequence++, FieldChannelMessageType.Handshake,
            new Dictionary<string, object?>
            {
                ["agentId"] = configuration.AgentId,
                ["bootId"] = bootId.ToString(),
                ["transport"] = "hyperv_kvp",
            }));

        var bootstrap = ReadBootstrapStatus(configuration.BootstrapReportPath);
        WriteEnvelope(guestKey, BootstrapValueName, CreateEnvelope(
            configuration, secret, bootId, sequence++, FieldChannelMessageType.BootstrapStatus, bootstrap));
        var nextControlRefresh = DateTimeOffset.UtcNow.AddMinutes(4);

        while (!cancellationToken.IsCancellationRequested)
        {
            if (DateTimeOffset.UtcNow >= nextControlRefresh)
            {
                WriteEnvelope(guestKey, HandshakeValueName, CreateEnvelope(
                    configuration, secret, bootId, sequence++, FieldChannelMessageType.Handshake,
                    new Dictionary<string, object?>
                    {
                        ["agentId"] = configuration.AgentId,
                        ["bootId"] = bootId.ToString(),
                        ["transport"] = "hyperv_kvp",
                    }));
                bootstrap = ReadBootstrapStatus(configuration.BootstrapReportPath);
                WriteEnvelope(guestKey, BootstrapValueName, CreateEnvelope(
                    configuration, secret, bootId, sequence++, FieldChannelMessageType.BootstrapStatus, bootstrap));
                nextControlRefresh = DateTimeOffset.UtcNow.AddMinutes(4);
            }
            var activeSessionId = GetActiveInteractiveSessionId();
            var locked = IsSessionLocked(activeSessionId);
            var secureDesktop = Process.GetProcessesByName("consent").Any(process => process.SessionId == activeSessionId);
            var shellReady = Process.GetProcessesByName("explorer").Any(process => process.SessionId == activeSessionId);
            var desktopReady = activeSessionId != uint.MaxValue && !locked && !secureDesktop && shellReady;
            var process = Process.GetCurrentProcess();
            var heartbeat = new Dictionary<string, object?>
            {
                ["contractVersion"] = 1,
                ["field"] = new Dictionary<string, object?>
                {
                    ["fieldId"] = configuration.Field.FieldId.ToString(),
                    ["fieldGeneration"] = configuration.Field.FieldGeneration,
                },
                ["agentId"] = configuration.AgentId,
                ["bootId"] = bootId.ToString(),
                ["sequence"] = heartbeatSequence++,
                ["observedAt"] = WireDate(DateTimeOffset.UtcNow),
                ["lifecycle"] = desktopReady ? "ready" : "provisioning",
                ["desktopReady"] = desktopReady,
                ["sessionLocked"] = locked,
                ["secureDesktopActive"] = secureDesktop,
                ["inputQueueDepth"] = 0,
                ["pendingCommandCount"] = 0,
                ["workingSetBytes"] = process.WorkingSet64,
            };
            WriteEnvelope(guestKey, HeartbeatValueName, CreateEnvelope(
                configuration, secret, bootId, sequence++, FieldChannelMessageType.Heartbeat, heartbeat));
            await Task.Delay(configuration.HeartbeatIntervalMilliseconds, cancellationToken);
        }
    }

    public static FieldChannelEnvelope CreateEnvelope(
        FieldKvpRuntimeConfiguration configuration,
        string secret,
        Guid bootId,
        long sequence,
        FieldChannelMessageType messageType,
        IReadOnlyDictionary<string, object?> payload,
        DateTimeOffset? sentAt = null)
    {
        ValidateConfiguration(configuration);
        if (bootId == Guid.Empty) throw new ArgumentException("Guest boot ID cannot be empty.", nameof(bootId));
        return FieldChannelAuthentication.Create(
            configuration.Field,
            FieldChannelDirection.GuestToHost,
            sequence,
            messageType,
            payload,
            configuration.KeyId,
            secret,
            sentAt ?? DateTimeOffset.UtcNow,
            messageType == FieldChannelMessageType.Heartbeat ? TimeSpan.FromSeconds(10) : TimeSpan.FromMinutes(5));
    }

    public static FieldChannelEnvelope VerifyEnvelope(
        string configurationPath,
        string envelopePath,
        string replayStatePath)
    {
        var configuration = ReadConfiguration(configurationPath);
        var secret = ReadSecret(configuration.SecretPath);
        var envelope = JsonSerializer.Deserialize<FieldChannelEnvelope>(
            File.ReadAllText(envelopePath), WireJson)
            ?? throw new InvalidOperationException("Field KVP envelope is empty.");
        var guard = new FieldChannelReplayGuard(
            configuration.Field,
            FieldChannelDirection.GuestToHost,
            configuration.KeyId,
            stateFilePath: replayStatePath);
        var verified = guard.Accept(envelope, secret, DateTimeOffset.UtcNow);
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            status = "verified",
            field = configuration.Field,
            verified.MessageId,
            verified.Sequence,
            messageType = verified.MessageType,
            verified.SentAt,
            verified.ExpiresAt,
            verified.PayloadHash,
            verified.Payload,
            replayLastSequence = guard.LastSequence,
        }, WireJson));
        return verified;
    }

    public static string SerializeEnvelope(FieldChannelEnvelope envelope) =>
        JsonSerializer.Serialize(envelope, WireJson);

    public static FieldKvpRuntimeConfiguration ReadConfiguration(string path)
    {
        var configuration = JsonSerializer.Deserialize<FieldKvpRuntimeConfiguration>(
            File.ReadAllText(path), WireJson)
            ?? throw new InvalidOperationException("Field KVP runtime configuration is empty.");
        ValidateConfiguration(configuration);
        return configuration;
    }

    private static void ValidateConfiguration(FieldKvpRuntimeConfiguration configuration)
    {
        if (configuration.ContractVersion != 1) throw new InvalidOperationException("Unsupported Field KVP runtime contract version.");
        configuration.Field.Validate();
        if (string.IsNullOrWhiteSpace(configuration.AgentId)) throw new InvalidOperationException("Field KVP agent ID is required.");
        if (string.IsNullOrWhiteSpace(configuration.KeyId)) throw new InvalidOperationException("Field KVP key ID is required.");
        if (string.IsNullOrWhiteSpace(configuration.SecretPath)) throw new InvalidOperationException("Field KVP secret path is required.");
        if (string.IsNullOrWhiteSpace(configuration.BootstrapReportPath)) throw new InvalidOperationException("Field bootstrap report path is required.");
        if (configuration.HeartbeatIntervalMilliseconds is < 500 or > 30_000)
            throw new InvalidOperationException("Heartbeat interval must be from 500 through 30,000 milliseconds.");
    }

    private static string ReadSecret(string path)
    {
        var secret = File.ReadAllText(path).Trim();
        if (secret.Length < 32) throw new InvalidOperationException("Field KVP secret must contain at least 32 characters.");
        return secret;
    }

    private static IReadOnlyDictionary<string, object?> ReadBootstrapStatus(string path)
    {
        if (!File.Exists(path))
        {
            return new Dictionary<string, object?>
            {
                ["status"] = "failed",
                ["reason"] = "bootstrap_report_missing",
            };
        }
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        var checks = root.GetProperty("checks").EnumerateArray().ToArray();
        var failed = checks
            .Where(check => !check.GetProperty("passed").GetBoolean())
            .Select(check => check.GetProperty("name").GetString())
            .Where(name => name is not null)
            .ToArray();
        return new Dictionary<string, object?>
        {
            ["status"] = failed.Length == 0 ? "not_ready" : "failed",
            ["manifestDigest"] = root.GetProperty("manifestDigest").GetString(),
            ["failedChecks"] = failed,
            ["report"] = root.Clone(),
        };
    }

    private static void WriteEnvelope(RegistryKey guestKey, string name, FieldChannelEnvelope envelope)
    {
        var value = SerializeEnvelope(envelope);
        if (value.Length > 16_000) throw new InvalidOperationException("Field KVP envelope exceeds the configured transport bound.");
        foreach (var staleName in guestKey.GetValueNames().Where(valueName =>
                     valueName.StartsWith($"{name}.", StringComparison.Ordinal)))
        {
            guestKey.DeleteValue(staleName, throwOnMissingValue: false);
        }
        if (value.Length <= KvpChunkCharacters)
        {
            guestKey.SetValue(name, value, RegistryValueKind.String);
            return;
        }
        var chunks = Enumerable.Range(0, (value.Length + KvpChunkCharacters - 1) / KvpChunkCharacters)
            .Select(index => value.Substring(
                index * KvpChunkCharacters,
                Math.Min(KvpChunkCharacters, value.Length - index * KvpChunkCharacters)))
            .ToArray();
        for (var index = 0; index < chunks.Length; index++)
        {
            guestKey.SetValue($"{name}.{index:D3}", chunks[index], RegistryValueKind.String);
        }
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
        guestKey.SetValue(name, JsonSerializer.Serialize(new
        {
            contractVersion = 1,
            transport = "chunked",
            chunkCount = chunks.Length,
            sha256 = digest,
        }, WireJson), RegistryValueKind.String);
    }

    private static JsonSerializerOptions CreateWireJson()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }

    private static string WireDate(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);

    private static bool IsSessionLocked(uint sessionId)
    {
        if (sessionId == uint.MaxValue) return true;
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, 25, out var buffer, out var byteCount) ||
            buffer == IntPtr.Zero ||
            byteCount < 20)
        {
            return true;
        }
        try
        {
            var level = Marshal.ReadInt32(buffer, 0);
            // WTSINFOEX starts with Level (4 bytes), followed by the LEVEL1
            // SessionId, SessionState, and SessionFlags fields.
            var sessionFlags = Marshal.ReadInt32(buffer, 16);
            return level != 1 || sessionFlags != 1;
        }
        finally
        {
            WTSFreeMemory(buffer);
        }
    }

    private static uint GetActiveInteractiveSessionId()
    {
        if (WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var sessions, out var count) && sessions != IntPtr.Zero)
        {
            try
            {
                var size = Marshal.SizeOf<WtsSessionInfo>();
                for (var index = 0; index < count; index++)
                {
                    var session = Marshal.PtrToStructure<WtsSessionInfo>(IntPtr.Add(sessions, index * size));
                    if (session.SessionId > 0 && session.State == 0) return session.SessionId;
                }
            }
            finally
            {
                WTSFreeMemory(sessions);
            }
        }
        return WTSGetActiveConsoleSessionId();
    }

    [DllImport("kernel32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr serverHandle,
        uint sessionId,
        int informationClass,
        out IntPtr buffer,
        out int bytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSEnumerateSessions(
        IntPtr serverHandle,
        int reserved,
        int version,
        out IntPtr sessionInfo,
        out int count);

    [StructLayout(LayoutKind.Sequential)]
    private struct WtsSessionInfo
    {
        public uint SessionId;
        public IntPtr WinStationName;
        public int State;
    }
}
