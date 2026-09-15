using System.Diagnostics;

namespace Exosuit.Agent.Tests;

/// <summary>
/// Covers the parts of the Windows scene environment that can be exercised without a guest:
/// real process liveness and real termination. Lock and Secure Desktop detection still cannot
/// be proven here — a test cannot lock the developer's own desktop — so those remain live-only.
/// </summary>
public sealed class WindowsFieldSceneEnvironmentTests : IDisposable
{
    private static readonly Guid BootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");

    private readonly List<Process> spawned = [];

    public void Dispose()
    {
        foreach (var process in spawned)
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch (InvalidOperationException)
            {
                // Already gone.
            }
            process.Dispose();
        }
    }

    private Process SpawnLongRunning()
    {
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = @"C:\Windows\System32\cmd.exe",
            Arguments = "/c timeout /t 120 /nobreak",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
        }) ?? throw new InvalidOperationException("Could not spawn a test process.");
        spawned.Add(process);
        return process;
    }

    private static WindowsFieldSceneEnvironment Environment() => new(BootId);

    [Fact]
    public void ReportsTheConfiguredBootIdentity()
    {
        Assert.Equal(BootId, Environment().CurrentBootId());
    }

    [Fact]
    public void ReportsTheCurrentProcessAsAlive()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.True(Environment().IsProducerAlive(System.Environment.ProcessId));
    }

    [Fact]
    public void ReportsASpawnedProcessAsAlive()
    {
        if (!OperatingSystem.IsWindows()) return;
        var process = SpawnLongRunning();
        Assert.True(Environment().IsProducerAlive(process.Id));
    }

    [Fact]
    public async Task ReportsAnExitedProcessAsNotAlive()
    {
        if (!OperatingSystem.IsWindows()) return;
        var process = SpawnLongRunning();
        var pid = process.Id;

        process.Kill(entireProcessTree: true);
        await process.WaitForExitAsync();

        // A dead producer must never read as healthy, whether Windows still holds a handle
        // record for it or not.
        Assert.False(Environment().IsProducerAlive(pid));
    }

    [Fact]
    public void ReportsAProcessThatNeverExistedAsNotAlive()
    {
        if (!OperatingSystem.IsWindows()) return;
        // A PID that cannot be resolved is absence, not an error the supervisor should swallow
        // as health.
        Assert.False(Environment().IsProducerAlive(0x7FFFFFFF));
    }

    [Fact]
    public async Task TerminatesARealProducer()
    {
        if (!OperatingSystem.IsWindows()) return;
        var process = SpawnLongRunning();
        var environment = Environment();
        Assert.True(environment.IsProducerAlive(process.Id));

        environment.TerminateProducer(process.Id);
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(15));

        Assert.True(process.HasExited);
        Assert.False(environment.IsProducerAlive(process.Id));
    }

    [Fact]
    public void TerminatingAnAbsentProducerIsNotAnError()
    {
        if (!OperatingSystem.IsWindows()) return;
        // Teardown runs on a PID the lifecycle may already have forgotten; a process that is
        // already gone cannot be orphaned and must not fail the teardown.
        Environment().TerminateProducer(0x7FFFFFFF);
    }

    [Fact]
    public async Task TerminatingAnAlreadyExitedProducerIsNotAnError()
    {
        if (!OperatingSystem.IsWindows()) return;
        var process = SpawnLongRunning();
        var pid = process.Id;
        process.Kill(entireProcessTree: true);
        await process.WaitForExitAsync();

        Environment().TerminateProducer(pid);
    }

    [Fact]
    public void ObservesDesktopStateForTheCurrentSessionWithoutThrowing()
    {
        if (!OperatingSystem.IsWindows()) return;
        var sessionId = Process.GetCurrentProcess().SessionId;

        var desktop = Environment().ObserveDesktop(sessionId);

        // The values depend on the developer's own desktop, so only the shape and the
        // successful probe are asserted. Real lock and Secure Desktop transitions are live-only.
        Assert.NotNull(desktop);
        Assert.IsType<bool>(desktop.SessionLocked);
        Assert.IsType<bool>(desktop.SecureDesktopActive);
    }

    [Fact]
    public void TreatsAnInvalidSessionAsLocked()
    {
        if (!OperatingSystem.IsWindows()) return;
        // An unresolvable session must fail closed: unknown is not unlocked.
        var desktop = Environment().ObserveDesktop(0x7FFFFFFF);
        Assert.True(desktop.SessionLocked);
    }
}
