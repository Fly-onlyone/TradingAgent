using System.Collections.Concurrent;

namespace TradingAgent.Agent.Atk;

/// <summary>
/// The sessions that may not change anything on the exchange, such as a run of a scheduled task the
/// user did not allow to trade. The risk gate asks here before any other rule.
/// </summary>
/// <remarks>
/// Kept in memory only. A run does not outlive the app, so neither does the reason it may not trade.
/// </remarks>
public sealed class SessionWriteBlocks
{
    private readonly ConcurrentDictionary<string, string> _reasons = new(StringComparer.Ordinal);

    /// <summary>Refuses every exchange write of a session until <see cref="Release"/>.</summary>
    /// <param name="sessionId">The session.</param>
    /// <param name="reason">Why, in words the model and the user both read.</param>
    public void Block(string sessionId, string reason) => _reasons[sessionId] = reason;

    public void Release(string sessionId) => _reasons.TryRemove(sessionId, out _);

    /// <summary>Why the session may not write; null when it may.</summary>
    public string? ReasonFor(string sessionId) => _reasons.GetValueOrDefault(sessionId);
}
