using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.LogicalTree;
using TradingAgent.App.Controls;
using TradingAgent.App.Views;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>
/// The names the checks of the real app find an input by. A page can be laid out anew; these names
/// must stay, or a script that drives the published app no longer finds what it presses and types in.
/// </summary>
public sealed class AutomationNamesTests
{
    [AvaloniaFact]
    public void Every_page_keeps_the_names_of_its_inputs()
    {
        Check(new TasksView(), "Task name", "Task instructions", "Task instruments", "Schedule kind", "Minutes between runs", "Time of day", "Weekdays",
            "This task may trade", "Ask me before placing an order");
        Check(new StrategiesView(), "The agent trades by this strategy", "Rating", "Rating notes", "Strategy to import", "New strategy name",
            "New strategy description", "New strategy rules");
        Check(new KnowledgeView(), "Search knowledge", "Embedding provider", "Embedding address", "Embedding model");
        Check(new MemoryView(), "Search memories", "Category filter", "Category", "Memory text");
        Check(new NewsView(), "Search news", "Source name", "Feed address");
        Check(new SettingsView(), "Emergency stop", "Provider", "Sign-in", "Model", "Effort", "Largest position", "Default stop-loss",
            "Default take-profit", "Look for strategies on a schedule", "Hours between two searches", "Measure past signals on a schedule",
            "Instruments to measure", "Show desktop notifications", "Orders filled, cancelled or not placed", "Risk alerts",
            "Scheduled tasks finished or failed", "Send notifications by email too", "SMTP server", "SMTP port", "SMTP user name", "Sender address",
            "Receiver address", "Encrypt the connection", "Background effects", "Reduced motion", "Keep the sidebar open");
        Check(new AdminView(), "Log level", "Search the log");
        Check(new DiagnosticsView(), "Start with Windows", "Open the window at start", "Send crash and performance reports");
    }

    [AvaloniaFact]
    public void Buttons_keep_the_words_a_script_presses_them_by()
    {
        Words(new TasksView(), "Save", "Delete");
        Words(new StrategiesView(), "Save rating", "Delete strategy", "Have the agent read it", "Look for strategies now", "Add strategy");
        Words(new KnowledgeView(), "Embed now");
        Words(new MemoryView(), "Add as new", "Save changes", "Delete");
        Words(new NewsView(), "Refresh", "Add source");
        Words(new SettingsView(), "Switch to live trading…", "Switch to demo trading", "Yes, switch to live trading", "Stay in demo", "Send a test email");
        Words(new AdminView(), "Refresh", "Check the file", "Compact", "Restore the chosen backup…", "Delete the chosen backup", "Call off the restore",
            "Yes, restore at the next start", "Delete everything of the chosen kind…", "Yes, delete it");
        Words(new DiagnosticsView(), "Run test prompt", "Stop", "Check again", "Send test notification", "Send test error", "Check for updates",
            "Restart to install");
    }

    /// <summary>
    /// Reads the tree as it is written, not as it is drawn: the inputs of a tab that is not open are
    /// in it too.
    /// </summary>
    private static void Check(Control view, params string[] expected)
    {
        var names = view.GetLogicalDescendants().OfType<Control>().Select(AutomationProperties.GetName).Where(name => name is not null).ToHashSet();
        foreach (var name in expected)
        {
            Assert.True(names.Contains(name), $"{view.GetType().Name} has no input named '{name}'.");
        }
    }

    private static void Words(Control view, params string[] expected)
    {
        var controls = view.GetLogicalDescendants().OfType<Control>().ToList();
        // The buttons of a dialog are kept beside it until it opens.
        foreach (var actions in controls.OfType<Dialog>().Select(dialog => dialog.Actions).OfType<Control>().ToList())
        {
            controls.AddRange(actions.GetSelfAndLogicalDescendants().OfType<Control>());
        }

        // A button says its words as its content, or, when it also shows an icon, as its name.
        var words = controls.OfType<Button>().Select(button => button.Content as string)
            .Concat(controls.Select(AutomationProperties.GetName))
            .Where(word => word is not null)
            .ToHashSet();
        foreach (var word in expected)
        {
            Assert.True(words.Contains(word), $"{view.GetType().Name} has no button '{word}'.");
        }
    }
}
