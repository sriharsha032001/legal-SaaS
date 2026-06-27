// ─────────────────────────────────────────────
// app/api/generate/route.ts
// Core API endpoint: receives all uploaded files, runs the full pipeline:
//   1. Extract text from each document
//   2. Call GPT-4o for analysis and patch generation
//   3. Apply patch to the DOCX template
//   4. Return the patched DOCX as a download
// ─────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
    extractDocxText,
    extractPdfText,
    imageToBase64DataUri,
} from "@/lib/extractors";
import { generateDocumentPatch, DocumentInput } from "@/lib/aiService";
import { applyPatchToDocx } from "@/lib/docxWriter";
import type { LogEntry } from "@/types";

// Next.js 15: disable body size limit for file uploads
export const config = {
    api: {
        bodyParser: false,
    },
};

// Increase max duration for AI calls (Vercel/Next.js)
export const maxDuration = 120; // seconds

export async function POST(request: NextRequest) {
    const logs: LogEntry[] = [];
    let logCounter = 0;

    /** Helper to push a log entry */
    function addLog(
        message: string,
        type: LogEntry["type"] = "info"
    ): LogEntry {
        const entry: LogEntry = {
            id: `log-${++logCounter}`,
            timestamp: new Date().toISOString(),
            message,
            type,
        };
        logs.push(entry);
        return entry;
    }

    try {
        addLog("Request received. Parsing uploaded files…", "info");

        // ── 1. Parse multipart form data ──────────────────────────────────────
        const formData = await request.formData();
        const provider = (formData.get("provider") as string) || "openai";

        const templateFile = formData.get("template") as File | null;
        if (!templateFile) {
            return NextResponse.json(
                { success: false, error: "No template file provided.", logs },
                { status: 400 }
            );
        }

        const supportingFiles: File[] = [];
        formData.forEach((value, key) => {
            if (key === "supporting" && value instanceof File) {
                supportingFiles.push(value);
            }
        });

        addLog(
            `Provider: ${provider}. Found template: "${templateFile.name}" and ${supportingFiles.length} supporting document(s).`,
            "info"
        );

        // ── 2. Extract template text & raw buffer ──────────────────────────────
        addLog("Extracting text from template…", "info");
        const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
        const templateText = await extractDocxText(templateBuffer);
        addLog(`Template extracted (${templateText.length} characters).`, "success");

        // ── 3. Extract text from all supporting documents ─────────────────────
        addLog("Extracting content from supporting documents…", "info");
        const supportingInputs: DocumentInput[] = [];

        for (const file of supportingFiles) {
            const buffer = Buffer.from(await file.arrayBuffer());
            const mimeType = file.type;
            const name = file.name;

            try {
                if (
                    mimeType ===
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                    name.toLowerCase().endsWith(".docx")
                ) {
                    // DOCX
                    const text = await extractDocxText(buffer);
                    supportingInputs.push({ name, type: "docx", content: text });
                    addLog(`✓ Extracted text from DOCX: ${name}`, "success");
                } else if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
                    // PDF
                    const text = await extractPdfText(buffer);
                    supportingInputs.push({ name, type: "pdf", content: text });
                    addLog(`✓ Extracted text from PDF: ${name}`, "success");
                } else if (
                    mimeType.startsWith("image/") ||
                    /\.(jpg|jpeg|png)$/i.test(name)
                ) {
                    // Image — send to AI
                    const dataUri = imageToBase64DataUri(buffer, mimeType || "image/jpeg");
                    supportingInputs.push({ name, type: "image", content: dataUri });
                    addLog(`✓ Image prepared for vision analysis: ${name}`, "success");
                } else {
                    addLog(`⚠ Unsupported file type skipped: ${name}`, "warning");
                }
            } catch (err) {
                addLog(
                    `⚠ Failed to extract content from ${name}: ${(err as Error).message}`,
                    "warning"
                );
            }
        }

        // ── 4. Call AI Service ───────────────────────────────────────────────────
        addLog(`Sending all documents to ${provider} for analysis…`, "info");
        const patch = await generateDocumentPatch(
            provider as any,
            templateText,
            supportingInputs,
            ({ message, type }) => addLog(message, type)
        );

        // ── 5. Apply patch to DOCX ────────────────────────────────────────────
        addLog("Applying updates to the Word document…", "info");
        const patchedBuffer = await applyPatchToDocx(
            templateBuffer,
            patch.replacements
        );
        addLog(
            "Document updated successfully. Formatting preserved.",
            "success"
        );

        // ── 6. Return DOCX as binary response ─────────────────────────────────
        const safeFilename = templateFile.name.replace(/\.docx$/i, "_updated.docx");

        // Encode logs in response headers (JSON, base64 encoded)
        const logsHeader = Buffer.from(JSON.stringify(logs)).toString("base64");

        return new NextResponse(new Uint8Array(patchedBuffer), {
            status: 200,
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${safeFilename}"`,
                "X-Processing-Logs": logsHeader,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        addLog(`Error: ${message}`, "error");

        return NextResponse.json(
            { success: false, error: message, logs },
            { status: 500 }
        );
    }
}
