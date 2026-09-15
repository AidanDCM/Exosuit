using System.Text.Json;
using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class FieldChannelSecretProtectionCommandTests
{
    private static readonly FieldReference Field = new(Guid.Parse("999237b4-7c6d-4295-b435-433372178181"), 6);
    private const string KeyId = "field-key-6";
    private const string SystemSid = "S-1-5-18";

    [Fact]
    public void DerivesExactConversionArgumentsFromStrictRuntimeConfiguration()
    {
        using var fixture = new CommandFixture();
        fixture.WriteConfiguration();
        var now = DateTimeOffset.Parse("2026-08-01T19:00:00Z");

        var result = fixture.Command.Execute(fixture.ConfigPath, SystemSid, now);

        Assert.Equal(1, fixture.Converter.CallCount);
        Assert.Equal(fixture.SeedPath, fixture.Converter.Path);
        Assert.Equal(Field, fixture.Converter.Field);
        Assert.Equal(KeyId, fixture.Converter.KeyId);
        Assert.Equal(SystemSid, fixture.Converter.CallerSid);
        Assert.Equal(now, result.CompletedAt);
    }

    [Fact]
    public void DeniesNonSystemCallerBeforeConfigurationAccess()
    {
        using var fixture = new CommandFixture();
        Assert.False(File.Exists(fixture.ConfigPath));

        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, "S-1-5-21-1000"));

        Assert.Equal(0, fixture.Converter.CallCount);
    }

    [Fact]
    public void RejectsEscapedNoncanonicalAndReparseConfigurationPaths()
    {
        using var fixture = new CommandFixture();
        fixture.WriteConfiguration();
        var other = Path.Combine(fixture.Root, "runtime.json");
        File.Copy(fixture.ConfigPath, other);

        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(other, SystemSid));
        var noncanonical = Path.Combine(fixture.Root, ".", "guest-runtime.json");
        Assert.NotEqual(fixture.ConfigPath, noncanonical);
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(noncanonical, SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath.ToUpperInvariant(), SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath.Replace('\\', '/'), SystemSid));
        fixture.PathInspector.ReparsePath = fixture.Root;
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        fixture.PathInspector.ReparsePath = fixture.ConfigPath;
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        Assert.Equal(0, fixture.Converter.CallCount);
    }

    [Fact]
    public void RejectsMalformedUnknownOversizedAndWrongSeedConfiguration()
    {
        using var fixture = new CommandFixture();
        foreach (var content in new[]
        {
            "{",
            JsonSerializer.Serialize(new
            {
                contractVersion = 1,
                field = new { fieldId = Field.FieldId, fieldGeneration = Field.FieldGeneration },
                agentId = "field-agent-6",
                keyId = KeyId,
                secretPath = fixture.SeedPath,
                bootstrapReportPath = Path.Combine(fixture.Root, "bootstrap-report.json"),
                heartbeatIntervalMilliseconds = 1000,
                unexpected = true,
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        })
        {
            File.WriteAllText(fixture.ConfigPath, content);
            Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        }

        File.WriteAllBytes(fixture.ConfigPath, [0xff, 0xfe, 0xfd]);
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));

        fixture.WriteConfiguration(secretPath: Path.Combine(fixture.Root, "other-secret.txt"));
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        fixture.WriteConfiguration();
        var duplicate = File.ReadAllText(fixture.ConfigPath).Replace(
            $"\"keyId\":\"{KeyId}\"",
            $"\"keyId\":\"{KeyId}\",\"keyId\":\"field-key-other\"",
            StringComparison.Ordinal);
        Assert.Contains("field-key-other", duplicate, StringComparison.Ordinal);
        File.WriteAllText(fixture.ConfigPath, duplicate);
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        File.WriteAllText(fixture.ConfigPath, new string('A', 32 * 1024 + 1));
        Assert.Throws<InvalidOperationException>(() => fixture.Command.Execute(fixture.ConfigPath, SystemSid));
        Assert.Equal(0, fixture.Converter.CallCount);
    }

    [Fact]
    public void SerializesOnlyMetadataAndKeepsProductionPathsFixed()
    {
        var result = new FieldChannelSecretSeedConversionResult(
            1, Field, KeyId, FieldChannelSecretSeedConversionStatus.Converted,
            new string('a', 64), DateTimeOffset.Parse("2026-08-01T19:00:00Z"));

        var serialized = FieldChannelSecretProtectionCommand.SerializeResult(result);

        using var document = JsonDocument.Parse(serialized);
        var propertyNames = document.RootElement.EnumerateObject()
            .Select(property => property.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();
        Assert.Equal(
            ["ciphertextEnvelopeSha256", "completedAt", "contractVersion", "field", "keyId", "status"],
            propertyNames);
        Assert.Equal("converted", document.RootElement.GetProperty("status").GetString());
        Assert.Equal(new string('a', 64), document.RootElement.GetProperty("ciphertextEnvelopeSha256").GetString());
        Assert.False(document.RootElement.TryGetProperty("protectedEnvelopeSha256", out _));
        Assert.DoesNotContain("secretPath", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("plaintext", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(@"C:\Exosuit\Config", FieldChannelSecretProtectionCommand.ProductionConfigRoot);
        Assert.Equal("guest-runtime.json", FieldChannelSecretProtectionCommand.RuntimeConfigurationFileName);
        Assert.Equal("channel-secret.txt", FieldChannelSecretProtectionCommand.SeedFileName);
    }

    private sealed class CommandFixture : IDisposable
    {
        public CommandFixture()
        {
            Root = Path.Combine(Path.GetTempPath(), $"exosuit-secret-command-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Root);
            ConfigPath = Path.Combine(Root, "guest-runtime.json");
            SeedPath = Path.Combine(Root, "channel-secret.txt");
            Converter = new FakeConverter();
            PathInspector = new FakePathInspector();
            Command = new FieldChannelSecretProtectionCommand(Root, Converter, PathInspector);
        }

        public string Root { get; }
        public string ConfigPath { get; }
        public string SeedPath { get; }
        public FakeConverter Converter { get; }
        public FakePathInspector PathInspector { get; }
        public FieldChannelSecretProtectionCommand Command { get; }

        public void WriteConfiguration(string? secretPath = null)
        {
            var configuration = new FieldKvpRuntimeConfiguration(
                1, Field, "field-agent-6", KeyId, secretPath ?? SeedPath,
                Path.Combine(Root, "bootstrap-report.json"), 1000);
            File.WriteAllText(ConfigPath, JsonSerializer.Serialize(configuration, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }

    private sealed class FakeConverter : IFieldChannelSecretSeedConverter
    {
        public int CallCount { get; private set; }
        public string? Path { get; private set; }
        public FieldReference? Field { get; private set; }
        public string? KeyId { get; private set; }
        public string? CallerSid { get; private set; }

        public FieldChannelSecretSeedConversionResult Convert(
            string path, FieldReference field, string keyId, string? callerSid, DateTimeOffset? now = null)
        {
            CallCount++;
            Path = path;
            Field = field;
            KeyId = keyId;
            CallerSid = callerSid;
            return new FieldChannelSecretSeedConversionResult(
                1, field, keyId, FieldChannelSecretSeedConversionStatus.Converted,
                new string('b', 64), now ?? DateTimeOffset.UtcNow);
        }
    }

    private sealed class FakePathInspector : IFieldChannelSecretPathInspector
    {
        public string? ReparsePath { get; set; }
        public bool IsReparsePoint(string path) => string.Equals(path, ReparsePath, StringComparison.OrdinalIgnoreCase);
    }
}
