using System.Runtime.Versioning;
using System.Security.Cryptography;
using TradingAgent.Core.Secrets;

namespace TradingAgent.Platform.Windows;

/// <summary>Protects secrets with the Windows Data Protection API, bound to the current Windows user.</summary>
/// <remarks>
/// There is no key for the app to store or lose: Windows derives it from the user's credentials. A blob can
/// only be read by the same user on the same machine; after a profile reset it is unreadable and the secret
/// must be entered again. It does not protect against other programs running as the same user.
/// </remarks>
[SupportedOSPlatform("windows")]
public sealed class DpapiSecretProtector : ISecretProtector
{
    // Not a secret: it only keeps blobs written by other programs from being accepted as ours.
    private static readonly byte[] _entropy = "TradingAgent secrets v1"u8.ToArray();

    public byte[] Protect(byte[] plaintext) =>
        ProtectedData.Protect(plaintext, _entropy, DataProtectionScope.CurrentUser);

    public byte[] Unprotect(byte[] blob) =>
        ProtectedData.Unprotect(blob, _entropy, DataProtectionScope.CurrentUser);
}
