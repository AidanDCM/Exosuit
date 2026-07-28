namespace Exosuit.Agent;

public sealed class ProviderDeadlineExceededException : TimeoutException
{
    public ProviderDeadlineExceededException(TimeSpan timeout)
        : base($"The desktop provider exceeded its local deadline of {timeout.TotalMilliseconds:0} ms.")
    {
        Timeout = timeout;
    }

    public TimeSpan Timeout { get; }
}

public static class ProviderDeadline
{
    public static async Task<T> RunAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        TimeSpan timeout,
        CancellationToken requestCancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout));

        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(requestCancellationToken);
        deadline.CancelAfter(timeout);
        try
        {
            return await operation(deadline.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!requestCancellationToken.IsCancellationRequested && deadline.IsCancellationRequested)
        {
            throw new ProviderDeadlineExceededException(timeout);
        }
    }

    public static async Task RunAsync(
        Func<CancellationToken, Task> operation,
        TimeSpan timeout,
        CancellationToken requestCancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        await RunAsync(async token =>
        {
            await operation(token).ConfigureAwait(false);
            return true;
        }, timeout, requestCancellationToken).ConfigureAwait(false);
    }

    public static TimeSpan ReadMilliseconds(string? raw, int defaultMilliseconds, int minimumMilliseconds, int maximumMilliseconds)
    {
        if (minimumMilliseconds <= 0 || maximumMilliseconds < minimumMilliseconds)
            throw new ArgumentOutOfRangeException(nameof(minimumMilliseconds));
        var value = int.TryParse(raw, out var parsed) ? parsed : defaultMilliseconds;
        return TimeSpan.FromMilliseconds(Math.Clamp(value, minimumMilliseconds, maximumMilliseconds));
    }
}
