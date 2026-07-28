namespace Exosuit.Agent;

public sealed class MotorizedDesktopProvider : IDesktopProvider
{
    private readonly IDesktopProvider _semanticProvider;
    private readonly IMotorDriver _motorDriver;
    private readonly MotorProfile _profile;

    public MotorizedDesktopProvider(
        IDesktopProvider semanticProvider,
        IMotorDriver motorDriver,
        MotorProfile? profile = null)
    {
        _semanticProvider = semanticProvider ?? throw new ArgumentNullException(nameof(semanticProvider));
        _motorDriver = motorDriver ?? throw new ArgumentNullException(nameof(motorDriver));
        _profile = (profile ?? new MotorProfile()).Bounded();
    }

    public string Name => $"{_semanticProvider.Name}+{_motorDriver.Name}";

    public Task<DesktopObservation> ObserveAsync(
        ObservationRequest request,
        AgentRuntimeState state,
        CancellationToken cancellationToken) =>
        _semanticProvider.ObserveAsync(request, state, cancellationToken);

    public async Task<ProviderExecution> ExecuteAsync(DesktopAction action, CancellationToken cancellationToken)
    {
        MotorExecution? motorResult = action.ActionType switch
        {
            ActionType.MovePointer when action.Coordinates is not null =>
                await _motorDriver.MovePointerAsync(action.Coordinates, _profile, cancellationToken),
            ActionType.ClickPointer when action.Coordinates is not null =>
                await _motorDriver.ClickAsync(action.Coordinates, _profile, cancellationToken),
            ActionType.TypeText when action.Text is not null =>
                await _motorDriver.TypeTextAsync(action.Text, _profile, cancellationToken),
            ActionType.Hotkey when action.Keys is not null =>
                await _motorDriver.HotkeyAsync(action.Keys, _profile, cancellationToken),
            ActionType.MovePointer or ActionType.ClickPointer =>
                new MotorExecution(false, "Pointer actions require explicit coordinates.", new Dictionary<string, object?>()),
            ActionType.TypeText =>
                new MotorExecution(false, "Physical text input requires explicit text.", new Dictionary<string, object?>()),
            ActionType.Hotkey =>
                new MotorExecution(false, "A hotkey action requires one through eight supported keys.", new Dictionary<string, object?>()),
            _ => null
        };

        if (motorResult is null) return await _semanticProvider.ExecuteAsync(action, cancellationToken);
        var evidence = new Dictionary<string, object?>(motorResult.Evidence, StringComparer.Ordinal)
        {
            ["motorDriver"] = _motorDriver.Name,
            ["actionType"] = ToWireName(action.ActionType)
        };
        return new ProviderExecution(
            motorResult.Succeeded,
            motorResult.Summary,
            evidence,
            motorResult.Succeeded ? Array.Empty<string>() : new[] { "The motor action did not complete." });
    }

    public Task<(bool Passed, string Summary, IReadOnlyDictionary<string, object?> Evidence)> VerifyAsync(
        VerificationExpectation expectation,
        ProviderExecution execution,
        CancellationToken cancellationToken) =>
        _semanticProvider.VerifyAsync(expectation, execution, cancellationToken);

    public async Task CancelAsync(CancellationToken cancellationToken)
    {
        await Task.WhenAll(
            _semanticProvider.CancelAsync(cancellationToken),
            _motorDriver.CancelAsync(cancellationToken));
    }

    private static string ToWireName(ActionType actionType) => actionType switch
    {
        ActionType.MovePointer => "move_pointer",
        ActionType.ClickPointer => "click_pointer",
        ActionType.TypeText => "type_text",
        ActionType.Hotkey => "hotkey",
        _ => actionType.ToString().ToLowerInvariant()
    };
}
