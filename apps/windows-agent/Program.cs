namespace Exosuit.Agent;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && string.Equals(args[0], "--field-guest-kvp", StringComparison.Ordinal))
            {
                await FieldKvpRuntime.RunGuestAsync(args[1], CancellationToken.None);
                return 0;
            }
            if (args.Length == 4 && string.Equals(args[0], "--field-verify-envelope", StringComparison.Ordinal))
            {
                FieldKvpRuntime.VerifyEnvelope(args[1], args[2], args[3]);
                return 0;
            }
            await AgentHost.RunAsync(args);
            return 0;
        }
        catch (InvalidOperationException exception)
        {
            Console.Error.WriteLine($"Exosuit startup denied: {exception.Message}");
            return 1;
        }
    }
}
