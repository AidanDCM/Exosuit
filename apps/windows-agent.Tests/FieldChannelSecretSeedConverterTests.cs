using System.Security.Cryptography;
using System.Text;
using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class FieldChannelSecretSeedConverterTests
{
    private static readonly FieldReference Field = new(Guid.Parse("6756e489-b03f-42e6-a616-885e862a3ba9"), 4);
    private const string KeyId = "field-key-4";
    private const string SystemSid = "S-1-5-18";

    [Fact]
    public void ConvertsOneSeedInPlaceAndVerifiesIdempotentRestartWithoutPlaintext()
    {
        using var fixture = new ConverterFixture();
        const string secret = "printable-channel-secret-material-for-conversion";
        File.WriteAllText(fixture.Path, secret + "\r\n", new UTF8Encoding(false));
        var completedAt = DateTimeOffset.Parse("2026-08-01T16:00:00Z");

        var converted = fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid, completedAt);
        var protectedBytes = File.ReadAllBytes(fixture.Path);
        var restarted = fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid, completedAt.AddMinutes(1));

        Assert.Equal(FieldChannelSecretSeedConversionStatus.Converted, converted.Status);
        Assert.Equal(FieldChannelSecretSeedConversionStatus.AlreadyProtected, restarted.Status);
        Assert.Equal(converted.ProtectedEnvelopeSha256, restarted.ProtectedEnvelopeSha256);
        Assert.Equal(64, converted.ProtectedEnvelopeSha256.Length);
        Assert.Equal(protectedBytes, File.ReadAllBytes(fixture.Path));
        Assert.DoesNotContain(secret, File.ReadAllText(fixture.Path), StringComparison.Ordinal);
        Assert.Equal(completedAt, converted.CompletedAt);

        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(
            fixture.Path, Field with { FieldGeneration = 5 }, KeyId, SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(
            fixture.Path, Field, "field-key-5", SystemSid));
        Assert.Equal(protectedBytes, File.ReadAllBytes(fixture.Path));
    }

    [Fact]
    public void DeniesNonSystemCallersBeforeReadingOrChangingTheSeed()
    {
        using var fixture = new ConverterFixture();
        var before = Encoding.ASCII.GetBytes("printable-channel-secret-material-for-conversion");
        File.WriteAllBytes(fixture.Path, before);

        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, "S-1-5-21-1000"));
        Assert.Equal(before, File.ReadAllBytes(fixture.Path));
        Assert.Equal(0, fixture.Policy.SealCount);
    }

    [Fact]
    public void RejectsMalformedProtectedLookingInputWithoutPlaintextFallback()
    {
        using var fixture = new ConverterFixture();
        var malformed = Encoding.ASCII.GetBytes("{not-a-protected-envelope}");
        File.WriteAllBytes(fixture.Path, malformed);

        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid));
        Assert.Equal(malformed, File.ReadAllBytes(fixture.Path));
        Assert.Equal(0, fixture.Policy.SealCount);
    }

    [Fact]
    public void RejectsWeakControlCharacterAndOversizedSeedsWithoutMutation()
    {
        using var fixture = new ConverterFixture();
        foreach (var seed in new[]
        {
            Encoding.ASCII.GetBytes("too-short"),
            Encoding.ASCII.GetBytes("printable-channel-secret\twith-control-character"),
            Enumerable.Repeat((byte)'A', 16 * 1024 + 1).ToArray(),
        })
        {
            File.WriteAllBytes(fixture.Path, seed);
            Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid));
            Assert.Equal(seed, File.ReadAllBytes(fixture.Path));
        }
    }

    [Fact]
    public void RejectsPathsOutsideTheExactConfigRootAndCanonicalFileName()
    {
        using var fixture = new ConverterFixture();
        var other = System.IO.Path.Combine(fixture.Root, "other-secret.txt");
        File.WriteAllText(other, "printable-channel-secret-material-for-conversion");
        var escaped = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(fixture.Root)!, "channel-secret.txt");

        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(other, Field, KeyId, SystemSid));
        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(escaped, Field, KeyId, SystemSid));
    }

    [Fact]
    public void RejectsConfigRootAndSeedReparsePointsBeforeConversion()
    {
        using var fixture = new ConverterFixture();
        var seed = Encoding.ASCII.GetBytes("printable-channel-secret-material-for-conversion");
        File.WriteAllBytes(fixture.Path, seed);

        fixture.PathInspector.ReparsePath = fixture.Root;
        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid));
        fixture.PathInspector.ReparsePath = fixture.Path;
        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid));

        Assert.Equal(seed, File.ReadAllBytes(fixture.Path));
        Assert.Equal(0, fixture.Policy.SealCount);
    }

    [Fact]
    public void PrepublicationPolicyFailurePreservesTheSeedAndRemovesTemporaryFiles()
    {
        using var fixture = new ConverterFixture();
        var seed = Encoding.ASCII.GetBytes("printable-channel-secret-material-for-conversion");
        File.WriteAllBytes(fixture.Path, seed);
        fixture.Policy.RejectAssertions = true;

        Assert.Throws<InvalidOperationException>(() => fixture.Converter.Convert(fixture.Path, Field, KeyId, SystemSid));

        Assert.Equal(seed, File.ReadAllBytes(fixture.Path));
        Assert.Equal(["channel-secret.txt"], Directory.GetFiles(fixture.Root).Select(System.IO.Path.GetFileName));
    }

    private sealed class ConverterFixture : IDisposable
    {
        public ConverterFixture()
        {
            Root = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"exosuit-secret-conversion-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Root);
            Path = System.IO.Path.Combine(Root, "channel-secret.txt");
            Policy = new FakeFilePolicy();
            PathInspector = new FakePathInspector();
            var store = new ProtectedFieldChannelSecretStore(new AuthenticatedTestProtector(), Policy);
            Converter = new FieldChannelSecretSeedConverter(Root, store, PathInspector);
        }

        public string Root { get; }
        public string Path { get; }
        public FakeFilePolicy Policy { get; }
        public FakePathInspector PathInspector { get; }
        public FieldChannelSecretSeedConverter Converter { get; }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }

    private sealed class FakePathInspector : IFieldChannelSecretPathInspector
    {
        public string? ReparsePath { get; set; }
        public bool IsReparsePoint(string path) => string.Equals(path, ReparsePath, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class FakeFilePolicy : IFieldChannelSecretFilePolicy
    {
        public int SealCount { get; private set; }
        public bool RejectAssertions { get; set; }

        public void Seal(string path)
        {
            Assert.True(File.Exists(path));
            SealCount++;
        }

        public void AssertProtected(string path)
        {
            Assert.True(File.Exists(path));
            if (RejectAssertions) throw new InvalidOperationException("Synthetic policy rejection.");
        }
    }

    private sealed class AuthenticatedTestProtector : IFieldChannelSecretProtector
    {
        private static readonly byte[] Key = SHA256.HashData(Encoding.UTF8.GetBytes("conversion-test-only-key"));
        public string Algorithm => "test-hmac-sha256";

        public byte[] Protect(byte[] plaintext, byte[] scope)
        {
            var authenticated = scope.Concat(plaintext).ToArray();
            var tag = HMACSHA256.HashData(Key, authenticated);
            CryptographicOperations.ZeroMemory(authenticated);
            return plaintext.Concat(tag).ToArray();
        }

        public byte[] Unprotect(byte[] ciphertext, byte[] scope)
        {
            if (ciphertext.Length < 32) throw new CryptographicException();
            var plaintext = ciphertext[..^32];
            var authenticated = scope.Concat(plaintext).ToArray();
            var expected = HMACSHA256.HashData(Key, authenticated);
            CryptographicOperations.ZeroMemory(authenticated);
            if (!CryptographicOperations.FixedTimeEquals(ciphertext[^32..], expected)) throw new CryptographicException();
            return plaintext;
        }
    }
}
