import nodeModule from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * pdfmake loader shared by the PDF exports (P5.4 reconciliation, P5.5 reports). pdfmake is kept
 * out of the Next bundle (serverExternalPackages) and loaded with createRequire; fonts are read
 * from disk (Roboto shipped with pdfmake — has Vietnamese glyphs).
 */

let pdfmakeInstance: { createPdf: (d: unknown) => { getBuffer: () => Promise<Buffer> } } | null =
  null;

export function pdfmake() {
  if (!pdfmakeInstance) {
    const req = nodeModule.createRequire(import.meta.url);
    const lib = req("pdfmake");
    // Fonts are read from disk: from the app dir (next start / standalone / Docker cwd). A
    // require.resolve() here is rewritten by Turbopack into a module id, so it cannot be used.
    const fontDir = [
      process.env.PDF_FONT_DIR,
      path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto"),
    ].find((d): d is string => !!d && existsSync(path.join(d, "Roboto-Regular.ttf")));
    if (!fontDir) throw new Error("pdfmake Roboto fonts not found (set PDF_FONT_DIR)");
    const font = (f: string) => path.join(fontDir, f);
    lib.addFonts({
      Roboto: {
        normal: font("Roboto-Regular.ttf"),
        bold: font("Roboto-Medium.ttf"),
        italics: font("Roboto-Italic.ttf"),
        bolditalics: font("Roboto-MediumItalic.ttf"),
      },
    });
    lib.setLocalAccessPolicy((p: string) => p.includes("pdfmake"));
    lib.setUrlAccessPolicy(() => false);
    pdfmakeInstance = lib;
  }
  return pdfmakeInstance!;
}
