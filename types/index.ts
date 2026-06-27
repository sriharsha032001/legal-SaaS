// ─────────────────────────────────────────────
// Shared TypeScript types for the Legal Opinion Tool
// ─────────────────────────────────────────────

/** Status of the overall generation pipeline */
export type GenerationStatus =
  | "idle"
  | "uploading"
  | "extracting"
  | "analyzing"
  | "generating"
  | "done"
  | "error";

/** A single log entry that appears in the status feed */
export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  message: string;
  type: "info" | "success" | "warning" | "error";
}

/** A file uploaded by the user (client-side representation) */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;            // bytes
  type: string;            // MIME type
  role: "template" | "supporting";
  file: File;              // native File object
}

/** Response from the /api/generate endpoint */
export interface GenerateResponse {
  success: boolean;
  logs: LogEntry[];
  error?: string;
  // The docx blob is returned directly as a binary stream, not JSON
}
