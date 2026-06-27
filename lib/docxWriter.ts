// ─────────────────────────────────────────────
// lib/docxWriter.ts
// Applies an AI-generated text patch to a DOCX buffer.
// Strategy: load the DOCX with PizZip, parse word/document.xml,
// and perform targeted string replacements ONLY inside <w:t> text runs,
// preserving all formatting tags (<w:rPr>, <w:tblPr>, etc.).
// ─────────────────────────────────────────────

import PizZip from "pizzip";

/**
 * Apply a patch (Record<originalText, replacementText>) to a DOCX buffer.
 * Only text nodes (<w:t> content) are modified.
 * All formatting, tables, headers, footers are preserved.
 *
 * @param templateBuffer  Raw buffer of the original .docx template
 * @param replacements    Map of { verbatim original text → new text }
 * @returns               Buffer of the patched .docx
 */
export async function applyPatchToDocx(
    templateBuffer: Buffer,
    replacements: Record<string, string>
): Promise<Buffer> {
    // Load the DOCX as a zip
    const zip = new PizZip(templateBuffer);

    // We patch both the main document body AND the headers/footers
    const filesToPatch = [
        "word/document.xml",
        // Header and footer files (e.g., header1.xml, footer1.xml)
        ...Object.keys(zip.files).filter(
            (f) =>
                (f.startsWith("word/header") || f.startsWith("word/footer")) &&
                f.endsWith(".xml")
        ),
    ];

    for (const filePath of filesToPatch) {
        const zipFile = zip.file(filePath);
        if (!zipFile) continue;

        let xmlContent = zipFile.asText();

        // Apply each replacement
        for (const [original, replacement] of Object.entries(replacements)) {
            if (!original || !replacement) continue;

            // The text may be split across multiple <w:t> tags in the XML.
            // To handle both cases (single run and split runs), we:
            //   1. Try a direct XML-text-escaped replacement first (most cases)
            //   2. If not found, reconstruct collapsed text and do paragraph-level swap

            const escapedOriginal = escapeXmlText(original);
            const escapedReplacement = escapeXmlText(replacement);

            if (xmlContent.includes(escapedOriginal)) {
                // Simple case: entire text is in one run
                xmlContent = xmlContent.split(escapedOriginal).join(escapedReplacement);
            } else {
                // Advanced case: text is split across runs — patch at paragraph level
                xmlContent = patchSplitRuns(xmlContent, original, replacement);
            }
        }

        zip.file(filePath, xmlContent);
    }

    // Generate the patched DOCX as a Buffer (Node.js Buffer compatible)
    const output = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
    });

    return output as Buffer;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escape special XML characters in text content */
function escapeXmlText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Handle the case where a phrase is split across multiple <w:t> nodes
 * within the same paragraph. We extract all <w:p> blocks, collapse their
 * visible text, check if the target string exists, then rebuild.
 *
 * This is a best-effort implementation that handles the most common DOCX pattern.
 */
function patchSplitRuns(
    xml: string,
    original: string,
    replacement: string
): string {
    // Match each paragraph block
    const paragraphRegex = /(<w:p[ >][\s\S]*?<\/w:p>)/g;

    return xml.replace(paragraphRegex, (paragraph) => {
        // Collapse all <w:t> text in this paragraph
        const textRunRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let collapsed = "";
        const runs: { full: string; text: string }[] = [];

        let match;
        // Reset lastIndex
        textRunRegex.lastIndex = 0;
        while ((match = textRunRegex.exec(paragraph)) !== null) {
            runs.push({ full: match[0], text: match[1] });
            collapsed += match[1];
        }

        // Unescape for string comparison
        const unescapedCollapsed = unescapeXmlText(collapsed);
        if (!unescapedCollapsed.includes(original)) return paragraph; // nothing to do

        // Replace the occurrence in collapsed text
        const newCollapsed = unescapedCollapsed.split(original).join(replacement);

        // Strategy: put all the new text into the FIRST run, empty the rest.
        // This preserves run formatting of the first run while updating content.
        if (runs.length === 0) return paragraph;

        let patched = paragraph;
        let usedNewText = false;

        for (const run of runs) {
            if (!usedNewText) {
                // First run gets all the new content
                const newRunText = `<w:t xml:space="preserve">${escapeXmlText(newCollapsed)}</w:t>`;
                patched = patched.replace(run.full, newRunText);
                usedNewText = true;
            } else {
                // Subsequent runs in same paragraph that were part of the phrase — empty them
                const emptyRun = `<w:t></w:t>`;
                patched = patched.replace(run.full, emptyRun);
            }
        }

        return patched;
    });
}

/** Unescape XML text characters for plain-text comparison */
function unescapeXmlText(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
