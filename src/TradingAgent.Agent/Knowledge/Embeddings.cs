using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Knowledge;

namespace TradingAgent.Agent.Knowledge;

/// <summary>Turns text into vectors that are close when the texts mean similar things.</summary>
public interface IEmbedder
{
    /// <summary>Provider and model, for example <c>ollama:nomic-embed-text</c>. Stored with every vector.</summary>
    string Name { get; }

    /// <summary>One vector of length one per text, in the order given.</summary>
    /// <exception cref="EmbeddingException">The provider did not answer with usable vectors.</exception>
    Task<IReadOnlyList<float[]>> EmbedAsync(IReadOnlyList<string> texts, CancellationToken cancellationToken);
}

/// <summary>An embedding provider could not be used. The message is fit to show.</summary>
public sealed class EmbeddingException : Exception
{
    public EmbeddingException()
    {
    }

    public EmbeddingException(string message)
        : base(message)
    {
    }

    public EmbeddingException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>
/// An embedding provider that speaks the OpenAI embeddings API: OpenAI itself, and Ollama and
/// LM Studio on this computer.
/// </summary>
public sealed class OpenAiCompatibleEmbedder(HttpClient http, string name, string baseUrl, string model, string? apiKey) : IEmbedder
{
    /// <summary>Longest text sent for one item, in characters. Embedding models read a few thousand tokens at most.</summary>
    public const int MaxTextLength = 6000;

    public string Name { get; } = name;

    public async Task<IReadOnlyList<float[]>> EmbedAsync(IReadOnlyList<string> texts, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(texts);
        using var body = new MemoryStream();
        using (var writer = new Utf8JsonWriter(body))
        {
            writer.WriteStartObject();
            writer.WriteString("model", model);
            writer.WriteStartArray("input");
            foreach (var text in texts)
            {
                writer.WriteStringValue(text.Length <= MaxTextLength ? text : text[..MaxTextLength]);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, baseUrl.TrimEnd('/') + "/embeddings")
        {
            Content = new ByteArrayContent(body.ToArray()) { Headers = { ContentType = new MediaTypeHeaderValue("application/json") } },
        };
        if (!string.IsNullOrEmpty(apiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }

        try
        {
            using var response = await http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var payload = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new EmbeddingException($"The embedding provider answered {(int)response.StatusCode}. Check its address, the model name and the key.");
            }

            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array || data.GetArrayLength() != texts.Count)
            {
                throw new EmbeddingException("The embedding provider's answer does not hold one vector per text.");
            }

            var vectors = new float[texts.Count][];
            var position = 0;
            foreach (var item in data.EnumerateArray())
            {
                var index = item.TryGetProperty("index", out var given) && given.TryGetInt32(out var number) ? number : position;
                if (index < 0 || index >= vectors.Length || !item.TryGetProperty("embedding", out var embedding) || embedding.ValueKind != JsonValueKind.Array)
                {
                    throw new EmbeddingException("The embedding provider's answer is not in the expected form.");
                }

                vectors[index] = Normalize([.. embedding.EnumerateArray().Select(value => value.GetSingle())]);
                position++;
            }

            return vectors.Any(vector => vector is null || vector.Length == 0)
                ? throw new EmbeddingException("The embedding provider left a text without a vector.")
                : vectors;
        }
        catch (HttpRequestException ex)
        {
            throw new EmbeddingException("The embedding provider cannot be reached. Is it running?", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new EmbeddingException("The embedding provider took too long to answer.", ex);
        }
        catch (Exception ex) when (ex is JsonException or FormatException or InvalidOperationException)
        {
            throw new EmbeddingException("The embedding provider's answer could not be read.", ex);
        }
    }

    private static float[] Normalize(float[] vector)
    {
        double sum = 0;
        foreach (var value in vector)
        {
            sum += (double)value * value;
        }

        var length = Math.Sqrt(sum);
        if (length > 0)
        {
            for (var index = 0; index < vector.Length; index++)
            {
                vector[index] = (float)(vector[index] / length);
            }
        }

        return vector;
    }
}

/// <summary>Finds the embedding provider the settings name. None is set until the user picks one.</summary>
public sealed class EmbedderResolver(ISettingsStore settings, ISecretStore secrets, HttpClient http)
{
    public const string None = "none";
    public const string Ollama = "ollama";
    public const string LmStudio = "lmstudio";
    public const string OpenAi = "openai";
    public const string Custom = "custom";

