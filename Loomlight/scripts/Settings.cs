namespace loomlight
{
    public static class Settings
    {
        // Hardcoded settings
        public static bool HttpLoggingEnabled { get; } = true;
        public static bool PollingLoggingEnabled { get; } = false;
        public static string ApiKey { get; } = "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";
        public static int MaxRetryAttempts { get; } = 5;

        // Additional settings can be added here
    }
}
