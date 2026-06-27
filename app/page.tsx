"use client";

// ─────────────────────────────────────────────
// app/page.tsx
// Main (and only) page of the Legal Opinion AI Tool.
// Two-column layout:
//   Left  — Upload template + supporting documents
//   Right — File summary, processing status, generate & download buttons
// ─────────────────────────────────────────────

import { useState, useCallback } from "react";
import {
  Scale,
  Sparkles,
  Download,
  FileCheck2,
  Trash2,
  FileWarning,
} from "lucide-react";
import UploadZone from "@/components/UploadZone";
import ProcessingStatus from "@/components/ProcessingStatus";
import CameraCapture from "@/components/CameraCapture";
import type { LogEntry, GenerationStatus } from "@/types";

export default function Home() {
  // ── State ──────────────────────────────────────────────────────────────
  const [templateFiles, setTemplateFiles] = useState<File[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("updated_document.docx");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "anthropic" | "google">("openai");

  // ── Helpers ────────────────────────────────────────────────────────────
  let logCounter = 0;
  function makeLog(message: string, type: LogEntry["type"] = "info"): LogEntry {
    return {
      id: `log-${++logCounter}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message,
      type,
    };
  }

  function addLog(message: string, type: LogEntry["type"] = "info") {
    setLogs((prev) => [...prev, makeLog(message, type)]);
  }

  // ── File handlers ──────────────────────────────────────────────────────
  const handleAddTemplate = useCallback((files: File[]) => {
    setTemplateFiles(files.slice(0, 1)); // Only 1 template
    setDownloadUrl(null);
    setLogs([]);
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const handleRemoveTemplate = useCallback(() => {
    setTemplateFiles([]);
    setDownloadUrl(null);
  }, []);

  const handleAddSupporting = useCallback((files: File[]) => {
    setSupportingFiles((prev) => {
      const combined = [...prev, ...files];
      return combined.slice(0, 20); // max 20 supporting docs
    });
  }, []);

  /** Called when camera captures a photo — treat it like a file upload */
  const handleCameraCapture = useCallback((file: File) => {
    setSupportingFiles((prev) => [...prev, file].slice(0, 20));
  }, []);

  const handleRemoveSupporting = useCallback((index: number) => {
    setSupportingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  function handleReset() {
    setTemplateFiles([]);
    setSupportingFiles([]);
    setStatus("idle");
    setLogs([]);
    setDownloadUrl(null);
    setErrorMessage(null);
  }

  // ── Core: Generate ─────────────────────────────────────────────────────
  async function handleGenerate() {
    if (templateFiles.length === 0) return;

    // Clear previous state
    setDownloadUrl(null);
    setErrorMessage(null);
    setLogs([]);
    setStatus("uploading");

    addLog("Preparing files for upload…", "info");

    const formData = new FormData();
    formData.append("template", templateFiles[0]);
    formData.append("provider", selectedProvider);
    for (const file of supportingFiles) {
      formData.append("supporting", file);
    }

    setStatus("extracting");
    addLog("Uploading files to server…", "info");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      // Try to decode server logs from the response header
      const logsHeader = response.headers.get("X-Processing-Logs");
      if (logsHeader) {
        try {
          const serverLogs: LogEntry[] = JSON.parse(
            Buffer.from(logsHeader, "base64").toString("utf8")
          );
          setLogs(serverLogs);
        } catch {
          // Ignore header parsing errors
        }
      }

      if (!response.ok) {
        // Error response — parse JSON body
        let errMsg = `Server error: ${response.status}`;
        try {
          const errBody = await response.json();
          errMsg = errBody.error ?? errMsg;
          if (errBody.logs) setLogs(errBody.logs);
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      // Check content type — should be DOCX binary
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!contentType.includes("wordprocessingml")) {
        // Unexpected — try to read as JSON error
        const errBody = await response.json().catch(() => ({})) as { error?: string; logs?: LogEntry[] };
        if (errBody.logs) setLogs(errBody.logs);
        throw new Error(errBody.error ?? "Unexpected response format from server.");
      }

      // ── Success: create a download URL from the blob ──────────────────
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Extract filename from Content-Disposition
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "legal_opinion_updated.docx";

      setDownloadUrl(url);
      setDownloadName(filename);
      setStatus("done");
      addLog("✓ Document generated and ready to download!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setErrorMessage(msg);
      setStatus("error");
      addLog(`Error: ${msg}`, "error");
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const canGenerate =
    templateFiles.length > 0 &&
    status !== "uploading" &&
    status !== "extracting" &&
    status !== "analyzing" &&
    status !== "generating";

  const isProcessing = ["uploading", "extracting", "analyzing", "generating"].includes(status);

  const totalFiles = templateFiles.length + supportingFiles.length;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080E1A] text-white font-sans">
      {/* ── Background gradient orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-amber-500/5 blur-3xl" />
        <div className="absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-blue-600/5 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-indigo-600/5 blur-3xl" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-white/8 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/25">
              <Scale className="h-5 w-5 text-[#080E1A]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">LegalDoc AI</h1>
              <p className="text-xs text-white/40">Automated Legal Opinion Generator</p>
            </div>
          </div>

          {/* Model selection toggle */}
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {[
              { id: "openai", label: "GPT-4o", color: "hover:text-emerald-400" },
              { id: "anthropic", label: "Claude 3.5", color: "hover:text-amber-400" },
              { id: "google", label: "Gemini Pro", color: "hover:text-blue-400" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id as any)}
                className={`
                  rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200
                  ${selectedProvider === p.id
                    ? "bg-white/10 text-white shadow-sm"
                    : `text-white/40 ${p.color}`
                  }
                `}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
            <span
              className={`h-2 w-2 rounded-full ${status === "done"
                ? "bg-emerald-400"
                : status === "error"
                  ? "bg-red-400"
                  : isProcessing
                    ? "bg-amber-400 animate-pulse"
                    : "bg-white/20"
                }`}
            />
            <span className="text-xs text-white/60 capitalize">
              {status === "idle" ? "Ready" : status}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main two-column layout ── */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* ────────────────── LEFT PANEL ────────────────── */}
          <div className="space-y-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-amber-400/80">
                <span className="h-px flex-1 bg-amber-400/20" />
                Upload Documents
                <span className="h-px flex-1 bg-amber-400/20" />
              </h2>
            </div>

            {/* Template upload */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white/90">
                  Template Document
                </h3>
                <span className="ml-auto rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-400">
                  Required
                </span>
              </div>
              <p className="mb-4 text-xs text-white/40 leading-relaxed">
                Upload your standard legal opinion Word document. The AI will
                update this with the property information from the supporting
                documents.
              </p>
              <UploadZone
                label="Upload Legal Opinion Template (.docx)"
                accept=".docx"
                multiple={false}
                files={templateFiles}
                onAdd={handleAddTemplate}
                onRemove={handleRemoveTemplate}
                maxFiles={1}
              />
            </div>

            {/* Supporting documents upload */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5 backdrop-blur-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white/90">
                  Supporting Documents
                </h3>
                <span className="ml-auto rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/50">
                  Optional
                </span>
              </div>
              <p className="mb-4 text-xs text-white/40 leading-relaxed">
                Upload property registration papers, survey documents,
                encumbrance certificates, ownership deeds, and any other
                relevant documents (PDF, DOCX, JPG, PNG).
              </p>
              <UploadZone
                label="Upload Supporting Documents"
                accept=".pdf,.docx,.jpg,.jpeg,.png"
                multiple={true}
                files={supportingFiles}
                onAdd={handleAddSupporting}
                onRemove={handleRemoveSupporting}
                maxFiles={20}
                showCamera={true}
                onOpenCamera={() => setShowCamera(true)}
              />
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl border border-white/6 bg-white/2 px-4 py-3">
              <p className="text-xs text-white/30 leading-relaxed">
                <span className="font-semibold text-white/50">Notice:</span> All
                processing happens in-memory on a secure server. No documents are
                stored or retained after your session ends.
              </p>
            </div>
          </div>

          {/* ────────────────── RIGHT PANEL ────────────────── */}
          <div className="space-y-6">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-amber-400/80">
                <span className="h-px flex-1 bg-amber-400/20" />
                Generation
                <span className="h-px flex-1 bg-amber-400/20" />
              </h2>
            </div>

            {/* File summary card */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5 backdrop-blur-sm">
              <h3 className="mb-4 text-sm font-semibold text-white/90">
                Document Summary
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                  value={templateFiles.length}
                  label="Template"
                  color="text-amber-400"
                  bg="bg-amber-400/10"
                />
                <SummaryCard
                  value={supportingFiles.length}
                  label="Supporting"
                  color="text-blue-400"
                  bg="bg-blue-400/10"
                />
                <SummaryCard
                  value={totalFiles}
                  label="Total Files"
                  color="text-emerald-400"
                  bg="bg-emerald-400/10"
                />
              </div>
            </div>

            {/* Processing status */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5 backdrop-blur-sm">
              <h3 className="mb-4 text-sm font-semibold text-white/90">
                Processing Log
              </h3>
              <ProcessingStatus logs={logs} status={status} />
            </div>

            {/* AI workflow steps */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5 backdrop-blur-sm">
              <h3 className="mb-4 text-sm font-semibold text-white/90">
                AI Workflow
              </h3>
              <div className="space-y-2">
                {[
                  { step: "1", label: "Extract text from all documents", active: status === "extracting" },
                  { step: "2", label: "AI reads and understands the template", active: status === "analyzing" },
                  { step: "3", label: "Identify property info to update", active: status === "analyzing" },
                  { step: "4", label: "Patch DOCX preserving all formatting", active: status === "generating" },
                  { step: "5", label: "Download updated legal opinion", active: status === "done" },
                ].map(({ step, label, active }) => (
                  <div key={step} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-300 ${active ? "bg-amber-400/10" : "bg-transparent"
                    }`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${active
                      ? "bg-amber-400 text-[#080E1A]"
                      : "bg-white/10 text-white/40"
                      }`}>
                      {step}
                    </span>
                    <span className={`text-xs transition-colors duration-300 ${active ? "text-amber-300/90 font-medium" : "text-white/40"
                      }`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-red-400">Generation Failed</p>
                <p className="mt-1 text-xs text-red-300/80 leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`
                  group relative flex items-center justify-center gap-3 rounded-xl px-6 py-4
                  text-sm font-bold transition-all duration-300
                  ${canGenerate
                    ? "bg-gradient-to-r from-amber-500 to-amber-400 text-[#080E1A] shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]"
                    : "bg-white/5 text-white/25 cursor-not-allowed"
                  }
                `}
              >
                {isProcessing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#080E1A]/40 border-t-[#080E1A]" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Document
                    {canGenerate && (
                      <span className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    )}
                  </>
                )}
              </button>

              {/* Download button */}
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="flex items-center justify-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-4 text-sm font-bold text-emerald-400 transition-all duration-300 hover:bg-emerald-500/20 hover:border-emerald-500/60 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Download className="h-4 w-4" />
                  Download Updated Document
                  <span className="ml-auto text-xs text-emerald-400/50 font-normal">
                    {downloadName}
                  </span>
                </a>
              )}

              {/* Reset button */}
              {(totalFiles > 0 || status !== "idle") && (
                <button
                  onClick={handleReset}
                  disabled={isProcessing}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-6 py-3 text-xs font-medium text-white/40 transition-all duration-300 hover:border-red-500/30 hover:text-red-400/80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Reset All
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom info strip ── */}
        <div className="mt-10 flex items-center justify-center gap-6 border-t border-white/6 pt-6">
          <InfoBadge label="Model" value="GPT-4o" />
          <InfoBadge label="Storage" value="None — in-memory only" />
          <InfoBadge label="Supported Inputs" value="DOCX · PDF · JPG · PNG" />
          <InfoBadge label="Output" value=".docx (formatting preserved)" />
        </div>
      </main>
      {/* ── Camera capture modal ── */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────────────────────────

function SummaryCard({
  value,
  label,
  color,
  bg,
}: {
  value: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`flex flex-col items-center rounded-xl p-3 ${bg}`}>
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="mt-0.5 text-xs text-white/40">{label}</span>
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-white/30">{label}:</span>
      <span className="text-white/60 font-medium">{value}</span>
    </div>
  );
}
