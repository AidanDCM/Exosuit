using System.Text.Json;

namespace Exosuit.Agent.Tests;

public sealed class FieldChannelFoundationTests
{
    [Fact]
    public void SceneObservationUsesTheSharedAuthenticatedWireName()
    {
        var envelope = FieldChannelAuthentication.Create(
            Field, FieldChannelDirection.GuestToHost, 1, FieldChannelMessageType.SceneObservation,
            new Dictionary<string, object?> { ["contractVersion"] = 1 }, "field-key-test", Secret,
            DateTimeOffset.Parse("2026-08-10T18:00:00.000Z"), TimeSpan.FromSeconds(30));

        Assert.Contains("\"messageType\":\"scene_observation\"", FieldKvpRuntime.SerializeEnvelope(envelope));
    }

    private static readonly FieldReference Field = new(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), 1);
    private const string Secret = "field-channel-test-secret-that-is-at-least-thirty-two-characters";

    [Fact]
    public void Authenticated_channel_rejects_tampering_expiry_direction_and_replay()
    {
        var sentAt = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        var envelope = FieldChannelAuthentication.Create(
            Field,
            FieldChannelDirection.GuestToHost,
            0,
            FieldChannelMessageType.Heartbeat,
            new Dictionary<string, object?> { ["healthy"] = true, ["queueDepth"] = 0 },
            "field-channel-key-1",
            Secret,
            sentAt,
            TimeSpan.FromMinutes(1));

        var guard = new FieldChannelReplayGuard(Field, FieldChannelDirection.GuestToHost, "field-channel-key-1");
        Assert.Equal(0, guard.Accept(envelope, Secret, sentAt.AddSeconds(30)).Sequence);
        Assert.Throws<InvalidOperationException>(() => guard.Accept(envelope, Secret, sentAt.AddSeconds(30)));
        Assert.Throws<InvalidOperationException>(() => FieldChannelAuthentication.Verify(envelope, Secret, Field, FieldChannelDirection.HostToGuest, sentAt.AddSeconds(30)));
        Assert.Throws<InvalidOperationException>(() => FieldChannelAuthentication.Verify(envelope, Secret, Field, FieldChannelDirection.GuestToHost, sentAt.AddMinutes(1)));

        var changedPayload = envelope with { Payload = new Dictionary<string, object?> { ["healthy"] = false } };
        Assert.Throws<InvalidOperationException>(() => FieldChannelAuthentication.Verify(changedPayload, Secret, Field, FieldChannelDirection.GuestToHost, sentAt.AddSeconds(30)));

        var changedSignature = envelope with { Signature = (envelope.Signature.StartsWith('A') ? "B" : "A") + envelope.Signature[1..] };
        Assert.Throws<InvalidOperationException>(() => FieldChannelAuthentication.Verify(changedSignature, Secret, Field, FieldChannelDirection.GuestToHost, sentAt.AddSeconds(30)));
    }

    [Fact]
    public void Channel_requires_strictly_increasing_sequence_and_one_boot_generation()
    {
        var sentAt = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        var guard = new FieldChannelReplayGuard(Field, FieldChannelDirection.GuestToHost);
        var first = FieldChannelAuthentication.Create(Field, FieldChannelDirection.GuestToHost, 1, FieldChannelMessageType.Event,
            new Dictionary<string, object?>(), "key", Secret, sentAt, TimeSpan.FromMinutes(1));
        guard.Accept(first, Secret, sentAt.AddSeconds(1));
        var duplicateSequence = FieldChannelAuthentication.Create(Field, FieldChannelDirection.GuestToHost, 1, FieldChannelMessageType.Event,
            new Dictionary<string, object?>(), "key", Secret, sentAt, TimeSpan.FromMinutes(1));
        Assert.Throws<InvalidOperationException>(() => guard.Accept(duplicateSequence, Secret, sentAt.AddSeconds(1)));
    }

    [Fact]
    public void Replay_guard_persists_bounded_state_across_restart_and_binds_channel_identity()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"exosuit-field-replay-{Guid.NewGuid():N}");
        var path = Path.Combine(directory, "replay.json");
        var sentAt = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        try
        {
            var envelope = FieldChannelAuthentication.Create(Field, FieldChannelDirection.GuestToHost, 0,
                FieldChannelMessageType.Heartbeat, new Dictionary<string, object?>(), "key", Secret, sentAt, TimeSpan.FromMinutes(1));
            var first = new FieldChannelReplayGuard(Field, FieldChannelDirection.GuestToHost, "key", 2, path);
            first.Accept(envelope, Secret, sentAt.AddSeconds(1));
            var restarted = new FieldChannelReplayGuard(Field, FieldChannelDirection.GuestToHost, "key", 2, path);
            Assert.Equal(0, restarted.LastSequence);
            Assert.Throws<InvalidOperationException>(() => restarted.Accept(envelope, Secret, sentAt.AddSeconds(1)));
            Assert.Throws<InvalidOperationException>(() => new FieldChannelReplayGuard(
                new FieldReference(Field.FieldId, 2), FieldChannelDirection.GuestToHost, "key", 2, path));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, true);
        }
    }

    [Fact]
    public void Heartbeat_monitor_moves_from_healthy_to_degraded_to_faulted()
    {
        var now = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        var bootId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var monitor = new FieldHeartbeatMonitor(Field, "field-agent-a", TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(15));
        var heartbeat = new FieldHeartbeat(1, Field, "field-agent-a", bootId, 0, now, FieldGuestLifecycle.Ready,
            true, false, false, 0, 0, 200_000_000);
        monitor.Accept(heartbeat, now);
        Assert.Equal(FieldHealthState.Healthy, monitor.Assess(now.AddSeconds(4)).State);
        Assert.Equal(FieldHealthState.Degraded, monitor.Assess(now.AddSeconds(5)).State);
        Assert.Equal(FieldHealthState.Faulted, monitor.Assess(now.AddSeconds(15)).State);
    }

    [Fact]
    public void Heartbeat_rejects_cross_generation_boot_change_stale_sequence_and_impossible_ready_state()
    {
        var now = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        var bootId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var monitor = new FieldHeartbeatMonitor(Field, "field-agent-a");
        var first = new FieldHeartbeat(1, Field, "field-agent-a", bootId, 0, now, FieldGuestLifecycle.Ready,
            true, false, false, 0, 0, 1);
        monitor.Accept(first, now);
        Assert.Throws<InvalidOperationException>(() => monitor.Accept(first, now.AddSeconds(1)));
        Assert.Throws<InvalidOperationException>(() => monitor.Accept(first with { Sequence = 1, BootId = Guid.NewGuid(), ObservedAt = now.AddSeconds(1) }, now.AddSeconds(1)));

        var other = new FieldHeartbeatMonitor(Field, "field-agent-a");
        Assert.Throws<InvalidOperationException>(() => other.Accept(first with { Field = new FieldReference(Field.FieldId, 2) }, now));
        Assert.Throws<InvalidOperationException>(() => other.Accept(first with { SessionLocked = true }, now));
    }

    [Fact]
    public void Canonical_payload_hash_is_independent_of_dictionary_insertion_order()
    {
        var sentAt = DateTimeOffset.Parse("2026-07-21T18:00:00Z");
        var left = FieldChannelAuthentication.Create(Field, FieldChannelDirection.HostToGuest, 0, FieldChannelMessageType.Command,
            new Dictionary<string, object?> { ["b"] = 2, ["a"] = 1 }, "key", Secret, sentAt, TimeSpan.FromSeconds(30),
            Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"), "AAAAAAAAAAAAAAAAAAAAAA");
        var right = FieldChannelAuthentication.Create(Field, FieldChannelDirection.HostToGuest, 0, FieldChannelMessageType.Command,
            new Dictionary<string, object?> { ["a"] = 1, ["b"] = 2 }, "key", Secret, sentAt, TimeSpan.FromSeconds(30),
            Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"), "AAAAAAAAAAAAAAAAAAAAAA");
        Assert.Equal(left.PayloadHash, right.PayloadHash);
        Assert.Equal(left.Signature, right.Signature);
    }
}
