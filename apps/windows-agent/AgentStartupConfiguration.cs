namespace Exosuit.Agent;

public sealed record AgentStartupConfiguration(
    IDesktopProvider Provider,
    ControlMode InitialMode,
    bool PhysicalInputEnabled,
    bool LocalFullControlEnabled,
    IReadOnlySet<string> AllowedProcessNames);

public static class AgentStartupConfigurationResolver
{
    public const string WindowsProviderAcknowledgement = "I_UNDERSTAND_WINDOWS_UI_AUTOMATION_RISK";
    public const string FullControlAcknowledgement = "I_UNDERSTAND_RAW_INPUT_CAN_CONTROL_THIS_DESKTOP";

    public static AgentStartupConfiguration Resolve(
        string? providerRaw,
        string? windowsProviderAcknowledgement,
        string? physicalInputRaw,
        string? fullControlAcknowledgement,
        string? initialModeRaw,
        IReadOnlySet<string> allowedProcessNames)
    {
        ArgumentNullException.ThrowIfNull(allowedProcessNames);
        var providerName = (providerRaw ?? "fake").Trim().ToLowerInvariant();
        var physicalInputRequested = string.Equals(physicalInputRaw, "true", StringComparison.OrdinalIgnoreCase);
        var initialMode = NormalizeInitialMode(initialModeRaw, providerName);
        var fullControlAcknowledged = string.Equals(
            fullControlAcknowledgement,
            FullControlAcknowledgement,
            StringComparison.Ordinal);

        if (providerName == "fake")
        {
            if (physicalInputRequested || fullControlAcknowledged || initialMode == ControlMode.FullControl)
                throw new InvalidOperationException("The fake provider cannot enable physical input or full control.");
            return new AgentStartupConfiguration(
                new FakeDesktopProvider(),
                ControlMode.Sandbox,
                PhysicalInputEnabled: false,
                LocalFullControlEnabled: false,
                allowedProcessNames);
        }

        if (providerName != "windows")
            throw new InvalidOperationException("EXOSUIT_PROVIDER must be fake or windows.");
        if (!string.Equals(windowsProviderAcknowledgement, WindowsProviderAcknowledgement, StringComparison.Ordinal))
            throw new InvalidOperationException(
                $"The Windows provider requires EXOSUIT_ENABLE_WINDOWS_PROVIDER={WindowsProviderAcknowledgement}.");

        var semanticProvider = new WindowsUiAutomationProvider();
        if (initialMode != ControlMode.FullControl)
        {
            if (physicalInputRequested || fullControlAcknowledged)
                throw new InvalidOperationException(
                    "Physical input and its acknowledgement are accepted only when EXOSUIT_INITIAL_MODE=full_control.");
            return new AgentStartupConfiguration(
                semanticProvider,
                ControlMode.Observe,
                PhysicalInputEnabled: false,
                LocalFullControlEnabled: false,
                allowedProcessNames);
        }

        if (!physicalInputRequested)
            throw new InvalidOperationException("Full control requires EXOSUIT_ENABLE_PHYSICAL_INPUT=true.");
        if (!fullControlAcknowledged)
            throw new InvalidOperationException(
                $"Full control requires EXOSUIT_FULL_CONTROL_ACK={FullControlAcknowledgement}.");
        if (allowedProcessNames.Count == 0)
            throw new InvalidOperationException("Full control requires at least one locally allowlisted process.");

        return new AgentStartupConfiguration(
            new MotorizedDesktopProvider(semanticProvider, new WindowsSendInputMotorDriver()),
            ControlMode.FullControl,
            PhysicalInputEnabled: true,
            LocalFullControlEnabled: true,
            allowedProcessNames);
    }

    private static ControlMode NormalizeInitialMode(string? raw, string providerName)
    {
        var normalized = string.IsNullOrWhiteSpace(raw)
            ? (providerName == "fake" ? "sandbox" : "observe")
            : raw.Trim().ToLowerInvariant();
        return normalized switch
        {
            "sandbox" when providerName == "fake" => ControlMode.Sandbox,
            "observe" when providerName == "windows" => ControlMode.Observe,
            "full_control" when providerName == "windows" => ControlMode.FullControl,
            _ => throw new InvalidOperationException(
                "EXOSUIT_INITIAL_MODE must be sandbox for fake, or observe/full_control for windows.")
        };
    }
}
