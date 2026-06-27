"use client";

// ─────────────────────────────────────────────
// components/UploadZone.tsx
// Drag-and-drop (or click-to-browse) file upload zone.
// Optionally shows a "Take Photo" camera button.
// ─────────────────────────────────────────────

import { useRef, useState, DragEvent } from "react";
import { Upload, FileText, Image as ImageIcon, X, CheckCircle, Camera } from "lucide-react";

interface UploadZoneProps {
    label: string;
    accept: string;           // e.g. ".docx" or ".pdf,.docx,.jpg,.png"
    multiple?: boolean;
    files: File[];
    onAdd: (files: File[]) => void;
    onRemove: (index: number) => void;
    maxFiles?: number;
    /** If true, show a camera capture button alongside the upload zone */
    showCamera?: boolean;
    onOpenCamera?: () => void;
}

function getFileIcon(file: File) {
    if (file.type.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-blue-400" />;
    if (file.name.endsWith(".pdf")) return <FileText className="w-4 h-4 text-red-400" />;
    return <FileText className="w-4 h-4 text-amber-400" />;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadZone({
    label,
    accept,
    multiple = false,
    files,
    onAdd,
    onRemove,
    maxFiles,
    showCamera = false,
    onOpenCamera,
}: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    function handleFiles(incoming: FileList | File[]) {
        const arr = Array.from(incoming);
        const allowed = maxFiles ? arr.slice(0, maxFiles - files.length) : arr;
        if (allowed.length > 0) onAdd(allowed);
    }

    function onDrop(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    }

    function onDragOver(e: DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(true);
    }

    return (
        <div className="space-y-3">
            {/* Drop zone + optional camera button row */}
            <div className={`flex gap-3 ${showCamera ? "items-stretch" : ""}`}>

                {/* Main drop zone */}
                <div
                    onClick={() => inputRef.current?.click()}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={() => setIsDragging(false)}
                    className={`
            relative flex-1 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center
            transition-all duration-300
            ${isDragging
                            ? "border-amber-400 bg-amber-400/10 scale-[1.01]"
                            : "border-white/20 bg-white/5 hover:border-amber-400/60 hover:bg-white/8"
                        }
          `}
                >
                    {/* Glow effect when dragging */}
                    {isDragging && (
                        <div className="pointer-events-none absolute inset-0 rounded-xl bg-amber-400/5 blur-xl" />
                    )}

                    <div className="flex flex-col items-center gap-2">
                        <div className={`
              flex h-12 w-12 items-center justify-center rounded-full border border-white/20
              transition-colors duration-300
              ${isDragging ? "bg-amber-400/20 border-amber-400/40" : "bg-white/10"}
            `}>
                            <Upload
                                className={`h-5 w-5 transition-colors duration-300 ${isDragging ? "text-amber-400" : "text-white/60"
                                    }`}
                            />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white/80">{label}</p>
                            <p className="mt-0.5 text-xs text-white/40">
                                {isDragging ? "Drop it here!" : "Drag & drop or click to browse"}
                            </p>
                            <p className="mt-1 text-xs text-white/30">
                                Accepts: {accept.replace(/,/g, ", ")}
                                {maxFiles ? ` · Max ${maxFiles} file${maxFiles > 1 ? "s" : ""}` : ""}
                            </p>
                        </div>
                    </div>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        multiple={multiple}
                        className="hidden"
                        onChange={(e) => e.target.files && handleFiles(e.target.files)}
                    />
                </div>

                {/* Camera button — shown only for supporting docs */}
                {showCamera && onOpenCamera && (
                    <button
                        onClick={onOpenCamera}
                        title="Take a photo with your camera"
                        className="
              group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
              border-white/20 bg-white/5 px-5 py-6 text-center
              transition-all duration-300
              hover:border-amber-400/60 hover:bg-amber-400/5 hover:scale-[1.01]
              active:scale-[0.99]
            "
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-colors duration-300 group-hover:bg-amber-400/20 group-hover:border-amber-400/40">
                            <Camera className="h-5 w-5 text-white/60 transition-colors duration-300 group-hover:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white/80">Take Photo</p>
                            <p className="mt-0.5 text-xs text-white/40">Use camera</p>
                        </div>
                    </button>
                )}
            </div>

            {/* Uploaded file cards */}
            {files.length > 0 && (
                <div className="space-y-2">
                    {files.map((file, i) => (
                        <div
                            key={`${file.name}-${i}`}
                            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 group"
                        >
                            {/* Thumbnail for images captured from camera */}
                            {file.type.startsWith("image/") ? (
                                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={URL.createObjectURL(file)}
                                        alt={file.name}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                                    {getFileIcon(file)}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white/90">
                                    {file.name}
                                </p>
                                <p className="text-xs text-white/40">{formatBytes(file.size)}</p>
                            </div>
                            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(i);
                                }}
                                className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                            >
                                <X className="h-3.5 w-3.5 text-red-400" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
