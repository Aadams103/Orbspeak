using System.IO;

namespace Orbspeak.Ui;

/// <summary>
/// Minimal diagnostic log for the desktop host, mirroring the engine's log location.
/// Writes to %LOCALAPPDATA%\Orbspeak\logs\v1\ui-desktop.log.
/// </summary>
internal static class UiLog
{
    private static readonly object Gate = new();
    private static readonly string LogPath = GetLogPath();

    private static string GetLogPath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var dir = Path.Combine(localAppData, "Orbspeak", "logs", "v1");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "ui-desktop.log");
    }

    public static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                File.AppendAllText(LogPath, $"{DateTime.UtcNow:O} {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Diagnostics must never break the app.
        }
    }

    public static void Write(string message, Exception ex)
    {
        Write($"{message}: {ex.GetType().Name}: {ex.Message}");
    }
}
