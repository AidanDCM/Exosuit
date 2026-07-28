using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;

namespace Exosuit.Agent;

public interface IDesktopProvider
{
    string Name { get; }
    Task<DesktopObservation> ObserveAsync(ObservationRequest request, AgentRuntimeState state, CancellationToken cancellationToken);
    Task<ProviderExecution> ExecuteAsync(DesktopAction action, CancellationToken cancellationToken);
    Task<(bool Passed, string Summary, IReadOnlyDictionary<string, object?> Evidence)> VerifyAsync(
        VerificationExpectation expectation,
        ProviderExecution execution,
        CancellationToken cancellationToken);
    Task CancelAsync(CancellationToken cancellationToken);
}

public sealed class FakeDesktopProvider : IDesktopProvider
{
    private readonly object _sync = new();
    private string _activeWindowId = "win-notepad";
    private string _editorText = string.Empty;
    private string _savedText = string.Empty;
    private string? _selectedElementId;
    private readonly HashSet<string> _invokedElements = new(StringComparer.Ordinal);

    private readonly WindowInfo[] _windows =
    {
        new("win-notepad", "Exosuit Test Notepad", "exosuit-fake-notepad", 101, true, false,
            new Bounds(100, 100, 800, 600)),
        new("win-calculator", "Exosuit Test Calculator", "exosuit-fake-calculator", 102, false, false,
            new Bounds(950, 100, 400, 600))
    };

    private readonly UiElement[] _elements =
    {
        new("el-editor", "win-notepad", "Document text", "Edit", "editor", string.Empty, true, true, false, false,
            new Bounds(120, 160, 740, 450), ElementSource.Fake, new[] { ActionType.SetElementValue }),
        new("el-save", "win-notepad", "Save test document", "Button", "save", null, true, false, false, false,
            new Bounds(760, 115, 100, 32), ElementSource.Fake, new[] { ActionType.InvokeElement }),
        new("el-seven", "win-calculator", "Seven", "Button", "num7", null, true, false, false, false,
            new Bounds(980, 300, 80, 60), ElementSource.Fake, new[] { ActionType.InvokeElement })
    };

    public string Name => "fake-sandbox";

