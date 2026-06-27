"use client";

// ─────────────────────────────────────────────
// components/CameraCapture.tsx
// Modal component that opens the device camera (via getUserMedia),
// shows a live preview, lets the user capture a photo, and returns
// the captured image as a File object.
//
// On mobile browsers the native file picker with capture is used as fallback.
// ─────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, ZapOff, RefreshCcw, CheckCircle2 } from "lucide-react";

interface CameraCaptureProps {
    onCapture: (file: File) => void;
    onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [captured, setCaptured] = useState<string | null>(null); // base64 preview
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

    /** Start the camera stream */
    const startCamera = useCallback(async (facing: "environment" | "user") => {
        setIsLoading(true);
        setError(null);
        setCaptured(null);

        // Stop any existing stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Camera access denied";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Start camera on mount
    useEffect(() => {
        startCamera(facingMode);
        return () => {
            // Cleanup: stop stream when modal closes
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Capture current video frame to canvas → base64 */
    function capturePhoto() {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        setCaptured(dataUrl);

        // Pause stream while previewing
        streamRef.current?.getTracks().forEach((t) => (t.enabled = false));
    }

    /** Retake — resume camera stream */
    function retake() {
        setCaptured(null);
        streamRef.current?.getTracks().forEach((t) => (t.enabled = true));
    }

    /** Convert base64 dataUrl to File and call onCapture */
    function confirmCapture() {
        if (!captured) return;
        const byteString = atob(captured.split(",")[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: "image/jpeg" });
        const filename = `photo_${Date.now()}.jpg`;
        const file = new File([blob], filename, { type: "image/jpeg" });
        onCapture(file);
        onClose();
    }

    /** Flip between front/rear camera */
    function flipCamera() {
        const next = facingMode === "environment" ? "user" : "environment";
        setFacingMode(next);
        startCamera(next);
    }

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0B1120] shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-semibold text-white/90">Take a Photo</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-white/40 hover:border-red-500/40 hover:text-red-400 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Camera viewport */}
                <div className="relative bg-black aspect-video flex items-center justify-center">
                    {/* Live preview */}
                    <video
                        ref={videoRef}
                        className={`w-full h-full object-cover ${captured ? "hidden" : "block"}`}
                        playsInline
                        muted
                        onLoadedMetadata={() => setIsLoading(false)}
                    />

                    {/* Captured photo preview */}
                    {captured && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={captured}
                            alt="Captured photo"
                            className="w-full h-full object-contain"
                        />
                    )}

                    {/* Hidden canvas for capture */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Loading overlay */}
                    {isLoading && !error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-400" />
                            <p className="text-sm text-white/60">Starting camera…</p>
                        </div>
                    )}

                    {/* Error state */}
                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
                            <ZapOff className="h-8 w-8 text-red-400" />
                            <p className="text-sm font-medium text-red-400">Camera Unavailable</p>
                            <p className="text-xs text-white/40 max-w-xs">{error}</p>
                            <p className="text-xs text-white/30">
                                Please allow camera access in your browser settings, or upload images from your file system instead.
                            </p>
                        </div>
                    )}

                    {/* Viewfinder overlay (crosshair guide) */}
                    {!captured && !error && !isLoading && (
                        <div className="pointer-events-none absolute inset-6 rounded-xl border border-white/20">
                            {/* Corner brackets */}
                            <div className="absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-amber-400 rounded-tl-sm" />
                            <div className="absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-amber-400 rounded-tr-sm" />
                            <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-amber-400 rounded-bl-sm" />
                            <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-amber-400 rounded-br-sm" />
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4 px-5 py-4 border-t border-white/8">
                    {!captured ? (
                        <>
                            {/* Flip camera */}
                            <button
                                onClick={flipCamera}
                                disabled={!!error || isLoading}
                                title="Flip camera"
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <RefreshCcw className="h-4 w-4" />
                            </button>

                            {/* Capture button */}
                            <button
                                onClick={capturePhoto}
                                disabled={!!error || isLoading}
                                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-amber-400 bg-amber-400 text-[#0B1120] shadow-lg shadow-amber-500/30 hover:scale-105 active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Camera className="h-6 w-6" />
                            </button>

                            {/* Spacer */}
                            <div className="h-10 w-10" />
                        </>
                    ) : (
                        <>
                            {/* Retake */}
                            <button
                                onClick={retake}
                                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <RefreshCcw className="h-3.5 w-3.5" />
                                Retake
                            </button>

                            {/* Confirm */}
                            <button
                                onClick={confirmCapture}
                                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-2.5 text-sm font-bold text-[#0B1120] shadow-lg shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                Use This Photo
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
