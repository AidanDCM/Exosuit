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
        string? relayCallerSid)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene relay client resolution requires Windows.");
        FieldGuestServiceHost.AssertSystemIdentity(relayCallerSid);
        if (!pipe.IsConnected)
            throw new InvalidOperationException("Field scene relay pipe has no connected client.");
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle, out var processId) || processId == 0)
            throw new InvalidOperationException("Field scene relay could not resolve the connected pipe client process.");

        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            var sessionId = process.SessionId;
            var executablePath = process.MainModule?.FileName;
            if (sessionId <= 0 || string.IsNullOrWhiteSpace(executablePath))
                throw new InvalidOperationException("Field scene relay client is not an interactive process with a resolvable image.");

            if (!OpenProcessToken(process.SafeHandle, TokenQuery, out var token))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            using (token)
            using (var identity = new WindowsIdentity(token.DangerousGetHandle()))
            {
                var userSid = identity.User?.Value;
                if (string.IsNullOrWhiteSpace(userSid))
                    throw new InvalidOperationException("Field scene relay client user SID could not be resolved.");
                var digest = HashPinnedExecutable(executablePath);
                if (process.HasExited)
                    throw new InvalidOperationException("Field scene relay client exited while its identity was being resolved.");
                return new FieldSceneRelayClientFacts(checked((int)processId), sessionId, userSid, executablePath, digest);
            }
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException or Win32Exception)
        {
            throw new InvalidOperationException("Field scene relay could not resolve one stable connected-client identity.", exception);
        }
    }

    private static string HashPinnedExecutable(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe, out uint clientProcessId);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenProcessToken(SafeProcessHandle process, uint desiredAccess, out SafeAccessTokenHandle token);
}
