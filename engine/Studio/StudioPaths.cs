namespace Orbspeak.Engine.Studio;

internal static class StudioPaths
{
    public static string Root
    {
        get
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(localAppData, "Orbspeak", "library");
        }
    }

    public static string ProfileDir(string profileId) =>
        Path.Combine(Root, Sanitize(profileId));

    public static string DocumentDir(string profileId, string docId) =>
        Path.Combine(ProfileDir(profileId), Sanitize(docId));

    public static string StylePath(string profileId) =>
        Path.Combine(ProfileDir(profileId), "profile", "style.md");

    public static string PronunciationPath(string profileId) =>
        Path.Combine(ProfileDir(profileId), "profile", "pronunciation.csv");

    public static string ProfileSettingsPath(string profileId) =>
        Path.Combine(ProfileDir(profileId), "profile", "settings.json");

    public static string IndexPath(string profileId) =>
        Path.Combine(ProfileDir(profileId), "library.json");

    public static string Sanitize(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "default" : cleaned;
    }
}