    public static IReadOnlyList<string> Providers { get; } = [None, Ollama, LmStudio, OpenAi, Custom];

    /// <summary>The address and model a provider is used with when the settings leave them empty.</summary>
    public static (string BaseUrl, string Model) DefaultsFor(string provider) => provider switch
    {
        Ollama => ("http://localhost:11434/v1", "nomic-embed-text"),
        LmStudio => ("http://localhost:1234/v1", "text-embedding-nomic-embed-text-v1.5"),
        OpenAi => ("https://api.openai.com/v1", "text-embedding-3-small"),
        _ => (string.Empty, string.Empty),
    };

    /// <summary>The embedder to use now; null when none is set or what is set is not complete.</summary>
    public IEmbedder? Resolve()
    {
        var provider = settings.GetValue(SettingKeys.EmbeddingProvider);
        if (provider is not (Ollama or LmStudio or OpenAi or Custom))
        {
            return null;
        }

        var (defaultUrl, defaultModel) = DefaultsFor(provider);
        var baseUrl = settings.GetValue(SettingKeys.EmbeddingBaseUrl) is { Length: > 0 } url ? url.Trim() : defaultUrl;
        var model = settings.GetValue(SettingKeys.EmbeddingModel) is { Length: > 0 } name ? name.Trim() : defaultModel;
        if (baseUrl.Length == 0 || model.Length == 0 || !Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            return null;
        }

        // The OpenAI key goes to OpenAI only, never to an address the user typed.
        var key = provider == OpenAi ? secrets.Reveal(SecretNames.OpenAiApiKey) : null;
        if (provider == OpenAi && string.IsNullOrEmpty(key))
        {
            return null;
        }

        return new OpenAiCompatibleEmbedder(http, $"{provider}:{model}", provider == OpenAi ? defaultUrl : baseUrl, model, key);
    }
}

/// <summary>
/// Makes the embeddings of what has none yet, in the background: new memories, strategies, news,
/// lessons and patterns, and everything again after the user changes the embedding model.
/// </summary>
public sealed partial class EmbeddingIndexer(
    KnowledgeIndex index,
    EmbedderResolver embedders,
    ISettingsStore settings,
    ILogger<EmbeddingIndexer> logger)
    : IBackgroundService, IDisposable
{
    /// <summary>Texts sent to the provider in one request.</summary>
    public const int BatchSize = 16;

    /// <summary>Most items embedded in one pass, so that a pass over a large backlog ends.</summary>
    public const int PassLimit = 2000;

    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(10);
    private readonly SemaphoreSlim _wake = new(0, 1);
    private readonly SemaphoreSlim _pass = new(1, 1);
    private CancellationTokenSource? _stop;
    private Task? _loop;

    public string Name => "Embedding indexer";

    /// <summary>What the last pass did, in words for the Knowledge page.</summary>
    public string LastResult { get; private set; } = "No pass has run yet.";

    public Task StartAsync(CancellationToken stopping)
    {
        _stop = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        _loop = Task.Run(() => LoopAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        if (_stop is not null)
        {
            await _stop.CancelAsync().ConfigureAwait(false);
        }

        if (_loop is not null)
        {
            await _loop.WaitAsync(deadline).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        }
    }

    public void Dispose()
    {
        _wake.Dispose();
        _pass.Dispose();
        _stop?.Dispose();
    }

    /// <summary>Asks for a pass soon. Cheap; safe to call after every save.</summary>
    public void Request()
    {
        try
        {
            _wake.Release();
        }
        catch (SemaphoreFullException)
        {
            // A pass is asked for already.
        }
    }

    /// <summary>Embeds what has no embedding yet. Returns how many items it embedded.</summary>
    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        if (embedders.Resolve() is not { } embedder)
        {
            LastResult = "No embedding provider is set: search uses words only.";
            return 0;
        }

        if (IsGaming())
        {
            LastResult = "Waiting: a game is running.";
            return 0;
        }

        await _pass.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var done = 0;
            foreach (var kind in KnowledgeIndex.Kinds)
            {
                while (done < PassLimit)
                {
                    var pending = index.Pending(kind, embedder.Name, BatchSize);
                    if (pending.Count == 0)
                    {
                        break;
                    }

                    var vectors = await embedder.EmbedAsync([.. pending.Select(item => item.Text)], cancellationToken).ConfigureAwait(false);
                    for (var position = 0; position < pending.Count; position++)
                    {
                        index.Store(kind, pending[position].Id, embedder.Name, pending[position].Text, vectors[position]);
                    }

                    done += pending.Count;
                }
            }

            LastResult = $"Embedded {done} items with {embedder.Name}.";
            return done;
        }
        catch (EmbeddingException ex)
        {
            LastResult = ex.Message;
            LogFailed(logger, ex);
            return 0;
        }
        finally
        {
            _pass.Release();
        }
    }

