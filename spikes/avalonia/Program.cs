using Avalonia;

namespace SpikeAvalonia;

/// <summary>Command-line options shared by all three spikes.</summary>
internal sealed class Options
{
	public string FixturesDir { get; set; } = "../fixtures";
	public string? MarkerFile { get; set; }
	public bool Idle { get; set; }

	public static Options Current { get; private set; } = new();

	public static void Parse(string[] args)
	{
		var o = new Options();
		for (var i = 0; i < args.Length; i++)
		{
			switch (args[i])
			{
				case "--fixtures" when i + 1 < args.Length:
					o.FixturesDir = args[++i];
					break;
				case "--marker" when i + 1 < args.Length:
					o.MarkerFile = args[++i];
					break;
				case "--idle":
					o.Idle = true;
					break;
			}
		}
		Current = o;
	}
}

internal static class Program
{
	[STAThread]
	public static int Main(string[] args)
	{
		Options.Parse(args);
		return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
	}

	public static AppBuilder BuildAvaloniaApp() =>
		AppBuilder.Configure<App>().UsePlatformDetect();
}
