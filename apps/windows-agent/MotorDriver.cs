using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace Exosuit.Agent;

public sealed record MotorProfile(
    int DurationMilliseconds = 320,
    int Steps = 48,
    double Bend = 0.14,
    int InterKeyDelayMilliseconds = 8)
{
    public MotorProfile Bounded() => this with
    {
        DurationMilliseconds = Math.Clamp(DurationMilliseconds, 40, 3_000),
        Steps = Math.Clamp(Steps, 2, 240),
        Bend = Math.Clamp(Bend, -0.5, 0.5),
        InterKeyDelayMilliseconds = Math.Clamp(InterKeyDelayMilliseconds, 0, 100)
    };
}

public sealed record MotorExecution(
    bool Succeeded,
    string Summary,
    IReadOnlyDictionary<string, object?> Evidence);

public interface IMotorDriver
{
    string Name { get; }
    Task<MotorExecution> MovePointerAsync(Point target, MotorProfile profile, CancellationToken cancellationToken);
    Task<MotorExecution> ClickAsync(Point target, MotorProfile profile, CancellationToken cancellationToken);
    Task<MotorExecution> TypeTextAsync(string text, MotorProfile profile, CancellationToken cancellationToken);
    Task<MotorExecution> HotkeyAsync(IReadOnlyList<string> keys, MotorProfile profile, CancellationToken cancellationToken);
    Task CancelAsync(CancellationToken cancellationToken);
}

public sealed class SimulatedMotorDriver : IMotorDriver
{
    private readonly ConcurrentQueue<string> _events = new();
    private CancellationTokenSource _operationCancellation = new();

    public string Name => "simulated-motor";
    public IReadOnlyList<string> Events => _events.ToArray();

    public async Task<MotorExecution> MovePointerAsync(Point target, MotorProfile profile, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _operationCancellation.Token);
        var bounded = profile.Bounded();
        await Task.Delay(Math.Min(bounded.DurationMilliseconds, 25), linked.Token);
        _events.Enqueue($"move:{target.X:0.###},{target.Y:0.###}:{bounded.Steps}");
        return Success("Simulated pointer movement completed.", ("x", target.X), ("y", target.Y), ("steps", bounded.Steps));
    }

    public async Task<MotorExecution> ClickAsync(Point target, MotorProfile profile, CancellationToken cancellationToken)
    {
        var move = await MovePointerAsync(target, profile, cancellationToken);
        if (!move.Succeeded) return move;
        _events.Enqueue("click:left");
        return Success("Simulated left click completed.", ("x", target.X), ("y", target.Y));
    }

    public async Task<MotorExecution> TypeTextAsync(string text, MotorProfile profile, CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _operationCancellation.Token);
        var bounded = profile.Bounded();
        foreach (var character in text)
        {
            linked.Token.ThrowIfCancellationRequested();
            _events.Enqueue($"type:{(int)character}");
            if (bounded.InterKeyDelayMilliseconds > 0)
                await Task.Delay(Math.Min(bounded.InterKeyDelayMilliseconds, 5), linked.Token);
        }
        return Success("Simulated text input completed.", ("characterCount", text.Length));
    }

    public Task<MotorExecution> HotkeyAsync(IReadOnlyList<string> keys, MotorProfile profile, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var normalized = VirtualKeyMap.NormalizeAndValidate(keys);
        _events.Enqueue($"hotkey:{string.Join('+', normalized)}");
        return Task.FromResult(Success("Simulated hotkey completed.", ("keys", normalized)));
    }

    public Task CancelAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var previous = Interlocked.Exchange(ref _operationCancellation, new CancellationTokenSource());
        previous.Cancel();
        previous.Dispose();
        _events.Enqueue("cancel");
        return Task.CompletedTask;
    }

    private static MotorExecution Success(string summary, params (string Key, object? Value)[] evidence) =>
        new(true, summary, evidence.ToDictionary(static item => item.Key, static item => item.Value, StringComparer.Ordinal));
}

