namespace Exosuit.FieldOwner;

public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && string.Equals(args[0], "--service", StringComparison.Ordinal))
            {
                return FieldOwnerServiceHost.Run();
            }
            if (args.Length == 2 && string.Equals(args[0], "--validate-policy", StringComparison.Ordinal))
            {
                var policy = FieldOwnerPolicyStore.Load(args[1]);
                Console.WriteLine(FieldOwnerPolicyStore.SerializeSummary(policy));
                return 0;
            }
            Console.Error.WriteLine("Exosuit Field owner service accepts only --service or --validate-policy <path>.");
            return 2;
        }
        catch (Exception exception) when (exception is InvalidOperationException or IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"Exosuit Field owner service denied startup: {exception.Message}");
            return 1;
        }
    }
}
