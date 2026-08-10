using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Exosuit.Agent;

/// <summary>
/// What the Field service must establish before it launches the producer into a user's
/// desktop. Every field here is checked against Windows, never taken on trust.
/// </summary>
public sealed record FieldSceneProducerLaunchPolicy(
    int ExpectedSessionId,
    string ExpectedInteractiveUserSid,
    string ProducerExecutablePath,
    string ProducerExecutableSha256);

/// <summary>Facts about a launch that actually happened.</summary>
public sealed record FieldSceneProducerLaunchResult(int ProcessId, int SessionId, string UserSid);

/// <summary>
/// Starts the unprivileged scene producer inside the active interactive session.
///
/// This is the one place where the SYSTEM service crosses into a user's desktop, so it is
/// deliberately narrow: it launches one fixed image, in one expected session, as one expected
/// user, and it drops the service's privilege by running under that user's own token rather
/// than SYSTEM's. It never launches a caller-supplied command line.
///
/// Session zero is refused outright. A service-session process cannot observe the interactive
/// desktop, so allowing it would let a scene be produced from the wrong desktop entirely —
/// the failure the service-session decision in the log exists to prevent.
/// </summary>
public static class FieldSceneProducerLauncher
{
    private const uint TokenDuplicate = 0x0002;
    private const uint TokenQuery = 0x0008;
    private const uint MaximumAllowed = 0x02000000;
    private const uint CreateNoWindow = 0x08000000;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint SecurityImpersonation = 2;
    private const uint TokenPrimary = 1;

    /// <summary>
    /// Validates the launch against Windows without starting anything. Separated so the
    /// decision is testable on its own: the interesting failures are all refusals, and a test
    /// must be able to reach them without a real interactive session.
    /// </summary>
    internal static void ValidateLaunchPolicy(
        FieldSceneProducerLaunchPolicy policy,
        int observedSessionId,
        string? observedUserSid,
        string? callerSid)
    {
        ArgumentNullException.ThrowIfNull(policy);
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);

        if (policy.ExpectedSessionId <= 0 || observedSessionId <= 0)
            throw new InvalidOperationException(
                "Field scene producer must launch into an interactive session; session zero cannot observe a desktop.");
        if (observedSessionId != policy.ExpectedSessionId)
            throw new InvalidOperationException(
                "Field scene producer launch session does not match the expected active interactive session.");

        if (string.IsNullOrWhiteSpace(policy.ExpectedInteractiveUserSid) ||
            !policy.ExpectedInteractiveUserSid.StartsWith("S-1-5-21-", StringComparison.Ordinal))
            throw new InvalidOperationException("Field scene producer requires an exact local interactive-user SID.");
        _ = new SecurityIdentifier(policy.ExpectedInteractiveUserSid);
        if (!string.Equals(observedUserSid, policy.ExpectedInteractiveUserSid, StringComparison.Ordinal))
            throw new InvalidOperationException(
                "Field scene producer session belongs to a different user than the approved interactive owner.");

        ValidateProducerImage(policy);
    }

    /// <summary>
    /// The image is pinned by path and by digest, and the digest is taken from the file that
    /// is about to run. Checking a path alone would let a replaced binary inherit the
    /// producer's standing; checking a digest supplied by the caller would prove nothing.
    /// </summary>
    private static void ValidateProducerImage(FieldSceneProducerLaunchPolicy policy)
    {
        if (policy.ProducerExecutableSha256.Length != 64 ||
            policy.ProducerExecutableSha256.Any(character =>
                character is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')))
            throw new InvalidOperationException("Field scene producer digest must be lowercase SHA-256.");
        if (!File.Exists(policy.ProducerExecutablePath))
            throw new InvalidOperationException("Field scene producer image is missing.");

        // Opened without delete sharing so the file cannot be swapped between hashing and
        // launching.
        using var stream = new FileStream(
            policy.ProducerExecutablePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var actual = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.ASCII.GetBytes(actual),
                System.Text.Encoding.ASCII.GetBytes(policy.ProducerExecutableSha256)))
            throw new InvalidOperationException("Field scene producer image digest does not match the approved producer.");
    }

    public static FieldSceneProducerLaunchResult Launch(FieldSceneProducerLaunchPolicy policy) =>
        Launch(policy, WindowsIdentity.GetCurrent().User?.Value);

    internal static FieldSceneProducerLaunchResult Launch(
        FieldSceneProducerLaunchPolicy policy,
        string? callerSid)
    {
        ArgumentNullException.ThrowIfNull(policy);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Field scene producer launch requires Windows.");
        FieldGuestServiceHost.AssertSystemIdentity(callerSid);

        var sessionId = checked((int)FieldKvpRuntime.GetActiveInteractiveSessionId());
        if (!WTSQueryUserToken(checked((uint)sessionId), out var sessionToken))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        using (sessionToken)
        {
            string? observedSid;
            using (var identity = new WindowsIdentity(sessionToken.DangerousGetHandle()))
            {
                observedSid = identity.User?.Value;
            }

            // Every refusal happens before a process exists. There is no partially launched
            // state to unwind.
            ValidateLaunchPolicy(policy, sessionId, observedSid, callerSid);

            if (!DuplicateTokenEx(
                    sessionToken, MaximumAllowed, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out var primaryToken))
                throw new Win32Exception(Marshal.GetLastWin32Error());

            using (primaryToken)
            {
                var startupInfo = new StartupInfo
                {
                    cb = Marshal.SizeOf<StartupInfo>(),
                    // The producer belongs on the interactive desktop; naming it explicitly
                    // stops it from inheriting the service window station.
                    lpDesktop = @"winsta0\default",
                };

                if (!CreateProcessAsUser(
                        primaryToken,
                        policy.ProducerExecutablePath,
                        null,
                        IntPtr.Zero,
                        IntPtr.Zero,
                        bInheritHandles: false,
                        CreateNoWindow | CreateUnicodeEnvironment,
                        IntPtr.Zero,
                        Path.GetDirectoryName(policy.ProducerExecutablePath),
                        ref startupInfo,
                        out var processInformation))
                    throw new Win32Exception(Marshal.GetLastWin32Error());

                try
                {
                    return new FieldSceneProducerLaunchResult(processInformation.dwProcessId, sessionId, observedSid!);
                }
                finally
                {
                    if (processInformation.hProcess != IntPtr.Zero) CloseHandle(processInformation.hProcess);
                    if (processInformation.hThread != IntPtr.Zero) CloseHandle(processInformation.hThread);
                }
            }
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr hProcess, hThread;
        public int dwProcessId, dwThreadId;
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQueryUserToken(uint sessionId, out SafeAccessTokenHandle token);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DuplicateTokenEx(
        SafeAccessTokenHandle existingToken,
        uint desiredAccess,
        IntPtr tokenAttributes,
        uint impersonationLevel,
        uint tokenType,
        out SafeAccessTokenHandle newToken);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessAsUser(
        SafeAccessTokenHandle token,
        string? applicationName,
        string? commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool bInheritHandles,
        uint creationFlags,
        IntPtr environment,
        string? currentDirectory,
        ref StartupInfo startupInfo,
        out ProcessInformation processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
}
