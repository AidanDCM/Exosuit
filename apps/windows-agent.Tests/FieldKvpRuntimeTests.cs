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
}
