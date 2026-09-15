using System.Security.Principal;
using System.ServiceProcess;

namespace Exosuit.FieldOwner;

internal static class FieldOwnerServiceHost
{
    internal static void AssertSystemIdentity(string? sid)
    {
        if (!string.Equals(sid, FieldOwnerPaths.SystemSid, StringComparison.Ordinal))
            throw new InvalidOperationException("Field owner service must run as local SYSTEM.");
    }

    internal static int Run()
    {
        if (!OperatingSystem.IsWindows()) throw new InvalidOperationException("Field owner service is supported only on Windows.");
        ServiceBase.Run(new FieldOwnerWindowsService());
        return 0;
    }

    private sealed class FieldOwnerWindowsService : ServiceBase
    {
        private CancellationTokenSource? cancellation;
        private Task? worker;
        private bool stopping;

        internal FieldOwnerWindowsService()
        {
            ServiceName = FieldOwnerPaths.ServiceName;
            CanStop = true;
            CanShutdown = true;
            AutoLog = false;
        }

        protected override void OnStart(string[] args)
        {
            AssertSystemIdentity(WindowsIdentity.GetCurrent().User?.Value);
            var policy = FieldOwnerPolicyStore.Load(FieldOwnerPaths.PolicyPath);
            FieldOwnerPolicyStore.ValidateInstalledFiles(policy);
            cancellation = new CancellationTokenSource();
            worker = RunLoopAsync(cancellation.Token);
            _ = MonitorWorkerAsync(worker);
        }

        protected override void OnStop() => StopWorker();
        protected override void OnShutdown() => StopWorker();

        private static async Task RunLoopAsync(CancellationToken cancellationToken)
        {
            var processor = new FieldOwnerQueueProcessor(FieldOwnerPaths.PolicyPath);
            while (!cancellationToken.IsCancellationRequested)
            {
                await processor.ProcessAvailableAsync(cancellationToken).ConfigureAwait(false);
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);
            }
        }

        private async Task MonitorWorkerAsync(Task runningWorker)
        {
            try { await runningWorker.ConfigureAwait(false); }
            catch (OperationCanceledException) when (stopping) { return; }
            catch
            {
                if (!stopping)
                {
                    ExitCode = 1;
                    Stop();
                }
            }
        }

        private void StopWorker()
        {
            stopping = true;
            cancellation?.Cancel();
            try { worker?.Wait(TimeSpan.FromSeconds(15)); }
            catch (AggregateException exception) when (exception.InnerExceptions.All(item => item is OperationCanceledException or TaskCanceledException)) { }
            cancellation?.Dispose();
            cancellation = null;
            worker = null;
        }
    }
}
