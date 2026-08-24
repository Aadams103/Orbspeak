using System.Text.Json;
using System.Text.Json.Serialization;
using Orbspeak.Shared;

namespace Orbspeak.Engine.Studio;

internal sealed class StudioDocument
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("o");

    [JsonPropertyName("updatedAt")]
    public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("o");

    [JsonPropertyName("hasVoiceover")]
    public bool HasVoiceover { get; set; }

    [JsonPropertyName("coverPath")]
    public string? CoverPath { get; set; }

    [JsonPropertyName("sceneCount")]
    public int SceneCount { get; set; }
}

internal sealed class StudioLibraryIndex
{
    [JsonPropertyName("documents")]
    public List<StudioDocument> Documents { get; set; } = new();
}

internal sealed class StudioProfileStyle
{
    [JsonPropertyName("styleMarkdown")]
    public string StyleMarkdown { get; set; } = string.Empty;

    [JsonPropertyName("pronunciationCsv")]
    public string PronunciationCsv { get; set; } = string.Empty;

    [JsonPropertyName("instruct")]
    public string Instruct { get; set; } = string.Empty;

    [JsonPropertyName("ttsVoice")]
    public string TtsVoice { get; set; } = "Vivian";

    [JsonPropertyName("ttsRate")]
    public double TtsRate { get; set; } = 1;

    [JsonPropertyName("ttsProvider")]
    public string TtsProvider { get; set; } = "qwen3";

    [JsonPropertyName("artworkStyle")]
    public string ArtworkStyle { get; set; } = "cinematic book cover";
}

