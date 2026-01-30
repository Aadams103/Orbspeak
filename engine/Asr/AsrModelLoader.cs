using System.IO;
using Orbspeak.Engine;
using Whisper.net;
using Whisper.net.Ggml;

namespace Orbspeak.Engine.Asr;

/// <summary>
/// Ensures the ASR model exists at the given path, downloading from Hugging Face on first run if missing.
/// </summary>
public static class AsrModelLoader
{
    /// <summary>
    /// If the file at <paramref name="modelPath"/> does not exist, download ggml-base.en to it.
    /// Returns true if the model exists (or was downloaded), false if download failed.
    /// </summary>
    public static async Task<bool> EnsureModelExistsAsync(string modelPath, CancellationToken cancellationToken = default)
    {
        if (File.Exists(modelPath))
        {
            return true;
        }

        var dir = Path.GetDirectoryName(modelPath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        try
        {
            await using var modelStream = await WhisperGgmlDownloader.Default
                .GetGgmlModelAsync(GgmlType.BaseEn, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
            await using var fileStream = File.Create(modelPath);
            await modelStream.CopyToAsync(fileStream, cancellationToken).ConfigureAwait(false);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
