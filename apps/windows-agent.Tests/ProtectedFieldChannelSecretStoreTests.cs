using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json.Nodes;
using Exosuit.Agent;

namespace Exosuit.Agent.Tests;

public sealed class ProtectedFieldChannelSecretStoreTests
{
    private static readonly FieldReference Field = new(Guid.Parse("f44b72f7-c3c1-49cb-b177-55c82bf4fbc1"), 7);
    private const string KeyId = "field-key-7";

    [Fact]
    public void RoundTripsWithoutPersistingPlaintextAndUsesFilePolicy()
    {
        using var fixture = new StoreFixture();
        var secret = Encoding.UTF8.GetBytes("channel-secret-material-that-must-not-be-persisted");

        fixture.Store.Save(fixture.Path, Field, KeyId, secret);
        var serialized = File.ReadAllText(fixture.Path);
        var loaded = fixture.Store.Load(fixture.Path, Field, KeyId);

        Assert.Equal(secret, loaded);
        Assert.DoesNotContain(Encoding.UTF8.GetString(secret), serialized, StringComparison.Ordinal);
        Assert.Contains("\"algorithm\":\"test-hmac-sha256\"", serialized, StringComparison.Ordinal);
        Assert.Equal(1, fixture.Policy.SealCount);
        Assert.True(fixture.Policy.AssertCount >= 2);
        CryptographicOperations.ZeroMemory(loaded);
    }

