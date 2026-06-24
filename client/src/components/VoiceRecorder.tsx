/**
 * VoiceRecorder
 * ─────────────────────────────────────────────────────────────────────────────
 * A self-contained microphone recorder that:
 *  1. Captures audio via the MediaRecorder API (webm/opus preferred)
 *  2. Shows a live animated waveform while recording
 *  3. Uploads the blob to /api/storage/upload
 *  4. Calls the tRPC ai.transcribeAndExtract procedure
 *  5. Returns the transcription text + extracted clinical data to the parent
 *
 * Props:
 *  patientId  – required; passed to the extraction procedure
 *  visitId    – optional; links the extraction to an existing visit
 *  onResult   – called with { transcript, extractedData } on success
 *  onError    – called with an error message string on failure
 *  className  – optional wrapper class
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  Square,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceRecorderResult = {
  transcript: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractedData: any;
  extractionId?: number;
};

type Props = {
  patientId: number;
  visitId?: number;
  onResult: (result: VoiceRecorderResult) => void;
  onError?: (msg: string) => void;
  className?: string;
  /** Language hint for Whisper (default: "ar" for Arabic clinical notes) */
  language?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB (Whisper limit is 16 MB)
const WAVEFORM_BARS = 32;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function preferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

type RecordingState = "idle" | "requesting" | "recording" | "stopped" | "uploading" | "processing" | "done" | "error";

export default function VoiceRecorder({
  patientId,
  visitId,
  onResult,
  onError,
  className,
  language = "ar",
}: Props) {
  const [state, setState] = useState<RecordingState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(WAVEFORM_BARS).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const transcribeAndExtract = trpc.ai.transcribeAndExtract.useMutation({
    onSuccess: (data) => {
      setState("done");
      onResult({
        transcript: data.transcript,
        extractedData: data.extractedData,
        extractionId: data.extractionId,
      });
      toast.success("Voice note transcribed and extracted successfully");
    },
    onError: (err) => {
      const msg = err.message ?? "Transcription failed";
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
      toast.error(msg);
    },
  });

  // ── Waveform animation ─────────────────────────────────────────────────────
  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      // Sample WAVEFORM_BARS evenly spaced buckets
      const step = Math.floor(dataArray.length / WAVEFORM_BARS);
      const newBars = Array.from({ length: WAVEFORM_BARS }, (_, i) => {
        const val = dataArray[i * step] ?? 0;
        return Math.max(4, Math.round((val / 255) * 48));
      });
      setBars(newBars);
      animFrameRef.current = requestAnimationFrame(draw);
    };
    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setBars(Array(WAVEFORM_BARS).fill(4));
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAnimation();
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl, stopAnimation]);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    setState("requesting");
    setErrorMsg("");
    setAudioUrl(null);
    setDuration(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      const msg =
        "Microphone access denied. Please allow microphone permission in your browser settings.";
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    streamRef.current = stream;

    // Set up Web Audio analyser for waveform
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAnimation();
      if (timerRef.current) clearInterval(timerRef.current);

      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setState("stopped");
    };

    recorder.start(250); // collect chunks every 250 ms
    setState("recording");
    animateWaveform();

    // Duration timer
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  };

  // ── Stop recording ─────────────────────────────────────────────────────────
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  // ── Discard and reset ──────────────────────────────────────────────────────
  const discard = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
    setState("idle");
    setErrorMsg("");
    chunksRef.current = [];
  };

  // ── Upload + transcribe ────────────────────────────────────────────────────
  const uploadAndTranscribe = async () => {
    if (!chunksRef.current.length) return;

    const mimeType = preferredMimeType() || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });

    if (blob.size > MAX_BYTES) {
      const msg = `Recording is too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Maximum is 15 MB. Please record a shorter note.`;
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
      return;
    }

    setState("uploading");
    setUploadProgress(0);

    try {
      // Convert audio blob to base64 data URI directly in the browser.
      // This bypasses the entire S3 → signed URL → server fetch pipeline,
      // eliminating all storage layer failures as a possible root cause.
      // The server's transcribeAudio function handles data URIs natively.
      const audioUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          setUploadProgress(100);
          resolve(reader.result as string);
        };
        reader.onerror = () => reject(new Error("Failed to read audio file"));
        reader.readAsDataURL(blob);
      });

      setState("processing");

      const today = new Date().toISOString().split("T")[0]!;
      transcribeAndExtract.mutate({
        audioUrl,
        visitDate: today,
        patientId,
        visitId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setState("error");
      setErrorMsg(msg);
      onError?.(msg);
      toast.error(msg);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center",
            state === "recording"
              ? "bg-red-100 text-red-500 animate-pulse"
              : "bg-primary/10 text-primary"
          )}
        >
          {state === "recording" ? (
            <Mic className="h-4 w-4" />
          ) : state === "uploading" || state === "processing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : state === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : state === "error" ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium leading-none">
            {state === "idle" && "Voice Note"}
            {state === "requesting" && "Requesting microphone…"}
            {state === "recording" && `Recording — ${formatDuration(duration)}`}
            {state === "stopped" && `Recorded — ${formatDuration(duration)}`}
            {state === "uploading" && "Uploading…"}
            {state === "processing" && "Transcribing with AI…"}
            {state === "done" && "Transcription complete"}
            {state === "error" && "Error"}
          </p>
          {state === "recording" && (
            <p className="text-xs text-muted-foreground mt-0.5">Speak clearly — AI will transcribe</p>
          )}
          {state === "error" && (
            <p className="text-xs text-destructive mt-0.5 line-clamp-2">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* Live waveform */}
      {state === "recording" && (
        <div className="flex items-center justify-center gap-[2px] h-14 px-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-primary transition-all duration-75"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      )}

      {/* Audio playback */}
      {audioUrl && state === "stopped" && (
        <audio
          src={audioUrl}
          controls
          className="w-full h-9 rounded-lg"
          style={{ accentColor: "var(--primary)" }}
        />
      )}

      {/* Upload progress */}
      {state === "uploading" && (
        <div className="space-y-1">
          <Progress value={uploadProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
        </div>
      )}

      {/* Processing indicator */}
      {state === "processing" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Sending to AI for clinical extraction…
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {(state === "idle" || state === "error") && (
          <Button
            type="button"
            onClick={startRecording}
            className="flex-1 gap-2"
            size="sm"
          >
            <Mic className="h-3.5 w-3.5" />
            {state === "error" ? "Try Again" : "Start Recording"}
          </Button>
        )}

        {state === "recording" && (
          <Button
            type="button"
            onClick={stopRecording}
            variant="destructive"
            className="flex-1 gap-2"
            size="sm"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop Recording
          </Button>
        )}

        {state === "stopped" && (
          <>
            <Button
              type="button"
              onClick={uploadAndTranscribe}
              className="flex-1 gap-2"
              size="sm"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Transcribe &amp; Extract
            </Button>
            <Button
              type="button"
              onClick={discard}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Discard
            </Button>
          </>
        )}

        {state === "done" && (
          <Button
            type="button"
            onClick={discard}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <MicOff className="h-3.5 w-3.5" />
            Record Another
          </Button>
        )}
      </div>

      {/* Browser support warning */}
      {typeof MediaRecorder === "undefined" && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          Your browser does not support audio recording. Please use Chrome, Edge, or Firefox.
        </p>
      )}
    </div>
  );
}
