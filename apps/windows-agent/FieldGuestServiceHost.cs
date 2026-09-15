using System.Diagnostics;
using System.Security.Principal;
using System.ServiceProcess;

namespace Exosuit.Agent;

internal static class FieldGuestServiceHost
{
    internal const string ServiceName = "ExosuitFieldGuest";
    internal const string SystemSid = "S-1-5-18";
    internal const string PowerShellPath = @"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    internal const string LaunchScriptPath = @"C:\Exosuit\Agent\Start-ExosuitFieldGuest.ps1";
    internal const string LaunchConfigurationPath = @"C:\Exosuit\Config\guest-launch.json";

    internal static void AssertSystemIdentity(string? sid)
    {
        if (!string.Equals(sid, SystemSid, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Field guest service must run as local SYSTEM.");
        }
    }

    internal static ProcessStartInfo CreateLaunchProcessStartInfo()
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = PowerShellPath,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = @"C:\Exosuit\Agent",
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-NonInteractive");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(LaunchScriptPath);
        startInfo.ArgumentList.Add("-LaunchConfigPath");
        startInfo.ArgumentList.Add(LaunchConfigurationPath);
        return startInfo;
    }

    internal static int Run()
    {
        if (!OperatingSystem.IsWindows())
        {
            throw new InvalidOperationException("Field guest service is supported only on Windows.");
        }

        ServiceBase.Run(new FieldGuestWindowsService());
        return 0;
    }

    private sealed class FieldGuestWindowsService : ServiceBase
    {
        private readonly object gate = new();
        private Process? child;
        private bool stopping;

        internal FieldGuestWindowsService()
        {
            ServiceName = FieldGuestServiceHost.ServiceName;
            CanStop = true;
            CanShutdown = true;
            AutoLog = false;
        }

        protected override void OnStart(string[] args)
        {
            AssertSystemIdentity(WindowsIdentity.GetCurrent().User?.Value);
            foreach (var path in new[] { LaunchScriptPath, LaunchConfigurationPath })
            {
                if (!File.Exists(path))
                {
                    throw new InvalidOperationException($"Required Field guest service file is missing: {path}");
                }
            }

            var started = Process.Start(CreateLaunchProcessStartInfo())
                ?? throw new InvalidOperationException("Field guest service could not start its fixed launcher.");
            lock (gate)
            {
                if (stopping)
                {
                    started.Kill(entireProcessTree: true);
                    throw new InvalidOperationException("Field guest service was stopped during startup.");
                }
                child = started;
            }
            _ = MonitorChildAsync(started);
        }

        protected override void OnStop() => StopChild();

        protected override void OnShutdown() => StopChild();

        private async Task MonitorChildAsync(Process process)
        {
            await process.WaitForExitAsync().ConfigureAwait(false);
            var stopService = false;
            lock (gate)
            {
                if (ReferenceEquals(child, process))
                {
                    child = null;
                    stopService = !stopping;
                }
            }
            if (stopService)
            {
                ExitCode = process.ExitCode == 0 ? 1 : process.ExitCode;
                Stop();
            }
            process.Dispose();
        }

        private void StopChild()
        {
            Process? process;
            lock (gate)
            {
                stopping = true;
                process = child;
                child = null;
            }
            if (process is null)
            {
                return;
            }
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(10_000);
                }
            }
            catch (InvalidOperationException)
            {
                // The monitor owns disposal; an already-exited child is terminal.
            }
        }
    }
}
