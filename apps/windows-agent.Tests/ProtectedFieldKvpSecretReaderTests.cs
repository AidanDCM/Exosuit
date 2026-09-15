using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class ProtectedFieldKvpSecretReaderTests
{
    private static readonly FieldReference Field = new(Guid.Parse("c7e9d208-8484-44c9-be2b-c81b1e687f16"), 9);
    private const string KeyId = "field-key-9";
    private const string SystemSid = "S-1-5-18";

    [Fact]
    public void LoadsOnlyTheExactProtectedSecretBinding()
    {
        using var fixture = new ReaderFixture();

        var secret = fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, SystemSid);

        Assert.Equal(fixture.Secret, secret);
        Assert.Equal(1, fixture.Store.LoadCount);
        Assert.Equal(fixture.SecretPath, fixture.Store.Path);
        Assert.Equal(Field, fixture.Store.Field);
        Assert.Equal(KeyId, fixture.Store.KeyId);
        Array.Clear(secret);
    }

    [Fact]
    public void DeniesNonSystemBeforePathOrStoreAccess()
    {
        using var fixture = new ReaderFixture(createPaths: false);

        Assert.Throws<InvalidOperationException>(() =>
            fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, "S-1-5-21-1000"));

        Assert.Equal(0, fixture.PathInspector.CallCount);
        Assert.Equal(0, fixture.Store.LoadCount);
    }

    [Fact]
    public void RejectsAlternateConfigurationAndSecretPaths()
    {
        using var fixture = new ReaderFixture();
        var dotPath = Path.Combine(fixture.Root, ".", FieldChannelSecretProtectionCommand.RuntimeConfigurationFileName);

        Assert.Throws<InvalidOperationException>(() => fixture.Reader.Read(dotPath, fixture.Configuration, SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Reader.Read(
            fixture.ConfigPath.ToUpperInvariant(), fixture.Configuration, SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Reader.Read(
            fixture.ConfigPath, fixture.Configuration with { SecretPath = Path.Combine(fixture.Root, "other.txt") }, SystemSid));
        Assert.Equal(0, fixture.Store.LoadCount);
    }

    [Fact]
    public void RejectsConfigAndSecretReparsePointsBeforeStoreAccess()
    {
        using var fixture = new ReaderFixture();

        fixture.PathInspector.ReparsePath = fixture.Root;
        Assert.Throws<InvalidOperationException>(() => fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, SystemSid));
        fixture.PathInspector.ReparsePath = fixture.SecretPath;
        Assert.Throws<InvalidOperationException>(() => fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, SystemSid));
        Assert.Equal(0, fixture.Store.LoadCount);
    }

    [Fact]
    public void RejectsAndZerosInvalidProtectedPlaintextWithoutFallback()
    {
        using var fixture = new ReaderFixture();
        foreach (var invalid in new[]
        {
            new byte[31],
            Enumerable.Repeat((byte)'A', 16 * 1024 + 1).ToArray(),
            Enumerable.Repeat((byte)'A', 32).Append((byte)0x1f).ToArray(),
        })
        {
            fixture.Store.Secret = invalid;
            Assert.Throws<InvalidOperationException>(() =>
                fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, SystemSid));
            Assert.All(invalid, value => Assert.Equal(0, value));
        }

        File.WriteAllText(fixture.SecretPath, "field-kvp-plaintext-that-must-never-be-read");
        fixture.Store.ThrowOnLoad = true;
        Assert.Throws<InvalidOperationException>(() =>
            fixture.Reader.Read(fixture.ConfigPath, fixture.Configuration, SystemSid));
        Assert.Equal("field-kvp-plaintext-that-must-never-be-read", File.ReadAllText(fixture.SecretPath));
    }

    private sealed class ReaderFixture : IDisposable
    {
        public ReaderFixture(bool createPaths = true)
        {
            Root = Path.Combine(Path.GetTempPath(), $"exosuit-protected-kvp-reader-{Guid.NewGuid():N}");
            ConfigPath = Path.Combine(Root, FieldChannelSecretProtectionCommand.RuntimeConfigurationFileName);
            SecretPath = Path.Combine(Root, FieldChannelSecretProtectionCommand.SeedFileName);
            Secret = Enumerable.Repeat((byte)'S', 48).ToArray();
            Configuration = new FieldKvpRuntimeConfiguration(
                1, Field, "field-agent-9", KeyId, SecretPath, Path.Combine(Root, "bootstrap-report.json"), 1_000);
            Store = new FakeStore { Secret = Secret };
            PathInspector = new FakePathInspector();
            Reader = new ProtectedFieldKvpSecretReader(Root, Store, PathInspector);
            if (createPaths)
            {
                Directory.CreateDirectory(Root);
                File.WriteAllText(ConfigPath, "{}");
                File.WriteAllText(SecretPath, "protected-envelope-placeholder");
            }
        }

        public string Root { get; }
        public string ConfigPath { get; }
        public string SecretPath { get; }
        public byte[] Secret { get; }
        public FieldKvpRuntimeConfiguration Configuration { get; }
        public FakeStore Store { get; }
        public FakePathInspector PathInspector { get; }
        public ProtectedFieldKvpSecretReader Reader { get; }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }

    private sealed class FakeStore : IProtectedFieldChannelSecretStore
    {
        public byte[] Secret { get; set; } = [];
        public bool ThrowOnLoad { get; set; }
        public int LoadCount { get; private set; }
        public string? Path { get; private set; }
        public FieldReference? Field { get; private set; }
        public string? KeyId { get; private set; }

        public void Save(string path, FieldReference field, string keyId, ReadOnlySpan<byte> secret) =>
            throw new NotSupportedException();

        public byte[] Load(string path, FieldReference field, string keyId)
        {
            LoadCount++;
            Path = path;
            Field = field;
            KeyId = keyId;
            if (ThrowOnLoad) throw new InvalidOperationException("Protected store denied the input.");
            return Secret;
        }
    }

    private sealed class FakePathInspector : IFieldChannelSecretPathInspector
    {
        public string? ReparsePath { get; set; }
        public int CallCount { get; private set; }

        public bool IsReparsePoint(string path)
        {
            CallCount++;
            return string.Equals(path, ReparsePath, StringComparison.OrdinalIgnoreCase);
        }
    }
}
