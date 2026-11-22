using System.Globalization;
using System.Text.RegularExpressions;

namespace TradingAgent.Core.Logging;

/// <summary>Removes credentials and personal paths from text before it is logged or reported.</summary>
/// <remarks>
/// Every log sink and the crash reporter pass their text through here, so a key that ends up in an error
/// message or in a child process's output is never written to disk or sent anywhere.
/// </remarks>
/// <example>
/// <c>Redact("api_key=\"a1b2c3d4e5f6g7\" loading")</c> returns <c>api_key=&lt;redacted:14&gt;" loading</c>.
/// </example>
public static partial class Redactor
{
    private const string JwtMarker = "<jwt:redacted>";

    private static readonly string? _userProfile = NormalizeProfile(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));

    public static string Redact(string? text) => Redact(text, _userProfile);

    /// <summary>Redacts <paramref name="text"/>, treating <paramref name="userProfile"/> as the home folder.</summary>
    public static string Redact(string? text, string? userProfile)
    {
        if (string.IsNullOrEmpty(text))
        {
            return string.Empty;
        }

        // Order matters: a JWT also looks like a long token value, and must keep its own marker.
        var result = JwtPattern().Replace(text, JwtMarker);
        result = BearerPattern().Replace(result, "$1***");
        result = LongCredentialPattern().Replace(
            result,
            match => string.Create(
                CultureInfo.InvariantCulture,
                $"{match.Groups[1].Value}=<redacted:{match.Groups[2].Length}>"));
        result = AssignedCredentialPattern().Replace(result, "$1=<redacted>");

        var profile = NormalizeProfile(userProfile);
        if (profile is not null)
        {
            result = result.Replace(profile, "%USERPROFILE%", StringComparison.OrdinalIgnoreCase);
        }

        return result;
    }

    private static string? NormalizeProfile(string? path)
    {
        var trimmed = path?.TrimEnd('\\', '/');
        // A root such as "C:" would rewrite every path on the drive.
        return trimmed is { Length: > 3 } ? trimmed : null;
    }

    [GeneratedRegex(@"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")]
    private static partial Regex JwtPattern();

    [GeneratedRegex(@"(?i)\b(bearer\s+)(?!<jwt:redacted>)\S+")]
    private static partial Regex BearerPattern();

    // A credential keyword followed, within three separator characters, by a long token-like value:
    // secretKey: aBcDeFgH..., --token abcdefgh..., "passphrase": "..."
    [GeneratedRegex(
        @"(?i)(?<![A-Za-z])(api[_-]?key|secret[_-]?key|passphrase|password|sign(?:ature)?|token)\W{1,3}[""']?(?!<)([A-Za-z0-9+/=_-]{8,})")]
    private static partial Regex LongCredentialPattern();

    // The same keywords with an explicit assignment and a value of any length or alphabet: password=abc
    [GeneratedRegex(
        @"(?i)(?<![A-Za-z])(api[_-]?key|secret[_-]?key|passphrase|password|token)\s*[:=]\s*[""']?(?!<redacted|<jwt:redacted>)[^\s""',;]+")]
    private static partial Regex AssignedCredentialPattern();
}