    public Task<DesktopObservation> ObserveAsync(
        ObservationRequest request,
        AgentRuntimeState state,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_sync)
        {
            var windows = _windows.Select(window => window with { IsActive = window.Id == _activeWindowId }).ToArray();
            var elements = request.IncludeElements
                ? _elements.Where(element => request.WindowId is null || element.WindowId == request.WindowId)
                    .Take(Math.Clamp(request.MaxElements, 1, 2_000))
                    .Select(element => element with
                    {
                        Value = element.Id == "el-editor" ? _editorText : element.Value,
                        Focused = element.Id == _selectedElementId || element.Focused
                    })
                    .ToArray()
                : Array.Empty<UiElement>();
            var warnings = request.IncludeScreenshot
                ? new[] { "The fake provider does not return screenshot bytes." }
                : Array.Empty<string>();
            return Task.FromResult(new DesktopObservation(
                $"obs-{Guid.NewGuid():D}",
                DateTimeOffset.UtcNow,
                state.Mode,
                Name,
                windows.FirstOrDefault(static window => window.IsActive),
                windows,
                elements,
                null,
                null,
                warnings));
        }
    }

    public Task<ProviderExecution> ExecuteAsync(DesktopAction action, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_sync)
        {
            switch (action.ActionType)
            {
                case ActionType.FocusWindow:
                    if (action.TargetWindowId is null || _windows.All(window => window.Id != action.TargetWindowId))
                        return Task.FromResult(Failure("Window not found."));
                    _activeWindowId = action.TargetWindowId;
                    break;
                case ActionType.SetElementValue:
                    if (action.TargetElementId != "el-editor") return Task.FromResult(Failure("The fake element does not support value setting."));
                    _editorText = action.Text ?? string.Empty;
                    _selectedElementId = "el-editor";
                    break;
                case ActionType.InvokeElement:
                    if (action.TargetElementId is null || _elements.All(element => element.Id != action.TargetElementId))
                        return Task.FromResult(Failure("Element not found."));
                    _invokedElements.Add(action.TargetElementId);
                    if (action.TargetElementId == "el-save") _savedText = _editorText;
                    break;
                case ActionType.SelectElement:
                    if (action.TargetElementId is null || _elements.All(element => element.Id != action.TargetElementId))
                        return Task.FromResult(Failure("Element not found."));
                    _selectedElementId = action.TargetElementId;
                    break;
                case ActionType.ScrollElement:
                case ActionType.Wait:
                    break;
                default:
                    return Task.FromResult(Failure("The fake provider only executes semantic sandbox actions."));
            }

            return Task.FromResult(new ProviderExecution(
                true,
                "The fake provider completed the semantic action.",
                new Dictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["activeWindowId"] = _activeWindowId,
                    ["editorText"] = _editorText,
                    ["savedText"] = _savedText,
                    ["selectedElementId"] = _selectedElementId,
                    ["invokedElementId"] = action.ActionType == ActionType.InvokeElement ? action.TargetElementId : null
                },
                Array.Empty<string>()));
        }
    }

    public Task<(bool Passed, string Summary, IReadOnlyDictionary<string, object?> Evidence)> VerifyAsync(
        VerificationExpectation expectation,
        ProviderExecution execution,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_sync)
        {
            return Task.FromResult(expectation.Kind switch
            {
                "element_value" => VerifyValue(expectation),
                "element_state" => VerifyState(expectation),
                "window_active" => Result(_activeWindowId == expectation.WindowId,
                    "Expected window is active.", "Expected window is not active.",
                    new Dictionary<string, object?> { ["activeWindowId"] = _activeWindowId }),
                "provider_evidence" => VerifyProviderEvidence(expectation),
                _ => Result(false, string.Empty,
                    $"No verifiable expectation was supplied: {expectation.Reason ?? "unspecified"}",
                    new Dictionary<string, object?>())
            });
        }
    }

    public Task CancelAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private (bool, string, IReadOnlyDictionary<string, object?>) VerifyValue(VerificationExpectation expectation)
    {
        var actual = expectation.ElementId == "el-editor" ? _editorText : null;
        return Result(actual == expectation.Equals,
            "Expected element value is present.", "Element value did not match expectation.",
            new Dictionary<string, object?> { ["actual"] = actual, ["expected"] = expectation.Equals });
    }

    private (bool, string, IReadOnlyDictionary<string, object?>) VerifyState(VerificationExpectation expectation)
    {
        var passed = expectation.State switch
        {
            "invoked" => expectation.ElementId is not null && _invokedElements.Contains(expectation.ElementId),
            "focused" or "selected" => _selectedElementId == expectation.ElementId,
            "enabled" => expectation.ElementId is not null && _elements.Any(element => element.Id == expectation.ElementId && element.Enabled),
            "disabled" => expectation.ElementId is not null && _elements.Any(element => element.Id == expectation.ElementId && !element.Enabled),
            _ => false
        };
        return Result(passed, "Expected element state was observed.", "Expected element state was not observed.",
            new Dictionary<string, object?> { ["state"] = expectation.State });
    }

    private (bool, string, IReadOnlyDictionary<string, object?>) VerifyProviderEvidence(VerificationExpectation expectation)
    {
        var actual = expectation.Key switch
        {
            "savedText" => _savedText,
            "editorText" => _editorText,
            _ => null
        };
        return Result(actual == expectation.Equals, "Provider evidence matched.", "Provider evidence did not match.",
            new Dictionary<string, object?> { ["key"] = expectation.Key, ["actual"] = actual });
    }

    private static ProviderExecution Failure(string summary) => new(false, summary,
        new Dictionary<string, object?>(), Array.Empty<string>());

    private static (bool, string, IReadOnlyDictionary<string, object?>) Result(
        bool passed,
        string success,
        string failure,
        IReadOnlyDictionary<string, object?> evidence) => (passed, passed ? success : failure, evidence);
}

public sealed class WindowsUiAutomationProvider : IDesktopProvider
{
    private readonly SemaphoreSlim _executionGate = new(1, 1);
    private CancellationTokenSource _operationCancellation = new();

    public string Name => "windows-ui-automation";

    public Task<DesktopObservation> ObserveAsync(
        ObservationRequest request,
        AgentRuntimeState state,
        CancellationToken cancellationToken)
    {
        return RunStaAsync(() => ObserveCore(request, state, cancellationToken), cancellationToken);
    }

