using System.Buffers.Binary;
using System.Security.Cryptography;

namespace TradingAgent.Core;

/// <summary>Generates the identifiers used as primary keys.</summary>
/// <remarks>
/// An id is 24 lowercase hex characters: a 4-byte Unix-seconds timestamp followed by 8 random bytes, so
/// ids sort roughly by creation time. The width is fixed by the OKX client order id format
/// <c>s&lt;24hex-session&gt;-&lt;4hex-nonce&gt;</c> (30 of the 32 characters OKX allows), which embeds a session id.
/// </remarks>
public static class Ids
{
    public const int Length = 24;

    public static string NewId() => NewId(DateTimeOffset.UtcNow);

    public static string NewId(DateTimeOffset now)
    {
        Span<byte> bytes = stackalloc byte[Length / 2];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, (uint)now.ToUnixTimeSeconds());
        RandomNumberGenerator.Fill(bytes[4..]);
        return Convert.ToHexStringLower(bytes);
    }

    public static bool IsValid(string? id)
    {
        if (id is not { Length: Length })
        {
            return false;
        }

        foreach (var c in id)
        {
            if (c is not ((>= '0' and <= '9') or (>= 'a' and <= 'f')))
            {
                return false;
            }
        }

        return true;
    }
}
