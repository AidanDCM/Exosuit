using System.Buffers.Binary;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneRelayPipeServerTests
{
    private static readonly FieldReference Field = new(Guid.Parse("4401b702-334f-475e-b867-b7d06798443d"), 3);
    private static readonly Guid NameBindingBootId = Guid.Parse("29a19dbc-5021-4dc3-8979-0026660fad17");

    // Per-test boot identity. The pipe name is derived from it, so sharing one value across the
    // class makes every LocalWindows test here contend for a single pipe name — which surfaces
    // as an intermittent UnauthorizedAccessException at pipe creation, not as a clear collision.
    private readonly Guid BootId = Guid.NewGuid();

    private static string CurrentUserSid() => WindowsIdentity.GetCurrent().User!.Value;

    private FieldSceneRelayPipeServer CreateIntake() =>
        new(Field, BootId, CurrentUserSid(), FieldGuestServiceHost.SystemSid);

    [Fact]
    public void RejectsNonSystemCallerBeforeOwningAPipeName()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            new FieldSceneRelayPipeServer(Field, BootId, CurrentUserSid(), "S-1-5-21-1000-1000-1000-1001"));
    }

    [Fact]
    public void RejectsEmptyBootIdentity()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            new FieldSceneRelayPipeServer(Field, Guid.Empty, CurrentUserSid(), FieldGuestServiceHost.SystemSid));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("S-1-5-18")]
    [InlineData("S-1-1-0")]
    public void RejectsAnyNonInteractiveProducerSid(string sid)
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            new FieldSceneRelayPipeServer(Field, BootId, sid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void PipeNameBindsExactGenerationAndBoot()
    {
        if (!OperatingSystem.IsWindows()) return;
        var name = FieldSceneRelayPipeServer.BuildPipeName(Field, NameBindingBootId);

        Assert.Contains(Field.FieldId.ToString("N"), name, StringComparison.Ordinal);
        Assert.Contains($".g{Field.FieldGeneration}.", name, StringComparison.Ordinal);
        Assert.Contains(NameBindingBootId.ToString("N"), name, StringComparison.Ordinal);

        // A neighbouring generation and a different boot must not collide with this intake.
        Assert.NotEqual(name, FieldSceneRelayPipeServer.BuildPipeName(Field with { FieldGeneration = 4 }, NameBindingBootId));
        Assert.NotEqual(name, FieldSceneRelayPipeServer.BuildPipeName(Field, Guid.NewGuid()));
    }

    [Fact]
    public async Task AclGrantsOnlySystemAndTheOneApprovedProducer()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();
        var rules = intake.BuildSecurity()
            .GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier))
            .Cast<PipeAccessRule>()
            .ToArray();

        Assert.All(rules, rule => Assert.Equal(AccessControlType.Allow, rule.AccessControlType));

        var granted = rules.Select(rule => rule.IdentityReference.Value).ToHashSet(StringComparer.Ordinal);
        Assert.Equal(
            new HashSet<string>(new[] { "S-1-5-18", CurrentUserSid() }, StringComparer.Ordinal),
            granted);

        // Nothing broad is named, so the default deny covers everyone else.
        Assert.DoesNotContain("S-1-1-0", granted);            // Everyone
        Assert.DoesNotContain("S-1-5-11", granted);           // Authenticated Users
        Assert.DoesNotContain("S-1-5-32-544", granted);       // Administrators
        Assert.DoesNotContain("S-1-5-7", granted);            // Anonymous

        // The producer writes; it may never read another producer's frames.
        var producer = Assert.Single(rules, rule => rule.IdentityReference.Value == CurrentUserSid());
        Assert.True(producer.PipeAccessRights.HasFlag(PipeAccessRights.Write));
        Assert.True(producer.PipeAccessRights.HasFlag(PipeAccessRights.Synchronize));
        Assert.False(producer.PipeAccessRights.HasFlag(PipeAccessRights.ReadData));
        Assert.False(producer.PipeAccessRights.HasFlag(PipeAccessRights.ReadExtendedAttributes));
        Assert.False(producer.PipeAccessRights.HasFlag(PipeAccessRights.ChangePermissions));
        Assert.False(producer.PipeAccessRights.HasFlag(PipeAccessRights.TakeOwnership));

        // It may not stand up a rival server instance on this name and squat the intake.
        Assert.False(producer.PipeAccessRights.HasFlag(PipeAccessRights.CreateNewInstance));
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task AcceptsExactlyOneBoundedFrameAndDerivesClientFromWindows()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();
        var payload = "{\"contract_version\":1}"u8.ToArray();

        var accept = intake.AcceptSingleFrameAsync();
        await WriteFrameAsync(intake.PipeName, payload, payload.Length);
        var frame = await accept;

        Assert.Equal(payload, frame.PayloadUtf8);
        Assert.Equal(Environment.ProcessId, frame.Client.ProcessId);
        Assert.Equal(CurrentUserSid(), frame.Client.UserSid);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task SpendsTheConnectionBudgetEvenAfterASuccessfulFrame()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();
        var payload = "{\"contract_version\":1}"u8.ToArray();

        var accept = intake.AcceptSingleFrameAsync();
        await WriteFrameAsync(intake.PipeName, payload, payload.Length);
        await accept;

        Assert.True(intake.ConnectionSpent);
        await Assert.ThrowsAsync<InvalidOperationException>(() => intake.AcceptSingleFrameAsync());
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task SpendsTheConnectionBudgetEvenWhenTheFrameIsRejected()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();

        // Declares more than the structural bound: rejected before any payload byte is read.
        var accept = intake.AcceptSingleFrameAsync();
        await WriteFrameAsync(intake.PipeName, Array.Empty<byte>(), FieldSceneRelayPipeServer.MaximumFrameBytes + 1);
        await Assert.ThrowsAsync<InvalidOperationException>(() => accept);

        // A rejected frame must not hand the caller a fresh attempt on the same instance.
        await Assert.ThrowsAsync<InvalidOperationException>(() => intake.AcceptSingleFrameAsync());
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task RejectsAZeroLengthDeclaration()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();

        var accept = intake.AcceptSingleFrameAsync();
        await WriteFrameAsync(intake.PipeName, Array.Empty<byte>(), 0);
        await Assert.ThrowsAsync<InvalidOperationException>(() => accept);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task RejectsAFrameTruncatedBeforeItsDeclaredLength()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();

        var accept = intake.AcceptSingleFrameAsync();
        // Declares 64 bytes, sends 8, then closes.
        await WriteFrameAsync(intake.PipeName, new byte[8], 64);
        await Assert.ThrowsAsync<InvalidOperationException>(() => accept);
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public async Task RejectsASecondFrameOnTheSameConnection()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var intake = CreateIntake();
        var payload = "{\"contract_version\":1}"u8.ToArray();

        var accept = intake.AcceptSingleFrameAsync();
        await using (var client = new NamedPipeClientStream(".", intake.PipeName, PipeDirection.Out, PipeOptions.Asynchronous))
        {
            await client.ConnectAsync(5_000);
            await client.WriteAsync(Header(payload.Length));
            await client.WriteAsync(payload);

            // The second frame may not finish writing. The intake rejects as soon as it sees a
            // byte past the declared payload and disposes the pipe, so the client can legitimately
            // observe a broken pipe mid-write. That prompt rejection is the behaviour under test,
            // not a race to be waited out — an intake that let the whole second frame land before
            // reacting would be the worse outcome.
            try
            {
                await client.WriteAsync(Header(payload.Length));
                await client.WriteAsync(payload);
                await client.FlushAsync();
            }
            catch (IOException)
            {
                // Rejected before the write completed.
            }
        }

        await Assert.ThrowsAsync<InvalidOperationException>(() => accept);
    }

    private static byte[] Header(int declaredLength)
    {
        var header = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(header, (uint)declaredLength);
        return header;
    }

    private static async Task WriteFrameAsync(string pipeName, byte[] body, int declaredLength)
    {
        await using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.Out, PipeOptions.Asynchronous);
        await client.ConnectAsync(5_000);
        await client.WriteAsync(Header(declaredLength));
        if (body.Length > 0) await client.WriteAsync(body);
        await client.FlushAsync();
    }
}
