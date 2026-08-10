using System.Security.Cryptography;

namespace Exosuit.Agent.Tests;

public sealed class FieldSceneProducerLauncherTests : IDisposable
{
    private const string ApprovedSid = "S-1-5-21-1000-1000-1000-1001";

    private readonly string imagePath = Path.Combine(Path.GetTempPath(), $"exosuit-producer-{Guid.NewGuid():N}.bin");
    private readonly string imageDigest;

    public FieldSceneProducerLauncherTests()
    {
        File.WriteAllBytes(imagePath, "producer"u8.ToArray());
        using var stream = File.OpenRead(imagePath);
        imageDigest = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public void Dispose()
    {
        if (File.Exists(imagePath)) File.Delete(imagePath);
    }

    private FieldSceneProducerLaunchPolicy Policy(
        int sessionId = 2,
        string sid = ApprovedSid,
        string? path = null,
        string? digest = null) =>
        new(sessionId, sid, path ?? imagePath, digest ?? imageDigest);

    [Fact]
    public void AcceptsAnExactMatchingInteractiveLaunch()
    {
        if (!OperatingSystem.IsWindows()) return;
        FieldSceneProducerLauncher.ValidateLaunchPolicy(
            Policy(), observedSessionId: 2, ApprovedSid, FieldGuestServiceHost.SystemSid);
    }

    [Fact]
    public void RejectsNonSystemCaller()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(Policy(), 2, ApprovedSid, ApprovedSid));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void RejectsSessionZeroAsExpectedSession(int sessionId)
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(sessionId), sessionId, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsSessionZeroEvenWhenThePolicyExpectsAnInteractiveSession()
    {
        if (!OperatingSystem.IsWindows()) return;
        // A service-session process cannot observe the interactive desktop, so an observed
        // session of zero must fail closed regardless of what the policy hoped for.
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(sessionId: 2), observedSessionId: 0, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsASessionThatIsNotTheExpectedOne()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(sessionId: 2), observedSessionId: 3, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("S-1-5-18")]
    [InlineData("S-1-1-0")]
    public void RejectsAnyNonInteractiveApprovedSid(string sid)
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(sid: sid), 2, sid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsASessionOwnedByADifferentUser()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(), 2, "S-1-5-21-1000-1000-1000-9999", FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsAMissingProducerImage()
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(path: Path.Combine(Path.GetTempPath(), $"absent-{Guid.NewGuid():N}.bin")),
                2, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsAReplacedProducerImageAtTheApprovedPath()
    {
        if (!OperatingSystem.IsWindows()) return;
        var policy = Policy();
        File.WriteAllBytes(imagePath, "replaced"u8.ToArray());

        // Path alone is not identity: the digest is recomputed from the file about to run.
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(policy, 2, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Theory]
    [InlineData("not-a-digest")]
    [InlineData("ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789")]
    public void RejectsADigestThatIsNotLowercaseSha256(string digest)
    {
        if (!OperatingSystem.IsWindows()) return;
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.ValidateLaunchPolicy(
                Policy(digest: digest), 2, ApprovedSid, FieldGuestServiceHost.SystemSid));
    }

    [Fact]
    public void RejectsANonSystemCallerBeforeTouchingTheSession()
    {
        if (!OperatingSystem.IsWindows()) return;
        // Launch must refuse on identity before it queries any user token.
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneProducerLauncher.Launch(Policy(), ApprovedSid));
    }
}
