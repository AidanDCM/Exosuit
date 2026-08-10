using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
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

public sealed record KvpObservationEntry(Guid MessageId, long Sequence, string EnvelopeSha256);

public sealed record KvpObservationState(
    int ContractVersion,
    FieldReference Field,
    string KeyId,
    long LastSequence,
    IReadOnlyDictionary<string, KvpObservationEntry> Entries);

public sealed record ProtectedKvpObservationState(
    int ContractVersion,
    FieldReference Field,
    string KeyId,
    string Algorithm,
    string PayloadBase64,
    string AuthenticationTag);

public static class FieldKvpRuntime
{
    public const string HandshakeValueName = "Exosuit.Field.Handshake";
    public const string BootstrapValueName = "Exosuit.Field.Bootstrap";
    public const string HeartbeatValueName = "Exosuit.Field.Heartbeat";
    public const string SceneValueName = "Exosuit.Field.Scene";
    private const string GuestKvpRegistryPath = @"SOFTWARE\Microsoft\Virtual Machine\Guest";
    // Hyper-V KVP values are bounded to 2,048 bytes. Keep UTF-16 values at or
    // below 1,000 characters so a heartbeat fits atomically with safety margin.
    private const int KvpChunkCharacters = 1000;
    private const long MaximumSafeWireSequence = 9_007_199_254_740_991;
    private const int MaximumObservationStateBytes = 32 * 1_024;
    private const int MaximumObservationPayloadBase64Characters = 16 * 1_024;
    private const string ObservationStateAlgorithm = "hmac-sha256";
    private static readonly JsonSerializerOptions WireJson = CreateWireJson();

    public static async Task RunGuestAsync(string configurationPath, CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Field KVP runtime requires Windows.");
        var callerSid = WindowsIdentity.GetCurrent().User?.Value;
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);
        var configuration = FieldChannelSecretProtectionCommand.ReadValidatedRuntimeConfiguration(
            FieldChannelSecretProtectionCommand.ProductionConfigRoot,
            configurationPath,
            callerSid);
        var secretBytes = ProtectedFieldKvpSecretReader.CreateProduction().Read(configurationPath, configuration, callerSid);

