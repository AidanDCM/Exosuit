using System.Text.Json;
using System.Text.Json.Nodes;

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
    public void ObservationSnapshotProtectsStateAndRejectsRegressionMutationReuseCorruptionRotationAndStaleGeneration()
    {
        var root = Path.Combine(Path.GetTempPath(), $"exosuit-kvp-observation-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var now = DateTimeOffset.Parse("2026-07-30T22:00:00.000Z");
            var secret = "field-kvp-observation-secret-that-is-long-enough";
            var field = new FieldReference(Guid.NewGuid(), 1);
            var secretPath = Path.Combine(root, "secret.txt");
            var configPath = Path.Combine(root, "config.json");
            var observationPath = Path.Combine(root, "observation.json");
            var handshakePath = Path.Combine(root, "handshake.json");
            var bootstrapPath = Path.Combine(root, "bootstrap.json");
            var heartbeatPath = Path.Combine(root, "heartbeat.json");
            File.WriteAllText(secretPath, secret);
            var configuration = new FieldKvpRuntimeConfiguration(
                1, field, "field-agent-test", "field-key-test", secretPath,
                Path.Combine(root, "bootstrap-report.json"), 1_000);
            File.WriteAllText(configPath, JsonSerializer.Serialize(configuration, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

            FieldChannelEnvelope Create(long sequence, FieldChannelMessageType type, Guid? messageId = null) =>
                FieldChannelAuthentication.Create(
                    field, FieldChannelDirection.GuestToHost, sequence, type,
                    new Dictionary<string, object?> { ["sequence"] = sequence }, configuration.KeyId,
                    secret, now.AddSeconds(-1), type == FieldChannelMessageType.Heartbeat ? TimeSpan.FromSeconds(10) : TimeSpan.FromMinutes(5),
                    messageId);
            void Write(string path, FieldChannelEnvelope envelope) => File.WriteAllText(path, FieldKvpRuntime.SerializeEnvelope(envelope));

            var handshake = Create(10, FieldChannelMessageType.Handshake);
            var bootstrap = Create(11, FieldChannelMessageType.BootstrapStatus);
            var heartbeat = Create(12, FieldChannelMessageType.Heartbeat);
            Write(handshakePath, handshake);
            Write(bootstrapPath, bootstrap);
            Write(heartbeatPath, heartbeat);

            Assert.Equal(3, FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now).Count);
            var retainedState = File.ReadAllText(observationPath);
            var protectedState = JsonNode.Parse(retainedState)!.AsObject();
            Assert.Equal("hmac-sha256", protectedState["algorithm"]!.GetValue<string>());
            Assert.DoesNotContain(handshake.MessageId.ToString(), retainedState, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(3, FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now).Count);
            Assert.Equal(retainedState, File.ReadAllText(observationPath));

            var advancedHeartbeat = Create(13, FieldChannelMessageType.Heartbeat);
            Write(heartbeatPath, advancedHeartbeat);
            FieldKvpRuntime.ObserveSnapshot(configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now);
            var advancedState = File.ReadAllText(observationPath);

            Write(heartbeatPath, Create(12, FieldChannelMessageType.Heartbeat));
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(advancedState, File.ReadAllText(observationPath));

            Write(heartbeatPath, Create(14, FieldChannelMessageType.Heartbeat, handshake.MessageId));
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(advancedState, File.ReadAllText(observationPath));

            var corrupt = JsonNode.Parse(advancedState)!.AsObject();
            var tag = corrupt["authenticationTag"]!.GetValue<string>();
            corrupt["authenticationTag"] = (tag[0] == '0' ? "1" : "0") + tag[1..];
            var corruptTagState = corrupt.ToJsonString();
            File.WriteAllText(observationPath, corruptTagState);
            Write(heartbeatPath, advancedHeartbeat);
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(corruptTagState, File.ReadAllText(observationPath));

            File.WriteAllText(observationPath, advancedState);
            var corruptPayload = JsonNode.Parse(advancedState)!.AsObject();
            var payloadBytes = Convert.FromBase64String(corruptPayload["payloadBase64"]!.GetValue<string>());
            payloadBytes[^1] ^= 1;
            corruptPayload["payloadBase64"] = Convert.ToBase64String(payloadBytes);
            var corruptPayloadState = corruptPayload.ToJsonString();
            File.WriteAllText(observationPath, corruptPayloadState);
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(corruptPayloadState, File.ReadAllText(observationPath));

            File.WriteAllText(observationPath, new string('A', 32 * 1_024 + 1));
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(32 * 1_024 + 1, new FileInfo(observationPath).Length);

            File.WriteAllText(observationPath, advancedState);
            var rotatedSecret = "field-kvp-rotated-secret-that-is-long-enough";
            File.WriteAllText(secretPath, rotatedSecret);
            var rotated = configuration with { KeyId = "field-key-rotated" };
            File.WriteAllText(configPath, JsonSerializer.Serialize(rotated, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            FieldChannelEnvelope CreateRotated(long sequence, FieldChannelMessageType type) =>
                FieldChannelAuthentication.Create(
                    field, FieldChannelDirection.GuestToHost, sequence, type,
                    new Dictionary<string, object?> { ["sequence"] = sequence }, rotated.KeyId,
                    rotatedSecret, now.AddSeconds(-1), type == FieldChannelMessageType.Heartbeat ? TimeSpan.FromSeconds(10) : TimeSpan.FromMinutes(5));
            Write(handshakePath, CreateRotated(20, FieldChannelMessageType.Handshake));
            Write(bootstrapPath, CreateRotated(21, FieldChannelMessageType.BootstrapStatus));
            Write(heartbeatPath, CreateRotated(22, FieldChannelMessageType.Heartbeat));
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(advancedState, File.ReadAllText(observationPath));

            var nextField = field with { FieldGeneration = 2 };
            var nextGeneration = rotated with { Field = nextField };
            File.WriteAllText(configPath, JsonSerializer.Serialize(nextGeneration, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            FieldChannelEnvelope CreateNextGeneration(long sequence, FieldChannelMessageType type) =>
                FieldChannelAuthentication.Create(
                    nextField, FieldChannelDirection.GuestToHost, sequence, type,
                    new Dictionary<string, object?> { ["sequence"] = sequence }, nextGeneration.KeyId,
                    rotatedSecret, now.AddSeconds(-1), type == FieldChannelMessageType.Heartbeat ? TimeSpan.FromSeconds(10) : TimeSpan.FromMinutes(5));
            Write(handshakePath, CreateNextGeneration(30, FieldChannelMessageType.Handshake));
            Write(bootstrapPath, CreateNextGeneration(31, FieldChannelMessageType.BootstrapStatus));
            Write(heartbeatPath, CreateNextGeneration(32, FieldChannelMessageType.Heartbeat));
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
            Assert.Equal(advancedState, File.ReadAllText(observationPath));

            File.WriteAllText(observationPath, "{");
            Assert.Throws<InvalidOperationException>(() => FieldKvpRuntime.ObserveSnapshot(
                configPath, handshakePath, bootstrapPath, heartbeatPath, observationPath, now));
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
