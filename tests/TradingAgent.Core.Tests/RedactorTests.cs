using TradingAgent.Core.Logging;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class RedactorTests
{
    // Sample values are low-entropy on purpose, and the JWT is assembled at run time, so that secret
    // scanners do not mistake these fixtures for leaked credentials.
    private const string KeyValue = "abcdabcdabcdab";

    private static readonly string _jwt = string.Join('.', "eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTYifQ", "c2lnbmF0dXJlLXZhbHVl");

    [Fact]
    public void Quoted_api_key_is_replaced_by_its_length()
    {
        var result = Redactor.Redact($"api_key=\"{KeyValue}\" loading config", userProfile: null);

        Assert.DoesNotContain(KeyValue, result, StringComparison.Ordinal);
        Assert.Contains("api_key=<redacted:14>", result, StringComparison.Ordinal);
        Assert.EndsWith("loading config", result, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("secretKey: abcdabcdabcdabcd", "secretKey=<redacted:16>")]
    [InlineData("okx_secret_key=abcdabcdabcdabcd", "okx_secret_key=<redacted:16>")]
    [InlineData("\"passphrase\": \"abcdabcdabcdab\"", "passphrase=<redacted:14>")]
    [InlineData("--token abcdabcdabcd", "--token=<redacted:12>")]
    [InlineData("sign=abcdabcdabcdabcd&ts=1", "sign=<redacted:16>")]
    public void Credential_keywords_are_redacted_in_every_spelling(string input, string expected)
    {
        var result = Redactor.Redact(input, userProfile: null);

        Assert.Contains(expected, result, StringComparison.Ordinal);
        Assert.DoesNotContain("abcdabcdabcd", result, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("password=abc", "password=<redacted>")]
    [InlineData("token: p@ss!", "token=<redacted>")]
    public void Short_or_symbolic_values_after_an_assignment_are_redacted(string input, string expected)
    {
        Assert.Equal(expected, Redactor.Redact(input, userProfile: null));
    }

    [Fact]
    public void Jwt_is_replaced_and_keeps_its_own_marker_after_bearer()
    {
        var result = Redactor.Redact($"auth bearer {_jwt}", userProfile: null);

        Assert.Equal("auth bearer <jwt:redacted>", result);
    }

    [Fact]
    public void Bearer_token_is_masked()
    {
        var result = Redactor.Redact("Authorization: Bearer abc.def-123", userProfile: null);

        Assert.Equal("Authorization: Bearer ***", result);
    }

    [Theory]
    [InlineData("Order BTC-USDT filled at 64000.5")]
    [InlineData("design: abcdabcdabcdabcd")] // "sign" inside another word is not a credential keyword
    [InlineData("tokens_used=12345678")]
    [InlineData("total tokens: 123456789")]
    public void Ordinary_text_is_left_alone(string input)
    {
        Assert.Equal(input, Redactor.Redact(input, userProfile: null));
    }

    [Fact]
    public void User_profile_path_is_replaced_case_insensitively()
    {
        var result = Redactor.Redact(@"Could not open c:\users\Alice\AppData\Local\x.db", @"C:\Users\alice\");

        Assert.Equal(@"Could not open %USERPROFILE%\AppData\Local\x.db", result);
    }

    [Theory]
    [InlineData(@"C:\")]
    [InlineData("")]
    [InlineData(null)]
    public void Root_or_missing_profile_is_ignored(string? profile)
    {
        Assert.Equal(@"C:\data\file.txt", Redactor.Redact(@"C:\data\file.txt", profile));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Null_or_empty_text_becomes_empty(string? input)
    {
        Assert.Equal(string.Empty, Redactor.Redact(input, userProfile: null));
    }
}
