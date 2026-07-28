using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldKvpRuntimeTests
{
    [Fact]
    public void SignedGuestEnvelopeRoundTripsAndPersistsReplayState()
    {
        var root = Path.Combine(Path.GetTempPath(), $"exosuit-kvp-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var secretPath = Path.Combine(root, "secret.txt");
            var configPath = Path.Combine(root, "config.json");
            var envelopePath = Path.Combine(root, "envelope.json");
            var replayPath = Path.Combine(root, "replay.json");
            var secret = "field-kvp-test-secret-that-is-long-enough";
            File.WriteAllText(secretPath, secret);
            var field = new FieldReference(Guid.NewGuid(), 3);
            var configuration = new FieldKvpRuntimeConfiguration(
                1, field, "field-agent-test", "field-key-test", secretPath,
                Path.Combine(root, "bootstrap.json"), 1_000);
            File.WriteAllText(configPath, JsonSerializer.Serialize(configuration, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

            var envelope = FieldKvpRuntime.CreateEnvelope(
                configuration,
                secret,
                Guid.NewGuid(),
                7,
                FieldChannelMessageType.Heartbeat,
                new Dictionary<string, object?> { ["healthy"] = true });
            File.WriteAllText(envelopePath, FieldKvpRuntime.SerializeEnvelope(envelope));

            var verified = FieldKvpRuntime.VerifyEnvelope(configPath, envelopePath, replayPath);
            Assert.Equal(7, verified.Sequence);
            Assert.Equal(FieldChannelMessageType.Heartbeat, verified.MessageType);
            Assert.True(File.Exists(replayPath));
            Assert.Throws<InvalidOperationException>(() =>
                FieldKvpRuntime.VerifyEnvelope(configPath, envelopePath, replayPath));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void RejectsWeakSecretsWrongDirectionsAndInvalidIntervals()
    {
        var field = new FieldReference(Guid.NewGuid(), 1);
        var configuration = new FieldKvpRuntimeConfiguration(
            1, field, "field-agent-test", "field-key-test", "secret.txt", "bootstrap.json", 1_000);
        Assert.Throws<ArgumentException>(() => FieldKvpRuntime.CreateEnvelope(
            configuration,
            "short",
            Guid.NewGuid(),
            0,
            FieldChannelMessageType.Handshake,
            new Dictionary<string, object?>()));
        Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.CreateEnvelope(
            configuration with { HeartbeatIntervalMilliseconds = 100 },
            "field-kvp-test-secret-that-is-long-enough",
            Guid.NewGuid(),
            0,
            FieldChannelMessageType.Handshake,
            new Dictionary<string, object?>()));
    }

    [Fact]
    public void GuestSequencePersistsAcrossRuntimeRestartAndRejectsMismatchedState()
    {
        var root = Path.Combine(Path.GetTempPath(), $"exosuit-kvp-sequence-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var field = new FieldReference(Guid.NewGuid(), 2);
            var configuration = new FieldKvpRuntimeConfiguration(
                1, field, "field-agent-test", "field-key-test", Path.Combine(root, "secret.txt"),
                Path.Combine(root, "bootstrap.json"), 1_000);
            var first = FieldKvpRuntime.ReserveNextGuestSequence(
                configuration, DateTimeOffset.Parse("2026-07-23T22:00:00.000Z"));
            var second = FieldKvpRuntime.ReserveNextGuestSequence(
                configuration, DateTimeOffset.Parse("2026-07-23T21:00:00.000Z"));
            Assert.Equal(first + 1, second);

            Assert.Throws<InvalidOperationException>(() =>
                FieldKvpRuntime.ReserveNextGuestSequence(configuration with { KeyId = "different-key" }));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void BootstrapStatusPreservesDurableEnrollmentForHostEvaluation()
    {
        var path = Path.Combine(Path.GetTempPath(), $"exosuit-bootstrap-{Guid.NewGuid():N}.json");
        try
        {
            var enrollment = new
            {
                contractVersion = 1,
                manifestDigest = new string('a', 64),
                identity = new { fieldId = Guid.NewGuid(), fieldGeneration = 1 },
                enrolledAt = "2026-07-28T20:00:00.000Z",
            };
            File.WriteAllText(path, JsonSerializer.Serialize(new
            {
                contractVersion = 1,
                identity = enrollment.identity,
                manifestDigest = enrollment.manifestDigest,
                enrollment,
                reportedAt = "2026-07-28T20:01:00.000Z",
                checks = Array.Empty<object>(),
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

            var status = FieldKvpRuntime.ReadBootstrapStatus(path);
            var report = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(status["report"]);
            var preserved = Assert.IsType<JsonElement>(report["enrollment"]);
            Assert.Equal(enrollment.manifestDigest, preserved.GetProperty("manifestDigest").GetString());
            Assert.Equal(enrollment.enrolledAt, preserved.GetProperty("enrolledAt").GetString());
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