public sealed class WindowsSendInputMotorDriver : IMotorDriver
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CancellationTokenSource _operationCancellation = new();

    public string Name => "windows-sendinput";

    public Task<MotorExecution> MovePointerAsync(Point target, MotorProfile profile, CancellationToken cancellationToken) =>
        RunExclusiveAsync(token => MovePointerCoreAsync(target, profile.Bounded(), token), cancellationToken);

    public Task<MotorExecution> ClickAsync(Point target, MotorProfile profile, CancellationToken cancellationToken) =>
        RunExclusiveAsync(async token =>
        {
            var movement = await MovePointerCoreAsync(target, profile.Bounded(), token);
            if (!movement.Succeeded) return movement;
            SendOrThrow(new[]
            {
                NativeInput.Mouse(NativeInput.MouseLeftDown),
                NativeInput.Mouse(NativeInput.MouseLeftUp)
            });
            return Success("Pointer moved and a standard Windows left click was injected.",
                ("x", target.X), ("y", target.Y), ("driver", Name));
        }, cancellationToken);

    public Task<MotorExecution> TypeTextAsync(string text, MotorProfile profile, CancellationToken cancellationToken) =>
        RunExclusiveAsync(async token =>
        {
            if (text.Length > 2_000) return Failure("Physical text input is limited to 2,000 UTF-16 code units per action.");
            var bounded = profile.Bounded();
            foreach (var character in text)
            {
                token.ThrowIfCancellationRequested();
                SendOrThrow(new[]
                {
                    NativeInput.Unicode(character, keyUp: false),
                    NativeInput.Unicode(character, keyUp: true)
                });
                if (bounded.InterKeyDelayMilliseconds > 0)
                    await Task.Delay(bounded.InterKeyDelayMilliseconds, token);
            }
            return Success("Standard Windows Unicode input completed.",
                ("characterCount", text.Length), ("driver", Name));
        }, cancellationToken);

    public Task<MotorExecution> HotkeyAsync(IReadOnlyList<string> keys, MotorProfile profile, CancellationToken cancellationToken) =>
        RunExclusiveAsync(async token =>
        {
            var normalized = VirtualKeyMap.NormalizeAndValidate(keys);
            var virtualKeys = normalized.Select(VirtualKeyMap.Resolve).ToArray();
            foreach (var key in virtualKeys)
            {
                token.ThrowIfCancellationRequested();
                SendOrThrow(new[] { NativeInput.VirtualKey(key, keyUp: false) });
            }
            await Task.Delay(20, token);
            foreach (var key in virtualKeys.Reverse())
            {
                token.ThrowIfCancellationRequested();
                SendOrThrow(new[] { NativeInput.VirtualKey(key, keyUp: true) });
            }
            return Success("Standard Windows hotkey input completed.",
                ("keys", normalized), ("driver", Name));
        }, cancellationToken);

    public Task CancelAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var previous = Interlocked.Exchange(ref _operationCancellation, new CancellationTokenSource());
        previous.Cancel();
        previous.Dispose();
        return Task.CompletedTask;
    }

    private async Task<MotorExecution> MovePointerCoreAsync(Point target, MotorProfile profile, CancellationToken cancellationToken)
    {
        if (!double.IsFinite(target.X) || !double.IsFinite(target.Y)) return Failure("Pointer target must be finite.");
        if (!NativeInput.GetCursorPos(out var current)) return Failure("Windows did not return the current pointer position.");
        var start = new Point(current.X, current.Y);
        var trajectory = MotorTrajectory.CubicBezier(start, target, profile.Steps, profile.Bend);
        var delay = Math.Max(1, profile.DurationMilliseconds / Math.Max(1, trajectory.Count - 1));
        foreach (var point in trajectory.Skip(1))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!NativeInput.SetCursorPos((int)Math.Round(point.X), (int)Math.Round(point.Y)))
                return Failure("Windows rejected pointer positioning.");
            await Task.Delay(delay, cancellationToken);
        }
        return Success("Pointer followed a bounded eased trajectory.",
            ("startX", start.X), ("startY", start.Y),
            ("endX", target.X), ("endY", target.Y),
            ("steps", trajectory.Count), ("durationMilliseconds", profile.DurationMilliseconds),
            ("driver", Name));
    }

    private async Task<MotorExecution> RunExclusiveAsync(
        Func<CancellationToken, Task<MotorExecution>> operation,
        CancellationToken requestCancellationToken)
    {
        await _gate.WaitAsync(requestCancellationToken);
        try
        {
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(
                requestCancellationToken, _operationCancellation.Token);
            return await operation(linked.Token);
        }
        finally
        {
            _gate.Release();
        }
    }

    private static void SendOrThrow(NativeInput.INPUT[] inputs)
    {
        var sent = NativeInput.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<NativeInput.INPUT>());
        if (sent != inputs.Length)
            throw new InvalidOperationException($"Windows SendInput accepted {sent} of {inputs.Length} event(s). Error {Marshal.GetLastWin32Error()}.");
    }

    private static MotorExecution Success(string summary, params (string Key, object? Value)[] evidence) =>
        new(true, summary, evidence.ToDictionary(static item => item.Key, static item => item.Value, StringComparer.Ordinal));

    private static MotorExecution Failure(string summary) =>
        new(false, summary, new Dictionary<string, object?>());

    private static class NativeInput
    {
        internal const uint MouseLeftDown = 0x0002;
        internal const uint MouseLeftUp = 0x0004;
        private const uint InputMouse = 0;
        private const uint InputKeyboard = 1;
        private const uint KeyEventKeyUp = 0x0002;
        private const uint KeyEventUnicode = 0x0004;

        [StructLayout(LayoutKind.Sequential)]
        internal struct POINT
        {
            internal int X;
            internal int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct INPUT
        {
            internal uint Type;
            internal INPUTUNION Union;
        }

        [StructLayout(LayoutKind.Explicit)]
        internal struct INPUTUNION
        {
            [FieldOffset(0)] internal MOUSEINPUT Mouse;
            [FieldOffset(0)] internal KEYBDINPUT Keyboard;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct MOUSEINPUT
        {
            internal int Dx;
            internal int Dy;
            internal uint MouseData;
            internal uint Flags;
            internal uint Time;
            internal UIntPtr ExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct KEYBDINPUT
        {
            internal ushort VirtualKey;
            internal ushort ScanCode;
            internal uint Flags;
            internal uint Time;
            internal UIntPtr ExtraInfo;
        }

        internal static INPUT Mouse(uint flags) => new()
        {
            Type = InputMouse,
            Union = new INPUTUNION { Mouse = new MOUSEINPUT { Flags = flags } }
        };

        internal static INPUT Unicode(char character, bool keyUp) => new()
        {
            Type = InputKeyboard,
            Union = new INPUTUNION
            {
                Keyboard = new KEYBDINPUT
                {
                    ScanCode = character,
                    Flags = KeyEventUnicode | (keyUp ? KeyEventKeyUp : 0)
                }
            }
        };

        internal static INPUT VirtualKey(ushort virtualKey, bool keyUp) => new()
        {
            Type = InputKeyboard,
            Union = new INPUTUNION
            {
                Keyboard = new KEYBDINPUT
                {
                    VirtualKey = virtualKey,
                    Flags = keyUp ? KeyEventKeyUp : 0
                }
            }
        };

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern uint SendInput(uint numberOfInputs, INPUT[] inputs, int sizeOfInputStructure);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetCursorPos(out POINT point);
    }
}

public static class VirtualKeyMap
{
    private static readonly IReadOnlyDictionary<string, ushort> Named = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
    {
        ["CTRL"] = 0x11,
        ["CONTROL"] = 0x11,
        ["SHIFT"] = 0x10,
        ["ALT"] = 0x12,
        ["WIN"] = 0x5B,
        ["ENTER"] = 0x0D,
        ["TAB"] = 0x09,
        ["ESC"] = 0x1B,
        ["ESCAPE"] = 0x1B,
        ["SPACE"] = 0x20,
        ["BACKSPACE"] = 0x08,
        ["DELETE"] = 0x2E,
        ["HOME"] = 0x24,
        ["END"] = 0x23,
        ["PAGEUP"] = 0x21,
        ["PAGEDOWN"] = 0x22,
        ["LEFT"] = 0x25,
        ["UP"] = 0x26,
        ["RIGHT"] = 0x27,
        ["DOWN"] = 0x28
    };

    public static IReadOnlyList<string> NormalizeAndValidate(IReadOnlyList<string> keys)
    {
        if (keys.Count is < 1 or > 8) throw new ArgumentException("A hotkey must contain one through eight keys.", nameof(keys));
        var normalized = keys.Select(static key => key.Trim().ToUpperInvariant()).ToArray();
        if (normalized.Any(string.IsNullOrWhiteSpace)) throw new ArgumentException("Hotkey keys cannot be empty.", nameof(keys));
        foreach (var key in normalized) _ = Resolve(key);
        return normalized;
    }

    public static ushort Resolve(string key)
    {
        if (Named.TryGetValue(key, out var named)) return named;
        if (key.Length == 1)
        {
            var character = key[0];
            if (character is >= 'A' and <= 'Z') return character;
            if (character is >= '0' and <= '9') return character;
        }
        if (key.Length is 2 or 3 && key.StartsWith('F') && int.TryParse(key[1..], out var function) && function is >= 1 and <= 12)
            return (ushort)(0x70 + function - 1);
        throw new ArgumentException($"Unsupported hotkey key: {key}", nameof(key));
    }
}
