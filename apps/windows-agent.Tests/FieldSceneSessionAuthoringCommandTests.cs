using System.Security.Cryptography;
using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The property that matters most here is the round trip: whatever this command writes must be
/// something `FieldSceneSessionConfiguration.ReadOptional` — the guest runtime's own reader —
/// accepts unchanged. Authoring that produced a file the guest silently declined would be worse
/// than no tool at all.
/// </summary>
public sealed class FieldSceneSessionAuthoringCommandTests : IDisposable
{
    private const string ApprovedSid = "S-1-5-21-1000-1000-1000-1001";

    private readonly string root = Directory.CreateTempSubdirectory("exosuit-authoring-").FullName;
    private readonly string producerPath;
    private readonly string producerDigest;

    public FieldSceneSessionAuthoringCommandTests()
    {
        producerPath = Path.Combine(root, "Exosuit.Agent.exe");
        File.WriteAllBytes(producerPath, "producer-image"u8.ToArray());
        using var stream = File.OpenRead(producerPath);
        producerDigest = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public void Dispose() => Directory.Delete(root, recursive: true);

    private FieldSceneSessionAuthoringRequest Request(
        int sessionId = 2,
        string sid = ApprovedSid,
        int pollInterval = 1_000,
        bool enabled = true,
        string? path = null) =>
        new(1, enabled, sessionId, sid, path ?? producerPath,
            new FieldDisplayContract(1, 1920, 1080, 100, 100, "en-US", false), pollInterval);

    private string WriteRequest(object request)
    {
        var path = Path.Combine(root, $"request-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(request, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        return path;
    }

    [Fact]
    public void ComputesTheDigestFromTheProducerImage()
    {
        var configuration = FieldSceneSessionAuthoringCommand.Author(Request());

        Assert.Equal(producerDigest, configuration.ProducerExecutableSha256);
    }

    [Fact]
    public void RecomputesTheDigestWhenTheImageChanges()
    {
        var first = FieldSceneSessionAuthoringCommand.Author(Request());
        File.WriteAllBytes(producerPath, "replaced-image"u8.ToArray());
        var second = FieldSceneSessionAuthoringCommand.Author(Request());

        Assert.NotEqual(first.ProducerExecutableSha256, second.ProducerExecutableSha256);
    }

    [Fact]
    public void RefusesToAuthorAgainstAMissingProducerImage()
    {
        var absent = Path.Combine(root, "absent.exe");

        // Authoring a config whose digest cannot be computed would produce a file the launcher is
        // guaranteed to reject later, on the guest, where it is far more expensive to notice.
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Author(Request(path: absent)));
    }

    [Fact]
    public void RejectsARequestThatTriesToSupplyItsOwnDigest()
    {
        var path = WriteRequest(new
        {
            contractVersion = 1, enabled = true, expectedSessionId = 2,
            interactiveUserSid = ApprovedSid, producerExecutablePath = producerPath,
            producerExecutableSha256 = new string('a', 64),
            display = new
            {
                monitorCount = 1, width = 1920, height = 1080, scalePercent = 100,
                browserZoomPercent = 100, keyboardLayout = "en-US", dynamicResolutionAllowed = false,
            },
            pollIntervalMilliseconds = 1_000,
        });

        // Rejected rather than ignored, so a caller who believes they are pinning a digest is told
        // they are not.
        Assert.ThrowsAny<Exception>(() => FieldSceneSessionAuthoringCommand.ReadRequest(path));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void RefusesSessionZeroAtAuthoringTime(int sessionId)
    {
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Author(Request(sessionId: sessionId)));
    }

    [Theory]
    [InlineData("S-1-5-18")]
    [InlineData("S-1-1-0")]
    [InlineData("")]
    public void RefusesANonInteractiveSidAtAuthoringTime(string sid)
    {
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Author(Request(sid: sid)));
    }

    [Theory]
    [InlineData(100)]
    [InlineData(60_000)]
    public void RefusesAPollCadenceOutsideTheRuntimeBound(int interval)
    {
        // The same bound the runtime enforces, from the same method.
        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Author(Request(pollInterval: interval)));
    }

    [Fact]
    public void WhatItWritesIsExactlyWhatTheGuestRuntimeReadsBack()
    {
        var requestPath = WriteRequest(Request());
        var outputPath = Path.Combine(root, "config", "scene-session.json");

        FieldSceneSessionAuthoringCommand.Run(requestPath, outputPath);
        var readBack = FieldSceneSessionConfiguration.ReadOptional(outputPath);

        Assert.NotNull(readBack);
        Assert.Equal(2, readBack!.ExpectedSessionId);
        Assert.Equal(ApprovedSid, readBack.InteractiveUserSid);
        Assert.Equal(producerDigest, readBack.ProducerExecutableSha256);
        Assert.Equal(1_000, readBack.PollIntervalMilliseconds);
        Assert.Equal(2, readBack.ToLaunchPolicy().ExpectedSessionId);
    }

    [Fact]
    public void ADisabledSessionIsStillWrittenAndStillReadsAsOff()
    {
        var requestPath = WriteRequest(Request(enabled: false));
        var outputPath = Path.Combine(root, "disabled", "scene-session.json");

        FieldSceneSessionAuthoringCommand.Run(requestPath, outputPath);

        // Authoring a disabled session is legitimate: it stages a configuration without turning
        // scene production on.
        Assert.True(File.Exists(outputPath));
        Assert.Null(FieldSceneSessionConfiguration.ReadOptional(outputPath));
    }

    [Fact]
    public void NeverOverwritesAnExistingSessionFile()
    {
        var requestPath = WriteRequest(Request());
        var outputPath = Path.Combine(root, "existing", "scene-session.json");
        FieldSceneSessionAuthoringCommand.Run(requestPath, outputPath);
        var original = File.ReadAllText(outputPath);

        // Silently replacing a live session file, possibly on a Field mid-ceremony, is exactly the
        // side effect the opt-in default exists to prevent.
        var failure = Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Run(requestPath, outputPath));

        Assert.Contains("already exists", failure.Message, StringComparison.Ordinal);
        Assert.Equal(original, File.ReadAllText(outputPath));
    }

    [Fact]
    public void WritesNothingWhenTheRequestIsInvalid()
    {
        var requestPath = WriteRequest(Request(sessionId: 0));
        var outputPath = Path.Combine(root, "invalid", "scene-session.json");

        Assert.Throws<InvalidOperationException>(() =>
            FieldSceneSessionAuthoringCommand.Run(requestPath, outputPath));

        // Validation runs before the write, so a rejected request leaves no partial file behind.
        Assert.False(File.Exists(outputPath));
    }
}