internal static class StudioLibrary
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static StudioDocument Import(string profileId, string fileName, byte[] bytes, string? mimeType)
    {
        var text = DocumentTextExtractor.Extract(fileName, mimeType, bytes);
        var docId = Guid.NewGuid().ToString("n")[..12];
        var dir = StudioPaths.DocumentDir(profileId, docId);
        Directory.CreateDirectory(dir);
        Directory.CreateDirectory(Path.Combine(dir, "artwork"));

        File.WriteAllBytes(Path.Combine(dir, "source" + Path.GetExtension(fileName)), bytes);
        File.WriteAllText(Path.Combine(dir, "text.md"), text);
        WriteProject(dir, new
        {
            id = docId,
            fileName,
            sections = Array.Empty<object>()
        });

        var title = DeriveTitle(fileName, text);
        var doc = new StudioDocument
        {
            Id = docId,
            Title = title,
            FileName = fileName
        };
        Upsert(profileId, doc);
        return doc;
    }

    public static IReadOnlyList<StudioDocument> List(string profileId)
    {
        return LoadIndex(profileId).Documents
            .OrderByDescending(d => d.UpdatedAt)
            .ToList();
    }

    public static object? SaveText(string profileId, string docId, string text)
    {
        var dir = StudioPaths.DocumentDir(profileId, docId);
        var textPath = Path.Combine(dir, "text.md");
        if (!Directory.Exists(dir) && !File.Exists(textPath))
        {
            return null;
        }

        Directory.CreateDirectory(dir);
        File.WriteAllText(textPath, text ?? "");

        var index = LoadIndex(profileId);
        var doc = index.Documents.FirstOrDefault(d => d.Id == docId);
        if (doc is not null)
        {
            doc.UpdatedAt = DateTime.UtcNow.ToString("o");
            SaveIndex(profileId, index);
        }

        return Get(profileId, docId);
    }

    public static object? Get(string profileId, string docId)
    {
        var dir = StudioPaths.DocumentDir(profileId, docId);
        var textPath = Path.Combine(dir, "text.md");
        if (!File.Exists(textPath))
        {
            return null;
        }

        var index = LoadIndex(profileId);
        var meta = index.Documents.FirstOrDefault(d => d.Id == docId);
        var cover = Path.Combine(dir, "artwork", "cover.png");
        var scenes = Directory.Exists(Path.Combine(dir, "artwork"))
            ? Directory.GetFiles(Path.Combine(dir, "artwork"), "scene-*.png")
                .OrderBy(p => p)
                .Select(ToDataUrl)
                .ToArray()
            : Array.Empty<string>();

        return new
        {
            id = docId,
            title = meta?.Title ?? docId,
            fileName = meta?.FileName ?? "",
            text = File.ReadAllText(textPath),
            sentences = Tts.SentenceSplitter.SplitSentences(File.ReadAllText(textPath)),
            hasVoiceover = File.Exists(Path.Combine(dir, "voiceover.wav")),
            coverDataUrl = File.Exists(cover) ? ToDataUrl(cover) : null,
            scenes,
            folder = dir
        };
    }

    public static string SaveVoiceover(string profileId, string docId, byte[] wav, object? meta = null)
    {
        var dir = StudioPaths.DocumentDir(profileId, docId);
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, "voiceover.wav");
        File.WriteAllBytes(path, wav);
        if (meta is not null)
        {
            File.WriteAllText(Path.Combine(dir, "voiceover.meta.json"), JsonSerializer.Serialize(meta, Json));
        }
        var index = LoadIndex(profileId);
        var doc = index.Documents.FirstOrDefault(d => d.Id == docId);
        if (doc is not null)
        {
            doc.HasVoiceover = true;
            doc.UpdatedAt = DateTime.UtcNow.ToString("o");
            SaveIndex(profileId, index);
        }

        return path;
    }

    public static string SaveArtwork(string profileId, string docId, string kind, byte[] png)
    {
        var dir = Path.Combine(StudioPaths.DocumentDir(profileId, docId), "artwork");
        Directory.CreateDirectory(dir);
        string path;
        if (string.Equals(kind, "cover", StringComparison.OrdinalIgnoreCase))
        {
            path = Path.Combine(dir, "cover.png");
        }
        else
        {
            var next = Directory.GetFiles(dir, "scene-*.png").Length + 1;
            path = Path.Combine(dir, $"scene-{next:00}.png");
        }

        File.WriteAllBytes(path, png);
        var index = LoadIndex(profileId);
        var doc = index.Documents.FirstOrDefault(d => d.Id == docId);
        if (doc is not null)
        {
            if (string.Equals(kind, "cover", StringComparison.OrdinalIgnoreCase))
            {
                doc.CoverPath = path;
            }

            doc.SceneCount = Directory.GetFiles(dir, "scene-*.png").Length;
            doc.UpdatedAt = DateTime.UtcNow.ToString("o");
            SaveIndex(profileId, index);
        }

        return path;
    }

    public static StudioProfileStyle LoadStyle(string profileId)
    {
        var settingsPath = StudioPaths.ProfileSettingsPath(profileId);
        var style = File.Exists(settingsPath)
            ? JsonSerializer.Deserialize<StudioProfileStyle>(File.ReadAllText(settingsPath), Json) ?? new StudioProfileStyle()
            : new StudioProfileStyle();

        var styleMd = StudioPaths.StylePath(profileId);
        if (File.Exists(styleMd))
        {
            style.StyleMarkdown = File.ReadAllText(styleMd);
        }

        var csv = StudioPaths.PronunciationPath(profileId);
        if (File.Exists(csv))
        {
            style.PronunciationCsv = File.ReadAllText(csv);
        }

        return style;
    }

    public static StudioProfileStyle SaveStyle(string profileId, StudioProfileStyle style)
    {
        var profileDir = Path.GetDirectoryName(StudioPaths.ProfileSettingsPath(profileId))!;
        Directory.CreateDirectory(profileDir);
        File.WriteAllText(StudioPaths.StylePath(profileId), style.StyleMarkdown ?? "");
        File.WriteAllText(StudioPaths.PronunciationPath(profileId), style.PronunciationCsv ?? "");
        File.WriteAllText(StudioPaths.ProfileSettingsPath(profileId), JsonSerializer.Serialize(style, Json));
        return style;
    }

    public static IReadOnlyList<(string Original, string Replacement)> ParsePronunciation(string csv)
        => PronunciationMapper.Parse(csv);

    public static string ApplyPronunciation(string text, string csv)
        => PronunciationMapper.Apply(text, csv);

    public static bool VoiceoverExists(string profileId, string docId)
        => File.Exists(Path.Combine(StudioPaths.DocumentDir(profileId, docId), "voiceover.wav"));

    public static StudioProfileStyle NormalizeStyle(StudioProfileStyle style)
    {
        var provider = TtsProviderIds.ParseRequired(style.TtsProvider);
        style.TtsProvider = TtsProviderIds.ToId(provider);
        style.TtsRate = SpeechRate.Clamp(style.TtsRate);
        style.TtsVoice = TtsVoiceCatalog.ResolveOrDefault(provider, style.TtsVoice).Id;
        return style;
    }

    private static void Upsert(string profileId, StudioDocument doc)
    {
        var index = LoadIndex(profileId);
        index.Documents.RemoveAll(d => d.Id == doc.Id);
        index.Documents.Add(doc);
        SaveIndex(profileId, index);
    }

    private static StudioLibraryIndex LoadIndex(string profileId)
    {
        var path = StudioPaths.IndexPath(profileId);
        if (!File.Exists(path))
        {
            return new StudioLibraryIndex();
        }

        try
        {
            return JsonSerializer.Deserialize<StudioLibraryIndex>(File.ReadAllText(path), Json)
                   ?? new StudioLibraryIndex();
        }
        catch
        {
            return new StudioLibraryIndex();
        }
    }

    private static void SaveIndex(string profileId, StudioLibraryIndex index)
    {
        Directory.CreateDirectory(StudioPaths.ProfileDir(profileId));
        File.WriteAllText(StudioPaths.IndexPath(profileId), JsonSerializer.Serialize(index, Json));
    }

    private static void WriteProject(string dir, object project) =>
        File.WriteAllText(Path.Combine(dir, "project.json"), JsonSerializer.Serialize(project, Json));

    private static string DeriveTitle(string fileName, string text)
    {
        var fromName = Path.GetFileNameWithoutExtension(fileName);
        var firstLine = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(firstLine) || firstLine.Length > 80)
        {
            return fromName;
        }

        return firstLine.TrimStart('#', ' ');
    }

    private static string ToDataUrl(string path)
    {
        var bytes = File.ReadAllBytes(path);
        return "data:image/png;base64," + Convert.ToBase64String(bytes);
    }
}
