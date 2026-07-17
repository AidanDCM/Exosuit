using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

public static class ProposalFingerprint
{
    private static readonly JsonSerializerOptions Options = CreateOptions();

    public static string Compute(ActionProposal proposal)
    {
        ArgumentNullException.ThrowIfNull(proposal);
        var immutableContent = new
        {
            proposal.ProposalId,
            proposal.CreatedAt,
            proposal.ExpiresAt,
            proposal.Action,
            proposal.Decision,
            proposal.ActiveWindowId
        };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(immutableContent, Options);
        return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    }

    private static JsonSerializerOptions CreateOptions()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DictionaryKeyPolicy = JsonNamingPolicy.CamelCase
        };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        return options;
    }
}

public sealed class ProposalApprovalRegistry
{
    private readonly ConcurrentDictionary<string, string> _approvedFingerprints = new(StringComparer.Ordinal);

    public string Approve(ActionProposal proposal)
    {
        var fingerprint = ProposalFingerprint.Compute(proposal);
        _approvedFingerprints[proposal.ProposalId] = fingerprint;
        return fingerprint;
    }

    public bool IsValid(ActionProposal proposal)
    {
        if (!_approvedFingerprints.TryGetValue(proposal.ProposalId, out var approved)) return false;
        var current = ProposalFingerprint.Compute(proposal);
        return FixedTimeEquals(approved, current);
    }

    public bool Remove(string proposalId) => _approvedFingerprints.TryRemove(proposalId, out _);

    public void Clear() => _approvedFingerprints.Clear();

    private static bool FixedTimeEquals(string expectedHex, string actualHex)
    {
        try
        {
            var expected = Convert.FromHexString(expectedHex);
            var actual = Convert.FromHexString(actualHex);
            return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(expected, actual);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