    [Fact]
    public void RejectsCrossGenerationKeyAndCiphertextCorruptionBeforeReturningSecret()
    {
        using var fixture = new StoreFixture();
        var secret = Encoding.UTF8.GetBytes("channel-secret-material-that-must-not-be-persisted");
        fixture.Store.Save(fixture.Path, Field, KeyId, secret);

        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(
            fixture.Path, Field with { FieldGeneration = 8 }, KeyId));
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, "field-key-8"));

        var envelope = JsonNode.Parse(File.ReadAllText(fixture.Path))!.AsObject();
        var ciphertext = envelope["ciphertextBase64"]!.GetValue<string>();
        envelope["ciphertextBase64"] = (ciphertext[0] == 'A' ? "B" : "A") + ciphertext[1..];
        File.WriteAllText(fixture.Path, envelope.ToJsonString());
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));
    }

    [Fact]
    public void RejectsMalformedLegacyOversizedAndUnprotectedFiles()
    {
        using var fixture = new StoreFixture();
        File.WriteAllText(fixture.Path, "plain-channel-secret-material-that-is-long-enough");
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));

        File.WriteAllText(fixture.Path, new string('A', 64 * 1024 + 1));
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));

        fixture.Policy.RejectAssertions = true;
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));
    }

    [Fact]
    public void RejectsUnexpectedSchemaAlgorithmAndNonCanonicalBase64()
    {
        using var fixture = new StoreFixture();
        fixture.Store.Save(fixture.Path, Field, KeyId, Encoding.UTF8.GetBytes("channel-secret-material-that-must-not-be-persisted"));
        var original = JsonNode.Parse(File.ReadAllText(fixture.Path))!.AsObject();

        var extra = JsonNode.Parse(original.ToJsonString())!.AsObject();
        extra["unexpected"] = true;
        File.WriteAllText(fixture.Path, extra.ToJsonString());
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));

        var algorithm = JsonNode.Parse(original.ToJsonString())!.AsObject();
        algorithm["algorithm"] = "unavailable-protector";
        File.WriteAllText(fixture.Path, algorithm.ToJsonString());
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));

        var base64 = JsonNode.Parse(original.ToJsonString())!.AsObject();
        base64["ciphertextBase64"] = base64["ciphertextBase64"]!.GetValue<string>() + "=";
        File.WriteAllText(fixture.Path, base64.ToJsonString());
        Assert.Throws<InvalidOperationException>(() => fixture.Store.Load(fixture.Path, Field, KeyId));
    }

    [Fact]
    public void RejectsWeakSecretsAndInvalidBindingsWithoutCreatingAFile()
    {
        using var fixture = new StoreFixture();
        Assert.Throws<ArgumentException>(() => fixture.Store.Save(fixture.Path, Field, KeyId, new byte[31]));
        Assert.Throws<ArgumentException>(() => fixture.Store.Save(fixture.Path, Field, " key ", new byte[32]));
        Assert.Throws<ArgumentOutOfRangeException>(() => fixture.Store.Save(
            fixture.Path, Field with { FieldGeneration = 0 }, KeyId, new byte[32]));
        Assert.False(File.Exists(fixture.Path));
    }

    [Fact]
    public void FailedReplacementPreservesPriorEnvelopeAndRemovesTemporaryFile()
    {
        using var fixture = new StoreFixture();
        fixture.Store.Save(fixture.Path, Field, KeyId, Encoding.UTF8.GetBytes("first-channel-secret-material-that-is-long-enough"));
        var before = File.ReadAllBytes(fixture.Path);
        fixture.Policy.RejectAssertions = true;

        Assert.Throws<InvalidOperationException>(() => fixture.Store.Save(
            fixture.Path, Field, KeyId, Encoding.UTF8.GetBytes("second-channel-secret-material-that-is-long-enough")));

        Assert.Equal(before, File.ReadAllBytes(fixture.Path));
        Assert.Equal([Path.GetFileName(fixture.Path)], Directory.GetFiles(fixture.Root).Select(Path.GetFileName));
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public void WindowsDpapiRoundTripsLocallyWithoutExposingPlaintext()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), $"exosuit-dpapi-secret-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "channel-secret.protected.json");
        try
        {
            var policy = new FakeFilePolicy();
            var store = new ProtectedFieldChannelSecretStore(new DpapiLocalMachineFieldChannelSecretProtector(), policy);
            var secret = Encoding.UTF8.GetBytes("local-dpapi-channel-secret-material-that-is-long-enough");
            store.Save(path, Field, KeyId, secret);
            var loaded = store.Load(path, Field, KeyId);
            Assert.Equal(secret, loaded);
            Assert.DoesNotContain(Encoding.UTF8.GetString(secret), File.ReadAllText(path), StringComparison.Ordinal);
            CryptographicOperations.ZeroMemory(loaded);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
            if (Directory.Exists(root)) Directory.Delete(root);
        }
    }

    [Fact]
    [Trait("Category", "LocalWindows")]
    public void WindowsRestrictedAclAllowsOnlySystemAndAdministrators()
    {
        if (!OperatingSystem.IsWindows()) return;
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"exosuit-secret-acl-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, "protected-ciphertext-placeholder");
        try
        {
            var policy = new WindowsRestrictedFieldChannelSecretFilePolicy();
            policy.Seal(path);
            policy.AssertProtected(path);
        }
        finally
        {
            if (File.Exists(path))
            {
                var currentUser = WindowsIdentity.GetCurrent().User!;
                var cleanup = new FileSecurity();
                cleanup.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
                cleanup.AddAccessRule(new FileSystemAccessRule(currentUser, FileSystemRights.FullControl, AccessControlType.Allow));
                new FileInfo(path).SetAccessControl(cleanup);
                File.Delete(path);
            }
        }
    }

    private sealed class StoreFixture : IDisposable
    {
        public StoreFixture()
        {
            Root = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"exosuit-secret-store-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Root);
            Path = System.IO.Path.Combine(Root, "channel-secret.protected.json");
            Policy = new FakeFilePolicy();
            Store = new ProtectedFieldChannelSecretStore(new AuthenticatedTestProtector(), Policy);
        }

        public string Root { get; }
        public string Path { get; }
        public FakeFilePolicy Policy { get; }
        public ProtectedFieldChannelSecretStore Store { get; }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }

    private sealed class FakeFilePolicy : IFieldChannelSecretFilePolicy
    {
        public int SealCount { get; private set; }
        public int AssertCount { get; private set; }
        public bool RejectAssertions { get; set; }

        public void Seal(string path)
        {
            Assert.True(File.Exists(path));
            SealCount++;
        }

        public void AssertProtected(string path)
        {
            Assert.True(File.Exists(path));
            AssertCount++;
            if (RejectAssertions) throw new InvalidOperationException("Synthetic file policy rejection.");
        }
    }

    private sealed class AuthenticatedTestProtector : IFieldChannelSecretProtector
    {
        private static readonly byte[] Key = SHA256.HashData(Encoding.UTF8.GetBytes("test-only-protector-key"));
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
            var tag = ciphertext[^32..];
            var authenticated = scope.Concat(plaintext).ToArray();
            var expected = HMACSHA256.HashData(Key, authenticated);
            CryptographicOperations.ZeroMemory(authenticated);
            if (!CryptographicOperations.FixedTimeEquals(tag, expected))
            {
                CryptographicOperations.ZeroMemory(plaintext);
                throw new CryptographicException();
            }
            return plaintext;
        }
    }
}
