using System.Collections.Frozen;

namespace TradingAgent.Core.Secrets;

/// <summary>The secrets the app knows. Saving any other name is refused.</summary>
public static class SecretNames
{
    public const string AnthropicApiKey = "anthropic_api_key";
    public const string OpenAiApiKey = "openai_api_key";
    public const string OkxApiKey = "okx_api_key";
    public const string OkxSecretKey = "okx_secret_key";
    public const string OkxPassphrase = "okx_passphrase";
    public const string BraveSearchApiKey = "brave_search_api_key";
    public const string SmtpPassword = "smtp_password";

    public static FrozenSet<string> All { get; } = FrozenSet.ToFrozenSet(
    [
        AnthropicApiKey,
        OpenAiApiKey,
        OkxApiKey,
        OkxSecretKey,
        OkxPassphrase,
        BraveSearchApiKey,
        SmtpPassword,
    ]);
}
