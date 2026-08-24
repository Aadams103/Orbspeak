using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

internal static class SentenceSplitter
{
    public static IReadOnlyList<string> SplitSentences(string text) => SpeechText.SplitSentences(text);
}
