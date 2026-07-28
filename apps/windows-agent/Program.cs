namespace Exosuit.Agent;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
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
