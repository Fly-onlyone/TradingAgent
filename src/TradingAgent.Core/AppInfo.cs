using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace TradingAgent.Core;

/// <summary>Identity and build facts of the running app.</summary>
/// <param name="Version">Semantic version without build metadata, for example <c>0.1.2</c>.</param>
/// <param name="IsDevelopmentBuild">True for Debug builds, which keep their data apart from an installed app.</param>
public sealed record AppInfo(string Version, bool IsDevelopmentBuild)
{
    public const string ProductName = "Trading agent";

    public string BuildMode => IsDevelopmentBuild ? "Debug" : "Release";

    public string Runtime { get; } = RuntimeInformation.FrameworkDescription;

    /// <summary>True when the app runs as a Native AOT binary rather than on the JIT.</summary>
    public bool IsNativeAot { get; } = !RuntimeFeature.IsDynamicCodeSupported;

    /// <summary>Reads the version stamped into <paramref name="assembly"/> at build time.</summary>
    public static AppInfo FromAssembly(Assembly assembly, bool isDevelopmentBuild)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        return new AppInfo(NormalizeVersion(informational), isDevelopmentBuild);
    }

    /// <summary>
    /// Strips the <c>+commit</c> build metadata the SDK appends to the informational version.
    /// </summary>
    /// <example><c>NormalizeVersion("0.1.2+3f9c1ab")</c> returns <c>"0.1.2"</c>.</example>
    public static string NormalizeVersion(string? informationalVersion)
    {
        if (string.IsNullOrWhiteSpace(informationalVersion))
        {
            return "0.0.0";
        }

        var plus = informationalVersion.IndexOf('+', StringComparison.Ordinal);
        return plus < 0 ? informationalVersion : informationalVersion[..plus];
    }
}
