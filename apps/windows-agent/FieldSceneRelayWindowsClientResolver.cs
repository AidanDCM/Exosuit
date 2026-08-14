using System.ComponentModel;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Exosuit.Agent;

public static class FieldSceneRelayWindowsClientResolver
{
    private const uint TokenQuery = 0x0008;

    public static FieldSceneRelayClientFacts ResolveConnectedClient(NamedPipeServerStream pipe) =>
        ResolveConnectedClient(pipe, WindowsIdentity.GetCurrent().User?.Value);

    internal static FieldSceneRelayClientFacts ResolveConnectedClient(
        NamedPipeServerStream pipe,
        string? relayCallerSid,
        Action<string>? recordStage = null)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene relay client resolution requires Windows.");
        FieldGuestServiceHost.AssertSystemIdentity(relayCallerSid);
        if (!pipe.IsConnected)
            throw new InvalidOperationException("Field scene relay pipe has no connected client.");
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out var processId) || processId == 0)
            throw new InvalidOperationException("Field scene relay could not resolve the connected pipe client process.");
        recordStage?.Invoke("client_pid_resolved");

        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            recordStage?.Invoke("client_process_opened");
            var sessionId = process.SessionId;
            var executablePath = process.MainModule?.FileName;
            if (sessionId <= 0 || string.IsNullOrWhiteSpace(executablePath))
                throw new InvalidOperationException("Field scene relay client is not an interactive process with a resolvable image.");
            recordStage?.Invoke("client_image_resolved");

            if (!OpenProcessToken(process.SafeHandle, TokenQuery, out var token))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            recordStage?.Invoke("client_token_opened");
            using (token)
            using (var identity = new WindowsIdentity(token.DangerousGetHandle()))
            {
                var userSid = identity.User?.Value;
                if (string.IsNullOrWhiteSpace(userSid))
                    throw new InvalidOperationException("Field scene relay client user SID could not be resolved.");
                recordStage?.Invoke("client_sid_resolved");
                // Open without write/delete sharing while the connected process identity is live.
                // Hashing the large self-contained image may outlast the one-shot sender, but the
                // pinned handle guarantees the verified bytes cannot change or be replaced.
                using var executable = new FileStream(
                    executablePath, FileMode.Open, FileAccess.Read, FileShare.Read);
                recordStage?.Invoke("client_image_pinned");
                var digest = HashPinnedExecutable(executable);
                recordStage?.Invoke("client_image_hashed");
                return new FieldSceneRelayClientFacts(checked((int)processId), sessionId, userSid, executablePath, digest);
            }
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException or Win32Exception)
        {
            throw new InvalidOperationException("Field scene relay could not resolve one stable connected-client identity.", exception);
        }
    }

    private static string HashPinnedExecutable(Stream pinnedExecutable) =>
        Convert.ToHexString(SHA256.HashData(pinnedExecutable)).ToLowerInvariant();

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint clientProcessId);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenProcessToken(SafeProcessHandle process, uint desiredAccess, out SafeAccessTokenHandle token);
}
