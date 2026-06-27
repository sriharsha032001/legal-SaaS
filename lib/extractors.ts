// ─────────────────────────────────────────────
// lib/extractors.ts
// Utilities to extract text content from various file types:
//   - DOCX (via mammoth)
//   - PDF  (via pdf-parse)
//   - Images (JPG/PNG) — raw buffer sent to GPT-4o Vision via AI service
// ─────────────────────────────────────────────

import mammoth from "mammoth";
// pdf-parse ESM has no default export — use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

/**
 * Extract plain text from a DOCX buffer.
 * Preserves paragraph breaks but strips formatting.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
}

/**
 * Extract the raw XML content of a DOCX (for template patching).
 * Returns the word/document.xml string.
 */
export async function extractDocxXml(buffer: Buffer): Promise<string> {
    const PizZip = (await import("pizzip")).default;
    const zip = new PizZip(buffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) throw new Error("Invalid DOCX: word/document.xml not found");
    return xmlFile.asText();
}

/**
 * Extract plain text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text.trim();
}

/**
 * Convert an image buffer to a base64 data URI for use with GPT-4o Vision.
 */
export function imageToBase64DataUri(
    buffer: Buffer,
    mimeType: string
): string {
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
