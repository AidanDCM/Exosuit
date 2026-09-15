namespace Exosuit.Agent.Tests;

public sealed class FieldKvpSequenceConcurrencyTests
{
    [Fact]
    public async Task GuestSequenceAllocationsAreSerializedAcrossConcurrentWriters()
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
            var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var tasks = Enumerable.Range(0, 32)
                .Select(async _ =>
                {
                    await start.Task;
                    return FieldKvpRuntime.ReserveNextGuestSequence(configuration, now);
                })
                .ToArray();

            start.SetResult();
            var sequences = await Task.WhenAll(tasks);
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
