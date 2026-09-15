using System.Text.Json;

namespace Exosuit.Agent.Tests;

/// <summary>
/// The guest writes the KVP wire format and the host reader reproduces it in another language.
/// Until now those two agreed only by construction — each was written from the same description,
/// and nothing would have caught a drift except an unreadable scene on a live guest.
///
/// Both sides are now tested against one committed fixture. This file asserts the guest writer
/// produces exactly the fixture; `tests/fieldKvpChunkContract.test.ts` asserts the host reader
/// consumes exactly the fixture. A change to either implementation fails a test here or there.
/// </summary>
public sealed class FieldKvpChunkContractTests
{
    private const string FixturePath = "../../../../../tests/fixtures/kvp-chunk-contract.json";
    private const string Name = "Exosuit.Field.Scene";

    private sealed record Fixture(
        string Name,
        int ChunkCharacters,
        FixtureCase[] Cases);

    private sealed record FixtureCase(
        string Description,
        string Value,
        Dictionary<string, string> Entries);

    private static Fixture ReadFixture()
    {
        var path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, FixturePath));
        Assert.True(File.Exists(path), $"KVP chunk contract fixture is missing at {path}");
        return JsonSerializer.Deserialize<Fixture>(
            File.ReadAllText(path),
            new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Fixture is empty.");
    }

    [Fact]
    public void TheFixtureNamesTheValueTheGuestActuallyWrites()
    {
        Assert.Equal(Name, ReadFixture().Name);
        Assert.Equal(Name, FieldKvpRuntime.SceneValueName);
    }

    [Fact]
    public void TheGuestWriterProducesExactlyTheFixtureEntries()
    {
        var fixture = ReadFixture();
        Assert.NotEmpty(fixture.Cases);

        foreach (var testCase in fixture.Cases)
        {
            var produced = FieldKvpRuntime.BuildKvpEntries(fixture.Name, testCase.Value);

            Assert.Equal(
                testCase.Entries.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToArray(),
                produced.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToArray());
        }
    }

    [Fact]
    public void ShortValuesAreWrittenWholeAndLongValuesAreChunked()
    {
        var fixture = ReadFixture();

        // The fixture must exercise both branches, or a drift in the one it misses goes unnoticed.
        Assert.Contains(fixture.Cases, testCase => testCase.Entries.Count == 1);
        Assert.Contains(fixture.Cases, testCase => testCase.Entries.Count > 1);
    }

    [Fact]
    public void ChunkBoundaryIsTheDocumentedSize()
    {
        var fixture = ReadFixture();
        var exact = new string('x', fixture.ChunkCharacters);

        // Exactly at the bound stays whole; one character past it chunks.
        Assert.Single(FieldKvpRuntime.BuildKvpEntries(fixture.Name, exact));
        Assert.True(FieldKvpRuntime.BuildKvpEntries(fixture.Name, exact + "x").Count > 1);
    }
}
