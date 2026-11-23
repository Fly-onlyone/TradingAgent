namespace TradingAgent.Core.Secrets;

/// <summary>Stores API keys and passwords, encrypted for the current operating-system user.</summary>
public interface ISecretStore
{
    /// <summary>Whether a secret is saved, and a short hint to show in place of its value.</summary>
    SecretState GetState(string name);

    /// <summary>
    /// Returns the secret, or null when none is saved or the saved one cannot be decrypted. For services
    /// that must send the value; never bind the result to the UI or log it.
    /// </summary>
    string? Reveal(string name);

    /// <summary>Saves the secret. An empty value removes it.</summary>
    void Save(string name, string value);

    /// <summary>Removes the secret. Returns false when none was saved.</summary>
    bool Remove(string name);
}

public enum SecretStatus
{
    Unset,
    Saved,

    /// <summary>A value is stored but cannot be decrypted, for example after the Windows profile was recreated.</summary>
    Unreadable,
}

/// <param name="Hint">Last four characters of the value, or empty when the value is too short to hint safely.</param>
public readonly record struct SecretState(SecretStatus Status, string Hint)
{
    public static SecretState Unset { get; } = new(SecretStatus.Unset, string.Empty);
}
