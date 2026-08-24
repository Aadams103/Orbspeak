using System.Text;
using UglyToad.PdfPig;

namespace Orbspeak.Engine.Studio;

internal static class DocumentTextExtractor
{
    public static string Extract(string fileName, string? mimeType, byte[] bytes)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (ext is ".txt" or ".md" || (mimeType?.StartsWith("text/", StringComparison.OrdinalIgnoreCase) ?? false))
        {
            return Encoding.UTF8.GetString(bytes);
        }

        if (ext == ".pdf" || string.Equals(mimeType, "application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            return ExtractPdf(bytes);
        }

        throw new InvalidOperationException("Studio v1 accepts .txt, .md, and .pdf only.");
    }

    private static string ExtractPdf(byte[] bytes)
    {
        using var ms = new MemoryStream(bytes, writable: false);
        using var document = PdfDocument.Open(ms);
        var builder = new StringBuilder();
        foreach (var page in document.GetPages())
        {
            if (builder.Length > 0)
            {
                builder.AppendLine().AppendLine();
            }

            builder.Append(page.Text);
        }

        return builder.ToString();
    }
}