    private async Task LoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                // Whichever comes first: somebody saved something, or the interval is over.
                await _wake.WaitAsync(_interval, cancellationToken).ConfigureAwait(false);
                await RunOnceAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // The app is closing.
        }
    }

    private bool IsGaming()
    {
        if (!settings.GetValue(SettingKeys.EmbeddingDeferWhenGaming))
        {
            return false;
        }

        foreach (var name in settings.GetValue(SettingKeys.EmbeddingGamingProcesses))
        {
            var processes = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(name));
            var running = processes.Length > 0;
            foreach (var process in processes)
            {
                process.Dispose();
            }

            if (running)
            {
                return true;
            }
        }

        return false;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Embedding stopped: the provider could not be used.")]
    private static partial void LogFailed(ILogger logger, Exception exception);
}

/// <summary>
/// Searches what the app knows by words and, when an embedding provider is set, by meaning. The two
/// rankings are joined by rank, so that neither has to be on the other's scale.
/// </summary>
public sealed partial class KnowledgeSearch(KnowledgeIndex index, EmbedderResolver embedders, ILogger<KnowledgeSearch> logger)
{
    /// <summary>The usual constant of reciprocal rank fusion: how fast a lower rank counts for less.</summary>
    private const double RankConstant = 60;

    /// <summary>Vectors less alike than this are not a match at all.</summary>
    private const double MinimumSimilarity = 0.25;

    /// <summary>The best matches over the given kinds, best first.</summary>
    public async Task<IReadOnlyList<KnowledgeHit>> SearchAsync(
        IReadOnlyList<KnowledgeKind> kinds,
        string query,
        int limit,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(kinds);
        if (string.IsNullOrWhiteSpace(query) || limit <= 0)
        {
            return [];
        }

        var embedder = embedders.Resolve();
        float[]? queryVector = null;
        if (embedder is not null)
        {
            try
            {
                queryVector = (await embedder.EmbedAsync([query], cancellationToken).ConfigureAwait(false))[0];
            }
            catch (EmbeddingException ex)
            {
                // Words still work.
                LogSemanticFailed(logger, ex);
            }
        }

        var hits = new List<KnowledgeHit>();
        foreach (var kind in kinds)
        {
            var scores = new Dictionary<string, double>(StringComparer.Ordinal);
            var rank = 0;
            foreach (var id in index.Keyword(kind, query, limit * 3))
            {
                scores[id] = 1 / (RankConstant + ++rank);
            }

            if (queryVector is not null && embedder is not null)
            {
                rank = 0;
                foreach (var (id, _) in Nearest(index.Vectors(kind, embedder.Name), queryVector, limit * 3))
                {
                    scores[id] = scores.GetValueOrDefault(id) + (1 / (RankConstant + ++rank));
                }
            }

            hits.AddRange(index.Load(kind, [.. scores.OrderByDescending(pair => pair.Value).Take(limit).Select(pair => (pair.Key, pair.Value))]));
        }

        return [.. hits.OrderByDescending(hit => hit.Score).Take(limit)];
    }

    private static IEnumerable<(string Id, double Similarity)> Nearest(IReadOnlyList<(string Id, float[] Vector)> vectors, float[] query, int count)
    {
        var scored = new List<(string Id, double Similarity)>();
        foreach (var (id, vector) in vectors)
        {
            // A vector of another length comes from another model and cannot be compared.
            if (vector.Length != query.Length)
            {
                continue;
            }

            double dot = 0;
            for (var position = 0; position < vector.Length; position++)
            {
                dot += vector[position] * query[position];
            }

            if (dot >= MinimumSimilarity)
            {
                scored.Add((id, dot));
            }
        }

        return scored.OrderByDescending(item => item.Similarity).Take(count);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Search by meaning failed; the search used words only.")]
    private static partial void LogSemanticFailed(ILogger logger, Exception exception);
}
