using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Exosuit.Agent;

/// <summary>
/// Writes every wire timestamp as canonical UTC milliseconds — `yyyy-MM-ddTHH:mm:ss.fffZ`.
///
/// Without this, `System.Text.Json` serialises a <see cref="DateTimeOffset"/> in round-trip form,
/// which for a UTC value is `2026-08-11T12:00:01+00:00`. That is a perfectly valid ISO-8601
/// string and it is **not** the Field channel wire format. The TypeScript envelope schema requires
/// the millisecond-and-Z form and rejects the offset form outright.
///
/// The mismatch was latent rather than harmless. The C# verifier parses both, so the guest→host
/// path exercised by CHN-001 never noticed; the TypeScript receiver is the M2 scene path and had
/// never run against a real guest envelope. Every scene the guest wrote would have failed to
/// parse on the host, as a schema error rather than a signature error.
///
/// The signature is unaffected. Signing payloads are built from a separately formatted canonical
/// string, so this changes only how the timestamp is written into JSON — never what is signed or
/// verified.
///
/// Reading stays permissive: anything `DateTimeOffset.Parse` accepts is read, normalised to UTC.
/// Being strict on write and lenient on read is deliberate — this side should not be the one that
/// breaks on a peer's formatting, while still never emitting a format a peer must tolerate.
/// </summary>
public sealed class CanonicalUtcDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var text = reader.GetString()
            ?? throw new JsonException("A Field channel timestamp cannot be null.");
        if (!DateTimeOffset.TryParse(
                text,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
                out var value))
        {
            throw new JsonException($"A Field channel timestamp is unreadable: {text}");
        }
        return value.ToUniversalTime();
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToUniversalTime().ToString(Format, CultureInfo.InvariantCulture));
}
