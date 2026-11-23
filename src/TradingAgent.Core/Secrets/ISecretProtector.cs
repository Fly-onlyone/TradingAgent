namespace TradingAgent.Core.Secrets;

/// <summary>Encrypts and decrypts secret bytes with a key the operating system keeps for the current user.</summary>
public interface ISecretProtector
{
    byte[] Protect(byte[] plaintext);

    /// <exception cref="System.Security.Cryptography.CryptographicException">The blob cannot be decrypted by this user.</exception>
    byte[] Unprotect(byte[] blob);
}
