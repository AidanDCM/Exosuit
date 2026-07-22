using System.Collections;
using System.Text.RegularExpressions;

namespace Exosuit.Agent;

public enum ExosuitSubsystem { Glove, Field }
public enum FieldOperatingMode { Teach, Shadow, Pilot }
public enum FieldLifecycle { Planned, Provisioning, Ready, Teaching, Shadowing, Piloting, Stopping, Stopped, Faulted, Destroyed }

public sealed record FieldReference(Guid FieldId, int FieldGeneration)
{
    public void Validate()
    {
        if (FieldId == Guid.Empty) throw new ArgumentException("Field ID cannot be empty.", nameof(FieldId));
        if (FieldGeneration < 1) throw new ArgumentOutOfRangeException(nameof(FieldGeneration), "Field generation must be positive.");
    }
}

public sealed record FieldIdentity(
    ExosuitSubsystem Subsystem,
    FieldReference Field,
    string AgentId,
    string MachineId,
    string WindowsSessionId,
    string BaseImageDigest,
    string? PersonalStateDigest,
    string TaskDiskId,
    DateTimeOffset CreatedAt)
{
    public void Validate()
    {
        if (Subsystem != ExosuitSubsystem.Field) throw new ArgumentException("A field identity must use the Field subsystem.");
        Field.Validate();
        RequireText(AgentId, nameof(AgentId));
        RequireText(MachineId, nameof(MachineId));
        RequireText(WindowsSessionId, nameof(WindowsSessionId));
        RequireDigest(BaseImageDigest, nameof(BaseImageDigest));
        if (PersonalStateDigest is not null) RequireDigest(PersonalStateDigest, nameof(PersonalStateDigest));
        RequireText(TaskDiskId, nameof(TaskDiskId));
    }

    private static void RequireText(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException($"{name} cannot be empty.", name);
    }

    private static void RequireDigest(string value, string name)
    {
        if (value.Length != 64 || value.Any(character => !Uri.IsHexDigit(character)))
            throw new ArgumentException($"{name} must be a 64-character hexadecimal digest.", name);
    }
}

public sealed record FieldDisplayContract(
    int MonitorCount,
    int Width,
    int Height,
    int ScalePercent,
    int BrowserZoomPercent,
    string KeyboardLayout,
    bool DynamicResolutionAllowed)
{
    public void Validate()
    {
        if (MonitorCount != 1) throw new ArgumentOutOfRangeException(nameof(MonitorCount), "The initial field contract requires exactly one monitor.");
        if (Width is < 1024 or > 7680) throw new ArgumentOutOfRangeException(nameof(Width));
        if (Height is < 720 or > 4320) throw new ArgumentOutOfRangeException(nameof(Height));
        if (ScalePercent is < 100 or > 200) throw new ArgumentOutOfRangeException(nameof(ScalePercent));
        if (BrowserZoomPercent is < 50 or > 200) throw new ArgumentOutOfRangeException(nameof(BrowserZoomPercent));
        if (string.IsNullOrWhiteSpace(KeyboardLayout)) throw new ArgumentException("Keyboard layout cannot be empty.", nameof(KeyboardLayout));
        if (DynamicResolutionAllowed) throw new ArgumentException("Dynamic resolution is forbidden while a field contract is active.");
    }
}

public sealed record FieldRuntimeRecord(
    ExosuitSubsystem Subsystem,
    FieldIdentity Identity,
    FieldLifecycle Lifecycle,
    string GloveAgentId,
    DateTimeOffset UpdatedAt,
    string? FaultReason = null);

public sealed class FieldLifecycleState
{
    private readonly object _sync = new();
    private FieldRuntimeRecord _record;

    public FieldLifecycleState(FieldIdentity identity, string gloveAgentId, DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(identity);
        identity.Validate();
        if (string.IsNullOrWhiteSpace(gloveAgentId)) throw new ArgumentException("Glove agent ID cannot be empty.", nameof(gloveAgentId));
        _record = new FieldRuntimeRecord(ExosuitSubsystem.Field, identity, FieldLifecycle.Planned, gloveAgentId, now ?? DateTimeOffset.UtcNow);
    }

