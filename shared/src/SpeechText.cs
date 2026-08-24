using System.Text.RegularExpressions;

namespace Orbspeak.Shared;

public static class SpeechText
{
    private static readonly Regex Split = new(@"(?<=[.!?])\s+", RegexOptions.Compiled);

    public static IReadOnlyList<string> SplitSentences(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        var parts = Split.Split(text.Trim());
        var result = new List<string>();
        foreach (var part in parts)
        {
            var trimmed = part.Trim();
            if (trimmed.Length > 0)
            {
                result.Add(trimmed);
            }
        }

        return result.Count > 0 ? result : new[] { text.Trim() };
    }
}
