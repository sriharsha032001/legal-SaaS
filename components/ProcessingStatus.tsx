"use client";

// ─────────────────────────────────────────────
// components/ProcessingStatus.tsx
// Scrollable real-time log feed for the AI pipeline progress
// ─────────────────────────────────────────────

import { useEffect, useRef } from "react";
import {
    Info,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Loader2,
} from "lucide-react";
import type { LogEntry, GenerationStatus } from "@/types";

interface ProcessingStatusProps {
    logs: LogEntry[];
    status: GenerationStatus;
}

const statusConfig: Record<
    GenerationStatus,
    { label: string; color: string; animate: boolean }
> = {
    idle: { label: "Waiting for documents…", color: "text-white/40", animate: false },
    uploading: { label: "Uploading files…", color: "text-blue-400", animate: true },
    extracting: { label: "Extracting document text…", color: "text-blue-400", animate: true },
    analyzing: { label: "AI is analyzing documents…", color: "text-amber-400", animate: true },
    generating: { label: "Generating updated DOCX…", color: "text-amber-400", animate: true },
    done: { label: "Document ready to download!", color: "text-emerald-400", animate: false },
    error: { label: "An error occurred.", color: "text-red-400", animate: false },
};

const logIconMap = {
    info: <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
};

const logTextColor = {
    info: "text-white/70",
    success: "text-emerald-300/90",
    warning: "text-amber-300/90",
    error: "text-red-300/90",
};

export default function ProcessingStatus({
    logs,
    status,
}: ProcessingStatusProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const cfg = statusConfig[status];

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="flex flex-col gap-3">
            {/* Current status badge */}
            <div className="flex items-center gap-2">
                {cfg.animate && (
                    <Loader2 className={`w-4 h-4 animate-spin ${cfg.color}`} />
                )}
                <span className={`text-sm font-semibold ${cfg.color}`}>
                    {cfg.label}
                </span>
            </div>

            {/* Log feed */}
            <div
                ref={scrollRef}
                className="h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 space-y-1.5 scrollbar-thin"
            >
                {logs.length === 0 ? (
                    <p className="text-center text-xs text-white/25 py-4">
                        Logs will appear here during processing…
                    </p>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2">
                            {logIconMap[log.type]}
                            <span className={`text-xs font-mono leading-relaxed ${logTextColor[log.type]}`}>
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
