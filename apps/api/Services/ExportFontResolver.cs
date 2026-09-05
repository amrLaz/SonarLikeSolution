using PdfSharp.Fonts;

namespace CodeInsights.Api.Services;

/// <summary>Embedded, deterministic font resolution for both Windows tests and Linux reports.</summary>
public sealed class ExportFontResolver : IFontResolver
{
    private static readonly Lazy<bool> Initialized = new(() =>
    {
        GlobalFontSettings.FontResolver = new ExportFontResolver();
        return true;
    });

    public static void Initialize() => _ = Initialized.Value;

    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) =>
        new(bold ? "DejaVuSans-Bold" : "DejaVuSans", false, italic);

    public byte[] GetFont(string faceName)
    {
        var assembly = typeof(ExportFontResolver).Assembly;
        var name = assembly
            .GetManifestResourceNames()
            .Single(x => x.EndsWith($"Fonts.{faceName}.ttf", StringComparison.Ordinal));
        using var source =
            assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("Embedded report font missing");
        using var target = new MemoryStream();
        source.CopyTo(target);
        return target.ToArray();
    }
}