        try
        {
            var secret = Encoding.ASCII.GetString(secretBytes);
            var bootId = Guid.NewGuid();
            long heartbeatSequence = 0;
            using var guestKey = Registry.LocalMachine.CreateSubKey(GuestKvpRegistryPath, writable: true)
                ?? throw new InvalidOperationException("The Hyper-V guest KVP registry key could not be opened.");

            WriteEnvelope(guestKey, HandshakeValueName, CreateEnvelope(
                configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.Handshake,
                new Dictionary<string, object?>
                {
                    ["agentId"] = configuration.AgentId,
                    ["bootId"] = bootId.ToString(),
                    ["transport"] = "hyperv_kvp",
                }));

            // Sent without runtime attestation: the heartbeat has not started, so
            // claiming heartbeat_started here would be false rather than merely
            // incomplete. The host evaluator reports not_ready until the completing
            // report below arrives.
            var bootstrap = BindBootstrapToBoot(ReadBootstrapStatus(configuration.BootstrapReportPath), bootId);
            WriteEnvelope(guestKey, BootstrapValueName, CreateEnvelope(
                configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.BootstrapStatus, bootstrap));
            var nextControlRefresh = DateTimeOffset.UtcNow.AddMinutes(4);
            var heartbeatStarted = false;
            var lastSecureDesktopActive = false;

            while (!cancellationToken.IsCancellationRequested)
            {
                if (DateTimeOffset.UtcNow >= nextControlRefresh)
                {
                    WriteEnvelope(guestKey, HandshakeValueName, CreateEnvelope(
                        configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.Handshake,
                        new Dictionary<string, object?>
                        {
                            ["agentId"] = configuration.AgentId,
                            ["bootId"] = bootId.ToString(),
                            ["transport"] = "hyperv_kvp",
                        }));
                    bootstrap = BindBootstrapToBoot(
                        ReadBootstrapStatus(
                            configuration.BootstrapReportPath,
                            heartbeatStarted ? new FieldRuntimeAttestation(lastSecureDesktopActive, true) : null),
                        bootId);
                    WriteEnvelope(guestKey, BootstrapValueName, CreateEnvelope(
                        configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.BootstrapStatus, bootstrap));
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
                    configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.Heartbeat, heartbeat));
                lastSecureDesktopActive = secureDesktop;

                // The first heartbeat is the evidence for heartbeat_started, so the
                // completing bootstrap report is sent immediately after it rather
                // than waiting up to four minutes for the next control refresh.
                if (!heartbeatStarted)
                {
                    heartbeatStarted = true;
                    bootstrap = BindBootstrapToBoot(
                        ReadBootstrapStatus(
                            configuration.BootstrapReportPath,
                            new FieldRuntimeAttestation(secureDesktop, true)),
                        bootId);
                    WriteEnvelope(guestKey, BootstrapValueName, CreateEnvelope(
                        configuration, secret, bootId, ReserveNextGuestSequence(configuration), FieldChannelMessageType.BootstrapStatus, bootstrap));
                }
                await Task.Delay(configuration.HeartbeatIntervalMilliseconds, cancellationToken);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(secretBytes);
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
            messageType is FieldChannelMessageType.Heartbeat or FieldChannelMessageType.SceneObservation
                ? TimeSpan.FromSeconds(10)
                : TimeSpan.FromMinutes(5));
    }

    internal static long ReserveNextGuestSequence(
        FieldKvpRuntimeConfiguration configuration,
        DateTimeOffset? now = null)
    {
        ValidateConfiguration(configuration);
        var directory = Path.GetDirectoryName(Path.GetFullPath(configuration.SecretPath))
            ?? throw new InvalidOperationException("Field guest secret path has no parent directory.");
        var path = Path.Combine(directory, "guest-sequence.json");
        var next = checked((now ?? DateTimeOffset.UtcNow).ToUnixTimeMilliseconds() * 1_000);
        if (File.Exists(path))
        {
            var state = JsonSerializer.Deserialize<GuestSequenceState>(File.ReadAllText(path), WireJson)
                ?? throw new InvalidOperationException("Field guest sequence state is empty.");
            if (state.ContractVersion != 1 ||
                state.Field != configuration.Field ||
                !string.Equals(state.KeyId, configuration.KeyId, StringComparison.Ordinal) ||
                state.NextSequence < 0 ||
                state.NextSequence > MaximumSafeWireSequence)
            {
                throw new InvalidOperationException("Field guest sequence state is invalid or belongs to another channel.");
            }
            next = state.NextSequence;
        }
        if (next >= MaximumSafeWireSequence)
        {
            throw new InvalidOperationException("Field guest sequence space is exhausted.");
        }
        Directory.CreateDirectory(directory);
        var updated = new GuestSequenceState(1, configuration.Field, configuration.KeyId, next + 1);
        var temporary = $"{path}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        try
        {
            WriteDurableState(temporary, JsonSerializer.Serialize(updated, WireJson));
            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
        return next;
    }

    private static void WriteDurableState(string path, string content)
    {
        var bytes = new UTF8Encoding(false).GetBytes(content);
        using var stream = new FileStream(
            path,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 4_096,
            FileOptions.WriteThrough);
        stream.Write(bytes);
        stream.Flush(flushToDisk: true);
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

    public static IReadOnlyList<FieldChannelEnvelope> ObserveSnapshot(
        string configurationPath,
        string handshakeEnvelopePath,
        string bootstrapEnvelopePath,
        string heartbeatEnvelopePath,
        string observationStatePath,
        DateTimeOffset? now = null)
    {
        var configuration = ReadConfiguration(configurationPath);
        var secret = ReadSecret(configuration.SecretPath);
        var expected = new[]
        {
            (Name: "handshake", Path: handshakeEnvelopePath, Type: FieldChannelMessageType.Handshake),
            (Name: "bootstrap", Path: bootstrapEnvelopePath, Type: FieldChannelMessageType.BootstrapStatus),
            (Name: "heartbeat", Path: heartbeatEnvelopePath, Type: FieldChannelMessageType.Heartbeat),
        };
        var guard = new FieldChannelReplayGuard(
            configuration.Field,
            FieldChannelDirection.GuestToHost,
            configuration.KeyId);
        var verified = new List<(string Name, string Digest, FieldChannelEnvelope Envelope)>(3);
        foreach (var item in expected)
        {
            var bytes = File.ReadAllBytes(item.Path);
            var envelope = JsonSerializer.Deserialize<FieldChannelEnvelope>(bytes, WireJson)
                ?? throw new InvalidOperationException($"Field KVP {item.Name} envelope is empty.");
            var accepted = guard.Accept(envelope, secret, now ?? DateTimeOffset.UtcNow);
            if (accepted.MessageType != item.Type)
                throw new InvalidOperationException($"Field KVP {item.Name} envelope has the wrong message type.");
            verified.Add((item.Name, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), accepted));
        }

        var state = File.Exists(observationStatePath)
            ? ReadObservationState(observationStatePath, configuration, secret)
            : new KvpObservationState(1, configuration.Field, configuration.KeyId, -1, new Dictionary<string, KvpObservationEntry>(StringComparer.Ordinal));
        ValidateObservationState(state, configuration);
        var entries = new Dictionary<string, KvpObservationEntry>(state.Entries, StringComparer.Ordinal);
        var lastSequence = state.LastSequence;
        foreach (var item in verified)
        {
            entries.TryGetValue(item.Name, out var previous);
            var idempotent = previous is not null &&
                string.Equals(previous.EnvelopeSha256, item.Digest, StringComparison.Ordinal) &&
                previous.MessageId == item.Envelope.MessageId &&
                previous.Sequence == item.Envelope.Sequence;
            if (idempotent) continue;
            if (item.Envelope.Sequence <= lastSequence)
                throw new InvalidOperationException($"Field KVP {item.Name} observation sequence did not increase strictly.");
            if (entries.Values.Any(entry => entry.MessageId == item.Envelope.MessageId))
                throw new InvalidOperationException($"Field KVP {item.Name} observation reused a prior message ID.");
            entries[item.Name] = new KvpObservationEntry(item.Envelope.MessageId, item.Envelope.Sequence, item.Digest);
            lastSequence = item.Envelope.Sequence;
        }

        var updated = new KvpObservationState(1, configuration.Field, configuration.KeyId, lastSequence, entries);
        var fullObservationPath = Path.GetFullPath(observationStatePath);
        var directory = Path.GetDirectoryName(fullObservationPath)
            ?? throw new InvalidOperationException("Field KVP observation state path has no parent directory.");
        Directory.CreateDirectory(directory);
        var temporary = $"{fullObservationPath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        try
        {
            WriteDurableState(temporary, ProtectObservationState(updated, configuration, secret));
            File.Move(temporary, fullObservationPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
        return verified.Select(item => item.Envelope).ToArray();
    }

    public static string SerializeVerificationResults(IReadOnlyList<FieldChannelEnvelope> verified)
    {
        var verifiedAt = DateTimeOffset.UtcNow;
        return JsonSerializer.Serialize(verified.Select(item => VerificationResult(item, verifiedAt)).ToArray(), WireJson);
    }

    private static object VerificationResult(FieldChannelEnvelope verified, DateTimeOffset verifiedAt)
    {
        if (!verified.Payload.TryGetValue("bootId", out var bootValue) ||
            !Guid.TryParse(Convert.ToString(bootValue, System.Globalization.CultureInfo.InvariantCulture), out var bootId) ||
            bootId == Guid.Empty)
        {
            throw new InvalidOperationException("Verified Field KVP payload does not bind a valid guest boot ID.");
        }
        return new
        {
            status = "verified",
            field = verified.Field,
            verified.MessageId,
            verified.Nonce,
            verified.Sequence,
            messageType = verified.MessageType,
            verified.SentAt,
            verified.ExpiresAt,
            verified.KeyId,
            verified.PayloadHash,
            payloadHashValid = true,
            verifiedAt,
            transport = "hyperv_kvp",
            bootId,
            verified.Payload,
        };
    }

    internal static IReadOnlyDictionary<string, object?> BindBootstrapToBoot(
        IReadOnlyDictionary<string, object?> bootstrap,
        Guid bootId)
    {
        if (bootId == Guid.Empty) throw new ArgumentException("Guest boot ID cannot be empty.", nameof(bootId));
        var bound = new Dictionary<string, object?>(bootstrap, StringComparer.Ordinal)
        {
            ["bootId"] = bootId.ToString(),
        };
        return bound;
    }

    private static void ValidateObservationState(KvpObservationState state, FieldKvpRuntimeConfiguration configuration)
    {
        if (state.ContractVersion != 1 || state.Field != configuration.Field ||
            !string.Equals(state.KeyId, configuration.KeyId, StringComparison.Ordinal) || state.LastSequence < -1 ||
            state.Entries is null || state.Entries.Count > 3 ||
            state.Entries.Keys.Any(key => key is not ("handshake" or "bootstrap" or "heartbeat")) ||
            state.Entries.Values.Any(entry => entry is null || entry.MessageId == Guid.Empty || entry.Sequence < 0 ||
                string.IsNullOrWhiteSpace(entry.EnvelopeSha256) || entry.EnvelopeSha256.Length != 64 ||
                entry.EnvelopeSha256.Any(character => !Uri.IsHexDigit(character))) ||
            state.Entries.Values.Select(entry => entry.MessageId).Distinct().Count() != state.Entries.Count ||
            (state.Entries.Count > 0 && state.LastSequence != state.Entries.Values.Max(entry => entry.Sequence)))
        {
            throw new InvalidOperationException("Persisted Field KVP observation state is invalid or belongs to another channel.");
        }
    }

    private static string ProtectObservationState(
        KvpObservationState state,
        FieldKvpRuntimeConfiguration configuration,
        string secret)
    {
        ValidateObservationState(state, configuration);
        var payload = JsonSerializer.SerializeToUtf8Bytes(state, WireJson);
        var protectedState = new ProtectedKvpObservationState(
            1,
            configuration.Field,
            configuration.KeyId,
            ObservationStateAlgorithm,
            Convert.ToBase64String(payload),
            ComputeObservationStateTag(configuration, secret, payload));
        return JsonSerializer.Serialize(protectedState, WireJson);
    }

    private static KvpObservationState ReadObservationState(
        string path,
        FieldKvpRuntimeConfiguration configuration,
        string secret)
    {
        try
        {
            var fileLength = new FileInfo(path).Length;
            if (fileLength is <= 0 or > MaximumObservationStateBytes)
                throw new InvalidOperationException("Protected Field KVP observation state exceeds its byte limit.");
            var protectedState = JsonSerializer.Deserialize<ProtectedKvpObservationState>(File.ReadAllText(path), WireJson)
                ?? throw new InvalidOperationException("Persisted Field KVP observation state is empty.");
            if (protectedState.ContractVersion != 1 ||
                protectedState.Field != configuration.Field ||
                !string.Equals(protectedState.KeyId, configuration.KeyId, StringComparison.Ordinal) ||
                !string.Equals(protectedState.Algorithm, ObservationStateAlgorithm, StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(protectedState.PayloadBase64) ||
                protectedState.PayloadBase64.Length > MaximumObservationPayloadBase64Characters ||
                string.IsNullOrWhiteSpace(protectedState.AuthenticationTag) ||
                protectedState.AuthenticationTag.Length != 64 ||
                protectedState.AuthenticationTag.Any(character => !Uri.IsHexDigit(character)))
            {
                throw new InvalidOperationException("Protected Field KVP observation state is invalid or belongs to another channel.");
            }
            var payload = Convert.FromBase64String(protectedState.PayloadBase64);
            var expectedTag = Convert.FromHexString(ComputeObservationStateTag(configuration, secret, payload));
            var actualTag = Convert.FromHexString(protectedState.AuthenticationTag);
            if (!CryptographicOperations.FixedTimeEquals(expectedTag, actualTag))
                throw new InvalidOperationException("Protected Field KVP observation state authentication failed.");
            return JsonSerializer.Deserialize<KvpObservationState>(payload, WireJson)
                ?? throw new InvalidOperationException("Persisted Field KVP observation state payload is empty.");
        }
        catch (Exception exception) when (exception is JsonException or FormatException)
        {
            throw new InvalidOperationException("Persisted Field KVP observation state is malformed.", exception);
        }
    }

    private static string ComputeObservationStateTag(
        FieldKvpRuntimeConfiguration configuration,
        string secret,
        byte[] payload)
    {
        var scope = Encoding.UTF8.GetBytes(string.Join('\n',
            "exosuit-field-kvp-observation-v1",
            configuration.Field.FieldId.ToString("D"),
            configuration.Field.FieldGeneration.ToString(System.Globalization.CultureInfo.InvariantCulture),
            configuration.KeyId,
            ObservationStateAlgorithm,
            string.Empty));
        var authenticated = new byte[scope.Length + payload.Length];
        Buffer.BlockCopy(scope, 0, authenticated, 0, scope.Length);
        Buffer.BlockCopy(payload, 0, authenticated, scope.Length, payload.Length);
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(authenticated)).ToLowerInvariant();
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

    internal static void ValidateConfiguration(FieldKvpRuntimeConfiguration configuration)
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

    /// <summary>
    /// Runtime facts only the running agent can attest. The guest precheck
    /// deliberately omits the corresponding bootstrap checks, because a script
    /// that has not started the agent cannot honestly report on the agent.
    /// </summary>
    internal readonly record struct FieldRuntimeAttestation(bool SecureDesktopActive, bool HeartbeatStarted);

    internal static IReadOnlyDictionary<string, object?> ReadBootstrapStatus(string path, FieldRuntimeAttestation? attestation = null)
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

        var checks = new List<object?>();
        var reported = new List<string>();
        var failed = new List<string>();
        foreach (var check in root.GetProperty("checks").EnumerateArray())
        {
            checks.Add(check.Clone());
            var name = check.GetProperty("name").GetString();
            if (name is null) continue;
            reported.Add(name);
            if (!check.GetProperty("passed").GetBoolean()) failed.Add(name);
        }

        var reportedAt = root.GetProperty("reportedAt").GetString();

        // Without the agent's own checks the report can only ever be incomplete,
        // so the host evaluator returns not_ready forever. Contribute them once
        // the heartbeat is genuinely running, and never before: claiming
        // heartbeat_started early would turn an incomplete report into a false one.
        if (attestation is { } runtime)
        {
            var observedAt = WireDate(DateTimeOffset.UtcNow);
            foreach (var (name, passed, summary) in new[]
            {
                ("secure_desktop_inactive", !runtime.SecureDesktopActive, "Secure desktop activity was checked by the guest agent."),
                ("heartbeat_started", runtime.HeartbeatStarted, "Guest agent heartbeat emission was checked by the guest agent."),
            })
            {
                if (reported.Contains(name)) continue;
                checks.Add(new Dictionary<string, object?>
                {
                    ["name"] = name,
                    ["passed"] = passed,
                    ["observedAt"] = observedAt,
                    ["summary"] = summary,
                    ["evidence"] = new Dictionary<string, object?>(),
                });
                reported.Add(name);
                if (!passed) failed.Add(name);
            }
            // The evaluator requires every check timestamp to fall at or before
            // reportedAt, so the report must be restamped to cover the ones just
            // added.
            reportedAt = observedAt;
        }

        var report = new Dictionary<string, object?>
        {
            ["contractVersion"] = root.GetProperty("contractVersion").GetInt32(),
            ["identity"] = root.GetProperty("identity").Clone(),
            ["manifestDigest"] = root.GetProperty("manifestDigest").GetString(),
            ["reportedAt"] = reportedAt,
            ["checks"] = checks,
        };
        if (root.TryGetProperty("enrollment", out var enrollment))
        {
            report["enrollment"] = enrollment.Clone();
        }

        var complete = MandatoryBootstrapChecks.All(reported.Contains);
        return new Dictionary<string, object?>
        {
            ["status"] = failed.Count > 0 ? "failed" : complete ? "ready" : "not_ready",
            ["manifestDigest"] = root.GetProperty("manifestDigest").GetString(),
            ["failedChecks"] = failed.ToArray(),
            ["report"] = report,
        };
    }

    /// <summary>
    /// Mirrors fieldBootstrapCheckNameSchema. The host evaluator treats any
    /// absent name as missing, so this list must stay in step with it.
    /// </summary>
    private static readonly string[] MandatoryBootstrapChecks =
    {
        "identity", "base_image", "personal_state", "task_disk", "directory_layout",
        "display_contract", "agent_binary", "channel_key", "policy_binding",
        "session_unlocked", "secure_desktop_inactive", "heartbeat_started",
    };

    /// <summary>
    /// Publishes an already signed scene envelope on the guest KVP transport.
    ///
    /// This writes; it never signs. The envelope must already have come through
    /// <see cref="FieldSceneRelayBoundary"/>, so a transport caller cannot introduce a scene
    /// that no policy accepted. The message type and Field binding are checked here as well,
    /// because a writer that will publish anything handed to it is a second signing path in
    /// everything but name.
    /// </summary>
    public static void PublishScene(
        FieldKvpRuntimeConfiguration configuration,
        FieldChannelEnvelope envelope,
        string? callerSid)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(envelope);
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);

        if (envelope.MessageType != FieldChannelMessageType.SceneObservation)
            throw new InvalidOperationException("Only a scene observation envelope may be published on the scene value.");
        if (envelope.Field != configuration.Field)
            throw new InvalidOperationException("Scene envelope is bound to a different Field generation than the channel.");

        using var guestKey = Registry.LocalMachine.CreateSubKey(GuestKvpRegistryPath, writable: true)
            ?? throw new InvalidOperationException("The Hyper-V guest KVP registry key could not be opened.");
        WriteEnvelope(guestKey, SceneValueName, envelope);
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

    internal static uint GetActiveInteractiveSessionId()
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

    private sealed record GuestSequenceState(
        int ContractVersion,
        FieldReference Field,
        string KeyId,
        long NextSequence);
}
