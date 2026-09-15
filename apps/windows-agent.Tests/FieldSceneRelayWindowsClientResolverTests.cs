using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Principal;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneRelayWindowsClientResolverTests
{
    [Fact]
    public void RejectsNonSystemCallerBeforeInspectingPipe()
    {
        if (!OperatingSystem.IsWindows()) return;
        using var pipe = new NamedPipeServerStream($"exosuit-scene-test-{Guid.NewGuid():N}");
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneRelayWindowsClientResolver.ResolveConnectedClient(pipe, "S-1-5-21-1000-1000-1000-1001"));
    }

    [Fact]
    public void RejectsDisconnectedPipeEvenForSystemBoundaryIdentity()
    {
        if (!OperatingSystem.IsWindows()) return;
        using var pipe = new NamedPipeServerStream($"exosuit-scene-test-{Guid.NewGuid():N}");
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneRelayWindowsClientResolver.ResolveConnectedClient(pipe, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task DerivesPidSessionSidPathAndDigestFromConnectedPipeClient()
    {
        if (!OperatingSystem.IsWindows()) return;
        var name = $"exosuit-scene-test-{Guid.NewGuid():N}";
        await using var server = new NamedPipeServerStream(name, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        await using var client = new NamedPipeClientStream(".", name, PipeDirection.Out, PipeOptions.Asynchronous);
        var accept = server.WaitForConnectionAsync();
        await client.ConnectAsync(5_000);
        await accept;

        var facts = FieldSceneRelayWindowsClientResolver.ResolveConnectedClient(server, FieldGuestServiceHost.SystemSid);

        Assert.Equal(Environment.ProcessId, facts.ProcessId);
        Assert.Equal(Process.GetCurrentProcess().SessionId, facts.WindowsSessionId);
        Assert.Equal(WindowsIdentity.GetCurrent().User?.Value, facts.UserSid);
        Assert.Equal(Path.GetFullPath(Environment.ProcessPath!), Path.GetFullPath(facts.ExecutablePath), ignoreCase: true);
        Assert.Matches("^[0-9a-f]{64}$", facts.ExecutableSha256);
    }
}
