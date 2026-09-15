using System.Diagnostics;

namespace Exosuit.Agent.Tests;

public sealed class FieldGuestServiceHostTests
{
    [Fact]
    public void FixedLauncherUsesNoShellAndOnlyReviewedPaths()
    {
        ProcessStartInfo startInfo = FieldGuestServiceHost.CreateLaunchProcessStartInfo();

        Assert.Equal(@"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", startInfo.FileName);
        Assert.False(startInfo.UseShellExecute);
        Assert.True(startInfo.CreateNoWindow);
        Assert.Equal(@"C:\Exosuit\Agent", startInfo.WorkingDirectory);
        Assert.Equal(new[]
        {
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
            @"C:\Exosuit\Agent\Start-ExosuitFieldGuest.ps1", "-LaunchConfigPath",
            @"C:\Exosuit\Config\guest-launch.json",
        }, startInfo.ArgumentList);
    }

    [Fact]
    public void ServiceIdentityIsLocalSystemOnly()
    {
        FieldGuestServiceHost.AssertSystemIdentity("S-1-5-18");
        Assert.Throws<InvalidOperationException>(() => FieldGuestServiceHost.AssertSystemIdentity(null));
        Assert.Throws<InvalidOperationException>(() => FieldGuestServiceHost.AssertSystemIdentity("S-1-5-21-1000"));
    }

    [Fact]
    public void ServiceIdentityAndModeAreCanonical()
    {
        Assert.Equal("ExosuitFieldGuest", FieldGuestServiceHost.ServiceName);
        Assert.Equal("S-1-5-18", FieldGuestServiceHost.SystemSid);
    }
}