    public async Task<ProviderExecution> ExecuteAsync(DesktopAction action, CancellationToken cancellationToken)
    {
        await _executionGate.WaitAsync(cancellationToken);
        try
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _operationCancellation.Token);
            return await RunStaAsync(() => ExecuteCore(action, linked.Token), linked.Token);
        }
        finally
        {
            _executionGate.Release();
        }
    }

    public Task<(bool Passed, string Summary, IReadOnlyDictionary<string, object?> Evidence)> VerifyAsync(
        VerificationExpectation expectation,
        ProviderExecution execution,
        CancellationToken cancellationToken)
    {
        return RunStaAsync(() => VerifyCore(expectation, execution, cancellationToken), cancellationToken);
    }

    public Task CancelAsync(CancellationToken cancellationToken)
    {
        var old = Interlocked.Exchange(ref _operationCancellation, new CancellationTokenSource());
        old.Cancel();
        old.Dispose();
        return Task.CompletedTask;
    }

    private DesktopObservation ObserveCore(ObservationRequest request, AgentRuntimeState state, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var root = AutomationElement.RootElement;
        var foreground = NativeMethods.GetForegroundWindow();
        var topLevel = root.FindAll(TreeScope.Children, Condition.TrueCondition).Cast<AutomationElement>().ToArray();
        var windows = topLevel.Select(element => ToWindow(element, foreground)).Where(static item => item is not null).Cast<WindowInfo>().ToArray();
        var activeWindow = windows.FirstOrDefault(static window => window.IsActive);
        var elements = new List<UiElement>();
        var warnings = new List<string>();

        if (request.IncludeElements)
        {
            var selectedWindowId = request.WindowId ?? activeWindow?.Id;
            var selected = topLevel.FirstOrDefault(element => StableElementId(element) == selectedWindowId);
            if (selected is null && selectedWindowId is not null) warnings.Add("The requested window could not be resolved from a fresh UI Automation tree.");
            if (selected is not null)
            {
                var descendants = selected.FindAll(TreeScope.Descendants, Condition.TrueCondition).Cast<AutomationElement>();
                foreach (var element in descendants.Take(Math.Clamp(request.MaxElements, 1, 2_000)))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var converted = ToElement(selectedWindowId!, element);
                    if (converted is not null) elements.Add(converted);
                }
            }
        }

        if (request.IncludeScreenshot)
            warnings.Add("Screenshot capture is intentionally not implemented in the initial Windows provider.");

        return new DesktopObservation(
            $"obs-{Guid.NewGuid():D}", DateTimeOffset.UtcNow, state.Mode, Name, activeWindow,
            windows, elements, null, null, warnings);
    }

    private ProviderExecution ExecuteCore(DesktopAction action, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (action.ActionType == ActionType.Wait)
        {
            var milliseconds = Math.Clamp((action.Delta ?? 1) * 250, 0, 5_000);
            Task.Delay(milliseconds, cancellationToken).GetAwaiter().GetResult();
            return Success("Wait completed.", new Dictionary<string, object?> { ["milliseconds"] = milliseconds });
        }

        var targetWindow = action.TargetWindowId is null ? null : ResolveElement(action.TargetWindowId, TreeScope.Children);
        if (action.ActionType == ActionType.FocusWindow)
        {
            if (targetWindow is null) return Failure("The target window was not found in a fresh UI Automation tree.");
            targetWindow.SetFocus();
            return Success("Window focus request completed.", new Dictionary<string, object?> { ["windowId"] = action.TargetWindowId });
        }

        if (action.TargetElementId is null) return Failure("A semantic action requires a target element ID.");
        var target = ResolveElement(action.TargetElementId, TreeScope.Descendants);
        if (target is null) return Failure("The target element was not found in a fresh UI Automation tree.");
        if (!target.Current.IsEnabled || target.Current.IsOffscreen) return Failure("The target is disabled or offscreen.");
        if (target.Current.IsPassword) return Failure("Password elements are blocked.");

        switch (action.ActionType)
        {
            case ActionType.InvokeElement:
                if (!target.TryGetCurrentPattern(InvokePattern.Pattern, out var invokeObject))
                    return Failure("The target does not expose InvokePattern.");
                ((InvokePattern)invokeObject).Invoke();
                return Success("Element invocation completed.", new Dictionary<string, object?> { ["invokedElementId"] = action.TargetElementId });
            case ActionType.SetElementValue:
                if (!target.TryGetCurrentPattern(ValuePattern.Pattern, out var valueObject))
                    return Failure("The target does not expose ValuePattern.");
                var valuePattern = (ValuePattern)valueObject;
                if (valuePattern.Current.IsReadOnly) return Failure("The target value is read-only.");
                valuePattern.SetValue(action.Text ?? string.Empty);
                return Success("Element value was set.", new Dictionary<string, object?> { ["elementId"] = action.TargetElementId });
            case ActionType.SelectElement:
                if (!target.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var selectionObject))
                    return Failure("The target does not expose SelectionItemPattern.");
                ((SelectionItemPattern)selectionObject).Select();
                return Success("Element selection completed.", new Dictionary<string, object?> { ["selectedElementId"] = action.TargetElementId });
            case ActionType.ScrollElement:
                if (target.TryGetCurrentPattern(ScrollItemPattern.Pattern, out var scrollItemObject))
                {
                    ((ScrollItemPattern)scrollItemObject).ScrollIntoView();
                    return Success("Element was scrolled into view.", new Dictionary<string, object?> { ["elementId"] = action.TargetElementId });
                }
                return Failure("The target does not expose ScrollItemPattern.");
            default:
                return Failure("The Windows UI Automation provider only executes semantic UI Automation actions in this release.");
        }
    }

    private (bool, string, IReadOnlyDictionary<string, object?>) VerifyCore(
        VerificationExpectation expectation,
        ProviderExecution execution,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!execution.Succeeded)
            return (false, "Provider execution failed before verification.", execution.Evidence);

        if (expectation.Kind == "provider_evidence")
        {
            execution.Evidence.TryGetValue(expectation.Key ?? string.Empty, out var actual);
            var passed = string.Equals(actual?.ToString(), expectation.Equals, StringComparison.Ordinal);
            return (passed, passed ? "Provider evidence matched." : "Provider evidence did not match.",
                new Dictionary<string, object?> { ["key"] = expectation.Key, ["actual"] = actual });
        }

        if (expectation.Kind == "window_active" && expectation.WindowId is not null)
        {
            var foreground = NativeMethods.GetForegroundWindow();
            var window = ResolveElement(expectation.WindowId, TreeScope.Children);
            var actualHandle = window?.Current.NativeWindowHandle ?? 0;
            var passed = actualHandle != 0 && foreground == new IntPtr(actualHandle);
            return (passed, passed ? "Expected window is active." : "Expected window is not active.",
                new Dictionary<string, object?> { ["nativeWindowHandle"] = actualHandle });
        }

        if (expectation.ElementId is null)
            return (false, "Verification requires an element ID.", new Dictionary<string, object?>());
        var element = ResolveElement(expectation.ElementId, TreeScope.Descendants);
        if (element is null)
            return (false, "The verification element could not be resolved.", new Dictionary<string, object?>());

        if (expectation.Kind == "element_value")
        {
            if (element.Current.IsPassword)
                return (false, "Password values cannot be verified or returned.", new Dictionary<string, object?>());
            var actual = TryReadValue(element);
            var passed = string.Equals(actual, expectation.Equals, StringComparison.Ordinal);
            return (passed, passed ? "Expected element value is present." : "Element value did not match expectation.",
                new Dictionary<string, object?> { ["actual"] = actual, ["expected"] = expectation.Equals });
        }

        if (expectation.Kind == "element_state")
        {
            var passed = expectation.State switch
            {
                "enabled" => element.Current.IsEnabled,
                "disabled" => !element.Current.IsEnabled,
                "focused" => element.Current.HasKeyboardFocus,
                "selected" when element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var pattern) =>
                    ((SelectionItemPattern)pattern).Current.IsSelected,
                "invoked" => execution.Evidence.TryGetValue("invokedElementId", out var invoked) &&
                    string.Equals(invoked?.ToString(), expectation.ElementId, StringComparison.Ordinal),
                _ => false
            };
            return (passed, passed ? "Expected element state was observed." : "Expected element state was not observed.",
                new Dictionary<string, object?> { ["state"] = expectation.State });
        }

        return (false, $"Unsupported verification kind: {expectation.Kind}", new Dictionary<string, object?>());
    }

    private static WindowInfo? ToWindow(AutomationElement element, IntPtr foreground)
    {
        try
        {
            var id = StableElementId(element);
            var rectangle = element.Current.BoundingRectangle;
            var handle = new IntPtr(element.Current.NativeWindowHandle);
            var (processId, processName) = WindowProcessIdentity.Resolve(
                element.Current.ProcessId,
                handle,
                static windowHandle => NativeMethods.TryGetWindowProcessId(windowHandle),
                static id => Process.GetProcessById(id).ProcessName);
            return new WindowInfo(id, element.Current.Name ?? string.Empty, processName, processId,
                handle != IntPtr.Zero && handle == foreground, element.Current.IsOffscreen,
                rectangle.IsEmpty ? null : new Bounds(rectangle.X, rectangle.Y, rectangle.Width, rectangle.Height));
        }
        catch (ElementNotAvailableException) { return null; }
    }

    private static UiElement? ToElement(string windowId, AutomationElement element)
    {
        try
        {
            var sensitive = element.Current.IsPassword;
            var rectangle = element.Current.BoundingRectangle;
            var supported = new List<ActionType>();
            if (element.TryGetCurrentPattern(InvokePattern.Pattern, out _)) supported.Add(ActionType.InvokeElement);
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out _)) supported.Add(ActionType.SetElementValue);
            if (element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out _)) supported.Add(ActionType.SelectElement);
            if (element.TryGetCurrentPattern(ScrollItemPattern.Pattern, out _)) supported.Add(ActionType.ScrollElement);
            var value = sensitive ? null : TryReadValue(element);
            return new UiElement(
                StableElementId(element), windowId, element.Current.Name ?? string.Empty,
                element.Current.ControlType?.ProgrammaticName?.Replace("ControlType.", string.Empty, StringComparison.Ordinal) ?? "Unknown",
                string.IsNullOrWhiteSpace(element.Current.AutomationId) ? null : element.Current.AutomationId,
                value, element.Current.IsEnabled, element.Current.HasKeyboardFocus, element.Current.IsOffscreen, sensitive,
                rectangle.IsEmpty ? null : new Bounds(rectangle.X, rectangle.Y, rectangle.Width, rectangle.Height),
                ElementSource.Accessibility, supported);
        }
        catch (ElementNotAvailableException) { return null; }
    }

    private static string? TryReadValue(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var valueObject))
                return ((ValuePattern)valueObject).Current.Value;
            return null;
        }
        catch (ElementNotAvailableException) { return null; }
    }

    private static AutomationElement? ResolveElement(string stableId, TreeScope scope)
    {
        var root = AutomationElement.RootElement;
        var collection = root.FindAll(scope, Condition.TrueCondition);
        foreach (AutomationElement element in collection)
        {
            try
            {
                if (StableElementId(element) == stableId) return element;
            }
            catch (ElementNotAvailableException) { }
        }
        return null;
    }

    private static string StableElementId(AutomationElement element)
    {
        var runtimeId = element.GetRuntimeId();
        return runtimeId is { Length: > 0 }
            ? $"uia-{string.Join('-', runtimeId)}"
            : $"uia-p{element.Current.ProcessId}-h{element.Current.NativeWindowHandle}-a{element.Current.AutomationId}";
    }

    private static ProviderExecution Success(string summary, IReadOnlyDictionary<string, object?> evidence) =>
        new(true, summary, evidence, Array.Empty<string>());

    private static ProviderExecution Failure(string summary) =>
        new(false, summary, new Dictionary<string, object?>(), Array.Empty<string>());

    private static Task<T> RunStaAsync<T>(Func<T> work, CancellationToken cancellationToken)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                completion.SetResult(work());
            }
            catch (OperationCanceledException) { completion.SetCanceled(cancellationToken); }
            catch (Exception error) { completion.SetException(error); }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        return completion.Task;
    }

    private static class NativeMethods
    {
        [DllImport("user32.dll")]
        internal static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        internal static int TryGetWindowProcessId(IntPtr windowHandle)
        {
            if (windowHandle == IntPtr.Zero) return 0;
            _ = GetWindowThreadProcessId(windowHandle, out var processId);
            return processId <= int.MaxValue ? (int)processId : 0;
        }
    }
}

internal static class WindowProcessIdentity
{
    internal static (int ProcessId, string ProcessName) Resolve(
        int automationProcessId,
        IntPtr windowHandle,
        Func<IntPtr, int> getWindowProcessId,
        Func<int, string> getProcessName)
    {
        var processId = automationProcessId > 0 ? automationProcessId : getWindowProcessId(windowHandle);
        if (processId <= 0) return (0, "unknown");
        try { return (processId, getProcessName(processId)); }
        catch (ArgumentException) { return (processId, "unknown"); }
        catch (InvalidOperationException) { return (processId, "unknown"); }
    }
}
