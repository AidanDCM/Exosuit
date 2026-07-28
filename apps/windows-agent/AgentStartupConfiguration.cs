namespace Exosuit.Agent;

public sealed record PhysicalInputStartupDecision(
    ControlMode InitialMode,
    bool PhysicalInputEnabled,
    bool LocalFullControlEnabled);

public static class AgentStartupConfigurationResolver
{
    public const string FullControlAcknowledgement = "I_UNDERSTAND_RAW_INPUT_CAN_CONTROL_THIS_DESKTOP";

    public static PhysicalInputStartupDecision ResolvePhysicalInput(
        string? providerRaw,
        ControlMode safeDefaultMode,
        bool physicalInputRequested,
        string? fullControlAcknowledgement,
        string? initialModeRaw,
        IReadOnlySet<string> allowedProcessNames)
    {
        ArgumentNullException.ThrowIfNull(allowedProcessNames);
        var providerName = (providerRaw ?? "fake").Trim().ToLowerInvariant();
        var fullControlRequested = string.Equals(initialModeRaw?.Trim(), "full_control", StringComparison.OrdinalIgnoreCase);
        var fullControlAcknowledged = string.Equals(
            fullControlAcknowledgement,
            FullControlAcknowledgement,
            StringComparison.Ordinal);

        if (!physicalInputRequested)
        {
            if (fullControlRequested || fullControlAcknowledged)
                throw new InvalidOperationException(
                    "Full-control mode or acknowledgement cannot be supplied while physical input is disabled.");
            return new PhysicalInputStartupDecision(safeDefaultMode, false, false);
        }

        if (providerName != "windows")
            throw new InvalidOperationException("Physical input is available only with EXOSUIT_PROVIDER=windows.");
        if (!fullControlRequested)
            throw new InvalidOperationException("Physical input requires EXOSUIT_INITIAL_MODE=full_control.");
        if (!fullControlAcknowledged)
            throw new InvalidOperationException(
                $"Physical input requires EXOSUIT_FULL_CONTROL_ACK={FullControlAcknowledgement}.");
        if (allowedProcessNames.Count == 0)
            throw new InvalidOperationException("Physical input requires at least one locally allowlisted process.");

        return new PhysicalInputStartupDecision(ControlMode.FullControl, true, true);
    }
}
