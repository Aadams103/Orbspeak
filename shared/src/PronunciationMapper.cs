namespace Orbspeak.Shared;

public static class PronunciationMapper
{
    public static IReadOnlyList<(string Original, string Replacement)> Parse(string? csv)
    {
        var rules = new List<(string, string)>();
        if (string.IsNullOrWhiteSpace(csv))
        {
            return rules;
        }

        foreach (var raw in csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var line = raw.Trim().TrimStart('\uFEFF');
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var parts = line.Split(',', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2 && parts[0].Length > 0)
            {
                rules.Add((parts[0], parts[1]));
            }
        }

        return rules;
    }

    public static string Apply(string text, string? csv)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrWhiteSpace(csv))
        {
            return text;
        }

        foreach (var (original, replacement) in Parse(csv))
        {
            text = ReplaceInsensitive(text, original, replacement);
        }

        return text;
    }

    private static string ReplaceInsensitive(string text, string original, string replacement)
    {
        if (original.Length == 0)
        {
            return text;
        }

        var result = new System.Text.StringBuilder(text.Length);
        var start = 0;
        while (start <= text.Length - original.Length)
        {
            var index = text.IndexOf(original, start, StringComparison.OrdinalIgnoreCase);
            if (index < 0)
            {
                break;
            }

            result.Append(text, start, index - start);
            result.Append(replacement);
            start = index + original.Length;
        }

        result.Append(text, start, text.Length - start);
        return result.ToString();
    }
}
