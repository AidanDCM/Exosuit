namespace Exosuit.Agent.Tests;

public sealed class FieldKvpSequenceConcurrencyTests
{
    [Fact]
    public void GuestSequenceAllocationsAreSerializedAcrossConcurrentWriters()
    {
        var root = Path.Combine(Path.GetTempPath(), $"exosuit-kvp-sequence-concurrent-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var configuration = new FieldKvpRuntimeConfiguration(
                1,
                new FieldReference(Guid.NewGuid(), 9),
                "field-agent-test",
                "field-key-test",
                Path.Combine(root, "secret.txt"),
                Path.Combine(root, "bootstrap.json"),
                1_000);
            var now = DateTimeOffset.Parse("2026-09-15T21:00:00.000Z");
            using var start = new ManualResetEventSlim(false);
            var tasks = Enumerable.Range(0, 32)
                .Select(_ => Task.Run(() =>
                {
                    start.Wait();
                    return FieldKvpRuntime.ReserveNextGuestSequence(configuration, now);
                }))
                .ToArray();

            start.Set();
            var sequences = Task.WhenAll(tasks).GetAwaiter().GetResult();
            Array.Sort(sequences);

            Assert.Equal(32, sequences.Distinct().Count());
            for (var index = 1; index < sequences.Length; index++)
                Assert.Equal(sequences[index - 1] + 1, sequences[index]);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
}