    public FieldRuntimeRecord Snapshot()
    {
        lock (_sync) return _record;
    }

    public FieldRuntimeRecord Transition(FieldLifecycle next, string? faultReason = null, DateTimeOffset? now = null)
    {
        lock (_sync)
        {
            if (!CanTransition(_record.Lifecycle, next))
                throw new InvalidOperationException($"Field lifecycle cannot transition from {_record.Lifecycle} to {next}.");
            if (next == FieldLifecycle.Faulted && string.IsNullOrWhiteSpace(faultReason))
                throw new InvalidOperationException("A faulted field requires a fault reason.");
            if (next != FieldLifecycle.Faulted && faultReason is not null)
                throw new InvalidOperationException("Fault reasons are only valid for the Faulted lifecycle.");
            _record = _record with
            {
                Lifecycle = next,
                UpdatedAt = now ?? DateTimeOffset.UtcNow,
                FaultReason = next == FieldLifecycle.Faulted ? faultReason : null
            };
            return _record;
        }
    }

    public FieldRuntimeRecord AssertModeReady(FieldOperatingMode mode, string gloveAgentId)
    {
        lock (_sync)
        {
            if (!string.Equals(_record.GloveAgentId, gloveAgentId, StringComparison.Ordinal))
                throw new InvalidOperationException("The glove agent is not bound to this field generation.");
            var required = mode switch
            {
                FieldOperatingMode.Teach => FieldLifecycle.Teaching,
                FieldOperatingMode.Shadow => FieldLifecycle.Shadowing,
                FieldOperatingMode.Pilot => FieldLifecycle.Piloting,
                _ => throw new ArgumentOutOfRangeException(nameof(mode))
            };
            if (_record.Lifecycle != required)
                throw new InvalidOperationException($"Field must be in {required} lifecycle before {mode} work can run.");
            return _record;
        }
    }

    public static bool CanTransition(FieldLifecycle current, FieldLifecycle next) => current switch
    {
        FieldLifecycle.Planned => next is FieldLifecycle.Provisioning or FieldLifecycle.Destroyed,
        FieldLifecycle.Provisioning => next is FieldLifecycle.Ready or FieldLifecycle.Faulted or FieldLifecycle.Stopping,
        FieldLifecycle.Ready => next is FieldLifecycle.Teaching or FieldLifecycle.Shadowing or FieldLifecycle.Piloting or FieldLifecycle.Stopping or FieldLifecycle.Faulted,
        FieldLifecycle.Teaching or FieldLifecycle.Shadowing or FieldLifecycle.Piloting => next is FieldLifecycle.Ready or FieldLifecycle.Stopping or FieldLifecycle.Faulted,
        FieldLifecycle.Stopping => next is FieldLifecycle.Stopped or FieldLifecycle.Faulted,
        FieldLifecycle.Stopped => next is FieldLifecycle.Provisioning or FieldLifecycle.Destroyed,
        FieldLifecycle.Faulted => next is FieldLifecycle.Stopping or FieldLifecycle.Destroyed,
        FieldLifecycle.Destroyed => false,
        _ => false
    };
}

public static partial class DemonstrationPayloadRedactor
{
    [GeneratedRegex("password|passcode|secret|token|cookie|authorization|private.?key|seed.?phrase|recovery.?code|cvv|social.?security", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SensitiveKeyPattern();

    public static IReadOnlyDictionary<string, object?> Redact(IReadOnlyDictionary<string, object?> payload) =>
        payload.ToDictionary(pair => pair.Key, pair => SensitiveKeyPattern().IsMatch(pair.Key) ? "[REDACTED]" : RedactValue(pair.Value), StringComparer.Ordinal);

    private static object? RedactValue(object? value)
    {
        if (value is null or string or ValueType) return value;
        if (value is IReadOnlyDictionary<string, object?> readOnly) return Redact(readOnly);
        if (value is IDictionary<string, object?> dictionary) return Redact(new Dictionary<string, object?>(dictionary, StringComparer.Ordinal));
        if (value is IEnumerable sequence) return sequence.Cast<object?>().Select(RedactValue).ToArray();
        return value.ToString();
    }
}
