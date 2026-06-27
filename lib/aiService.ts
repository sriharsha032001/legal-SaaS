// ─────────────────────────────────────────────
// lib/aiService.ts
// Supports multiple AI providers: OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet),
// and Google (Gemini 1.5 Pro) to analyse documents and produce JSON patches.
// ─────────────────────────────────────────────

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LogEntry } from "@/types";

/** AI Providers supported by the application */
export type AIProvider = "openai" | "anthropic" | "google";

/** One document's extracted data passed to the AI */
export interface DocumentInput {
    name: string;
    type: "docx" | "pdf" | "image";
    /** Plain text content (docx / pdf) or base64 data URI (image) / Buffer for Gemini */
    content: string;
}

/** The AI returns a structured patch as JSON. */
export interface AIPatch {
    replacements: Record<string, string>;
    notes: string[];
}

const SYSTEM_PROMPT = `You are a precise legal document processing assistant with deep expertise in Indian property law.
Your role is to analyse a set of uploaded documents (property documents, registration papers, survey records, encumbrance certificates, etc.) and update a legal opinion document template.

RULES:
1. Only update sections where you have clear evidence from the uploaded documents.
2. Never invent, assume, or hallucinate any information.
3. If a piece of information is missing or ambiguous, leave the value as null and add an entry to "notes".
4. Preserve all legal language conventions and formal tone of the template.
5. Return ONLY valid JSON — no markdown, no code blocks, no extra explanation.

OUTPUT FORMAT (strict JSON):
{
  "replacements": {
    "<exact text from template that should be replaced>": "<replacement text>"
  },
  "notes": [
    "Section about <X> could not be updated because <reason>"
  ]
}

The keys in "replacements" must be exact verbatim substrings from the template text provided.
Keep replacements minimal — only change what needs to change for accuracy.
`;

/**
 * Call the selected AI provider with:
 *   - The extracted template text
 *   - All supporting documents (text or images)
 * Returns AIPatch with the sections to update.
 */
export async function generateDocumentPatch(
    provider: AIProvider,
    templateText: string,
    supportingDocs: DocumentInput[],
    onLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void
): Promise<AIPatch> {
    const modelName =
        provider === "openai"
            ? "GPT-4o"
            : provider === "anthropic"
                ? "Claude 3.5 Sonnet"
                : "Gemini 1.5 Pro";

    onLog({ message: `Sending documents to ${modelName} for analysis…`, type: "info" });

    let rawResponse = "";

    if (provider === "openai") {
        rawResponse = await callOpenAI(templateText, supportingDocs, onLog);
    } else if (provider === "anthropic") {
        rawResponse = await callAnthropic(templateText, supportingDocs, onLog);
    } else if (provider === "google") {
        rawResponse = await callGoogle(templateText, supportingDocs, onLog);
    }

    onLog({ message: `${modelName} response received. Parsing patch…`, type: "info" });

    // Clean and parse JSON
    const cleaned = rawResponse
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

    let patch: AIPatch;
    try {
        patch = JSON.parse(cleaned);
    } catch {
        throw new Error(`AI returned invalid JSON. Raw response: ${rawResponse.slice(0, 300)}`);
    }

    // Validate shape
    if (!patch.replacements || typeof patch.replacements !== "object") patch.replacements = {};
    if (!Array.isArray(patch.notes)) patch.notes = [];

    const count = Object.keys(patch.replacements).length;
    onLog({ message: `AI identified ${count} section(s) to update.`, type: "success" });

    if (patch.notes.length > 0) {
        for (const note of patch.notes) onLog({ message: `⚠ ${note}`, type: "warning" });
    }

    return patch;
}

// ── Provider Specific Callers ────────────────────────────────────────────────

async function callOpenAI(
    templateText: string,
    supportingDocs: DocumentInput[],
    onLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void
): Promise<string> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const textParts: OpenAI.Chat.ChatCompletionContentPart[] = [
        {
            type: "text",
            text: `=== LEGAL OPINION TEMPLATE ===\n\n${templateText}\n\n=== END OF TEMPLATE ===\n\nThe documents below contain the property information to extract.`,
        },
    ];

    const imageParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const doc of supportingDocs) {
        if (doc.type === "image") {
            imageParts.push({ type: "text", text: `\n\n--- Document: ${doc.name} (image) ---` });
            imageParts.push({ type: "image_url", image_url: { url: doc.content, detail: "high" } });
        } else {
            textParts.push({ type: "text", text: `\n\n--- Document: ${doc.name} ---\n${doc.content}\n--- End of ${doc.name} ---` });
        }
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: [...textParts, ...imageParts, { type: "text", text: "\n\nReturn ONLY the JSON object." }] },
        ],
        max_tokens: 4096,
        temperature: 0.1,
    });

    return response.choices[0]?.message?.content ?? "";
}

async function callAnthropic(
    templateText: string,
    supportingDocs: DocumentInput[],
    onLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void
): Promise<string> {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages: Anthropic.MessageParam[] = [];

    const contentParts: Anthropic.ContentBlockParam[] = [
        {
            type: "text",
            text: `=== LEGAL OPINION TEMPLATE ===\n\n${templateText}\n\n=== END OF TEMPLATE ===\n\nThe documents below contain the property information to extract.`,
        },
    ];

    for (const doc of supportingDocs) {
        if (doc.type === "image") {
            const base64Data = doc.content.split(",")[1];
            const mediaType = doc.content.split(";")[0].split(":")[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
            contentParts.push({ type: "text", text: `\n\n--- Document: ${doc.name} (image) ---` });
            contentParts.push({
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64Data },
            });
        } else {
            contentParts.push({ type: "text", text: `\n\n--- Document: ${doc.name} ---\n${doc.content}\n--- End of ${doc.name} ---` });
        }
    }

    contentParts.push({ type: "text", text: "\n\nReturn ONLY the JSON object." });

    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentParts }],
    });

    const firstBlock = response.content[0];
    return firstBlock.type === "text" ? firstBlock.text : "";
}

async function callGoogle(
    templateText: string,
    supportingDocs: DocumentInput[],
    onLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void
): Promise<string> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const parts: any[] = [
        { text: SYSTEM_PROMPT },
        {
            text: `=== LEGAL OPINION TEMPLATE ===\n\n${templateText}\n\n=== END OF TEMPLATE ===\n\nThe documents below contain the property information to extract.`,
        },
    ];

    for (const doc of supportingDocs) {
        if (doc.type === "image") {
            const base64Data = doc.content.split(",")[1];
            const mimeType = doc.content.split(";")[0].split(":")[1];
            parts.push({ text: `\n\n--- Document: ${doc.name} (image) ---` });
            parts.push({
                inlineData: { data: base64Data, mimeType },
            });
        } else {
            parts.push({ text: `\n\n--- Document: ${doc.name} ---\n${doc.content}\n--- End of ${doc.name} ---` });
        }
    }

    parts.push({ text: "\n\nReturn ONLY the JSON object." });

    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
}
