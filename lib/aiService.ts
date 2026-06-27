// ─────────────────────────────────────────────
// lib/aiService.ts
// Calls GPT-4o to analyse all uploaded documents and
// produce a JSON patch to apply to the DOCX template.
// ─────────────────────────────────────────────

import OpenAI from "openai";
import type { LogEntry } from "@/types";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/** One document's extracted data passed to the AI */
export interface DocumentInput {
    name: string;
    type: "docx" | "pdf" | "image";
    /** Plain text content (docx / pdf) or base64 data URI (image) */
    content: string;
}

/**
 * The AI returns a structured patch as JSON.
 * Keys are paragraph/section identifiers extracted from the template,
 * values are the replacement text (or null to leave unchanged).
 *
 * We also get a freeform `notes` array for missing information.
 */
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
 * Call GPT-4o with:
 *   - The extracted template text (for structure understanding)
 *   - All supporting documents (text or images)
 * Returns AIPatch with the sections to update.
 */
export async function generateDocumentPatch(
    templateText: string,
    supportingDocs: DocumentInput[],
    onLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void
): Promise<AIPatch> {
    onLog({ message: "Sending documents to GPT-4o for analysis…", type: "info" });

    // Build the user message — text parts first, then images
    const textParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    const imageParts: OpenAI.Chat.ChatCompletionContentPart[] = [];

    textParts.push({
        type: "text",
        text: `=== LEGAL OPINION TEMPLATE ===\n\n${templateText}\n\n=== END OF TEMPLATE ===\n\nThe documents below contain the property information to extract and use to fill in the template.`,
    });

    for (const doc of supportingDocs) {
        if (doc.type === "image") {
            // GPT-4o Vision: send as image_url
            imageParts.push({
                type: "text",
                text: `\n\n--- Document: ${doc.name} (image) ---`,
            });
            imageParts.push({
                type: "image_url",
                image_url: { url: doc.content, detail: "high" },
            });
        } else {
            textParts.push({
                type: "text",
                text: `\n\n--- Document: ${doc.name} ---\n${doc.content}\n--- End of ${doc.name} ---`,
            });
        }
    }

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
        ...textParts,
        ...imageParts,
        {
            type: "text",
            text: '\n\nNow produce the JSON patch to update the template. Remember: only replace text you are confident about from the documents above. Return ONLY the JSON object.',
        },
    ];

    onLog({ message: "Waiting for GPT-4o response…", type: "info" });

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
        ],
        max_tokens: 4096,
        temperature: 0.1, // Low temperature for precise extraction
    });

    const raw = response.choices[0]?.message?.content ?? "";

    onLog({ message: "GPT-4o response received. Parsing patch…", type: "info" });

    // Strip any accidental markdown fencing
    const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

    let patch: AIPatch;
    try {
        patch = JSON.parse(cleaned);
    } catch {
        throw new Error(
            `AI returned invalid JSON. Raw response: ${raw.slice(0, 300)}`
        );
    }

    // Validate shape
    if (!patch.replacements || typeof patch.replacements !== "object") {
        patch.replacements = {};
    }
    if (!Array.isArray(patch.notes)) {
        patch.notes = [];
    }

    const count = Object.keys(patch.replacements).length;
    onLog({
        message: `AI identified ${count} section(s) to update.`,
        type: "success",
    });

    if (patch.notes.length > 0) {
        for (const note of patch.notes) {
            onLog({ message: `⚠ ${note}`, type: "warning" });
        }
    }

    return patch;
}
