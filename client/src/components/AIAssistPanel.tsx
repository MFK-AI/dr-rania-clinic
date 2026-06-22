/**
 * AIAssistPanel — Universal AI-powered input assistant for all clinic forms.
 *
 * Provides three input modes:
 *  1. Voice recording  → transcribe → AI extraction → auto-fill form fields
 *  2. Screenshot upload → AI vision OCR → auto-fill form fields
 *  3. Free text paste  → AI extraction → auto-fill form fields
 *
 * Usage:
 *   <AIAssistPanel
 *     mode="patient"          // "patient" | "visit"
 *     onApply={(data) => { setValue("name", data.name ?? ""); ... }}
 *     visitDate="2026-06-19"  // only for visit mode
 *     visitLocation="Prime Hospital"  // only for visit mode
 *   />
 */

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  ImagePlus,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExtractedReminder = {
  title: string;
  reminderType: string;
  dueDate: string | null;
  dueTime?: string | null;
  notes?: string | null;
};

export type PatientExtractedData = {
  name?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  maritalStatus?: "single" | "married" | "divorced" | "widowed" | null;
  pregnancyStatus?: "not_pregnant" | "pregnant" | "postpartum" | null;
  gravida?: number | null;
  para?: number | null;
  abortions?: number | null;
  bloodType?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  currentMedications?: string | null;
  surgicalHistory?: string | null;
  familyHistory?: string | null;
  notes?: string | null;
  // AI-extracted reminder triggers (e.g. "follow up lab at 30/6/2026")
  reminders?: ExtractedReminder[];
};

export type VisitExtractedData = {
  reason_for_visit?: string | null;
  examination?: string | null;
  ultrasound_findings?: string | null;
  labs_imaging?: string | null;
  pending_results?: string | null;
  diagnosis?: string | null;
  management_plan?: string | null;
  medications?: string | null;
  advice?: string | null;
  follow_up_plan?: string | null;
  visit_type?: string | null;
  risk_flags?: string[];
  unclear_words_or_phrases?: string[];
  extraction_status?: string;
};

type Props =
  | {
      mode: "patient";
      onApply: (data: PatientExtractedData) => void;
      visitDate?: never;
      visitLocation?: never;
    }
  | {
      mode: "visit";
      onApply: (data: VisitExtractedData) => void;
      visitDate?: string;
      visitLocation?: "Prime Hospital" | "Mazher Center";
    };

type InputMode = "voice" | "screenshot" | "text";
type PanelState = "idle" | "recording" | "processing" | "preview" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export function AIAssistPanel({ mode, onApply, visitDate, visitLocation }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [pasteText, setPasteText] = useState("");
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[]>(Array(20).fill(4));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── tRPC mutations ───────────────────────────────────────────────────────

  const transcribeAndExtract = trpc.ai.transcribeAndExtract.useMutation();
  const extractPatientFromImage = trpc.ai.extractPatientFromImage.useMutation();
  const extractPatientFromText = trpc.ai.extractPatientFromText.useMutation();
  const extractVisitFromImage = trpc.ai.extractVisitFromImage.useMutation();
  const getUploadUrl = trpc.files.getUploadUrl.useMutation();

  // ─── Waveform animation ───────────────────────────────────────────────────

  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const bars = Array.from({ length: 20 }, (_, i) => {
      const idx = Math.floor((i / 20) * data.length);
      return Math.max(4, Math.round((data[idx]! / 255) * 40));
    });
    setWaveformBars(bars);
    animFrameRef.current = requestAnimationFrame(animateWaveform);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setWaveformBars(Array(20).fill(4));
  }, []);

  // ─── Voice recording ──────────────────────────────────────────────────────

  const startRecording = async () => {
    setErrorMsg("");
    setAudioUrl(null);
    setRecordingDuration(0);
    chunksRef.current = [];

    if (typeof MediaRecorder === "undefined") {
      setErrorMsg("Your browser does not support audio recording. Please use Chrome, Edge, or Firefox.");
      setPanelState("error");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg("Microphone access denied. Please allow microphone permission in your browser settings.");
      setPanelState("error");
      return;
    }

    streamRef.current = stream;

    // Waveform analyser
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      animateWaveform();
    } catch {
      // Waveform is optional — continue without it
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"].find(
      (t) => MediaRecorder.isTypeSupported(t)
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAnimation();
      if (timerRef.current) clearInterval(timerRef.current);
      const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setPanelState("idle");
    };

    recorder.start(250);
    setPanelState("recording");

    timerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const processVoice = async () => {
    if (!audioUrl) return;
    setPanelState("processing");
    try {
      // Upload audio blob to storage
      const resp = await fetch(audioUrl);
      const blob = await resp.blob();
      // BUGFIX: same root cause as the screenshot upload bug -- this was
      // POSTing to /api/storage/upload with no fileKey query param, which
      // the server hard-requires (400 without it). Mint a real key first,
      // matching the same pattern already used for images.
      const { fileKey } = await getUploadUrl.mutateAsync({
        fileName: "voice-note.webm",
        mimeType: blob.type || "audio/webm",
        fileSize: blob.size,
      });
      const formData = new FormData();
      formData.append("file", blob, "voice-note.webm");
      const uploadRes = await fetch(
        `/api/storage/upload?fileKey=${encodeURIComponent(fileKey)}`,
        { method: "POST", body: formData }
      );
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url: rawUploadedUrl } = (await uploadRes.json()) as { url: string };
      // BUGFIX: same issue already fixed for screenshots -- storagePut
      // returns a relative path, but transcribeAndExtract's input schema
      // requires an absolute URL (z.string().url()), so a relative path
      // fails validation with "Invalid URL" before transcription runs.
      const uploadedUrl = new URL(rawUploadedUrl, window.location.origin).toString();

      if (mode === "visit") {
        const result = await transcribeAndExtract.mutateAsync({
          audioUrl: uploadedUrl,
          visitDate: visitDate ?? new Date().toISOString().split("T")[0]!,
          visitLocation,
        });
        setPreviewData(result.extractedData as unknown as Record<string, unknown>);
      } else {
        // For patient mode: transcribe then extract patient fields
        const result = await transcribeAndExtract.mutateAsync({
          audioUrl: uploadedUrl,
          visitDate: new Date().toISOString().split("T")[0]!,
        });
        // Re-extract patient-specific fields from transcript
        const patResult = await extractPatientFromText.mutateAsync({
          text: result.transcript,
        });
        setPreviewData(patResult.extractedData);
      }
      setPanelState("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Processing failed. Please try again.";
      setErrorMsg(msg);
      setPanelState("error");
    }
  };

  // ─── Screenshot upload ────────────────────────────────────────────────────

  const handleImageUpload = async (file: File) => {
    setPanelState("processing");
    setErrorMsg("");
    try {
      // BUGFIX: this previously POSTed straight to /api/storage/upload with
      // no fileKey query param. The server requires fileKey and returns a
      // hard 400 without it, so every screenshot upload failed before the
      // AI extraction ever ran. getUploadUrl validates the file and mints
      // the key, matching the same pattern FilesUpload.tsx already used.
      const { fileKey } = await getUploadUrl.mutateAsync({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      });

      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(
        `/api/storage/upload?fileKey=${encodeURIComponent(fileKey)}`,
        { method: "POST", body: formData }
      );
      if (!uploadRes.ok) throw new Error("Image upload failed");
      const { url: rawUrl } = (await uploadRes.json()) as { url: string };
      // BUGFIX: storagePut returns a relative path ("/manus-storage/...").
      // extractPatientFromImage / extractVisitFromImage require a fully
      // qualified URL (z.string().url()), so a relative path fails Zod
      // validation with "Invalid URL" before the AI ever runs.
      const imageUrl = new URL(rawUrl, window.location.origin).toString();

      if (mode === "patient") {
        const result = await extractPatientFromImage.mutateAsync({ imageUrl });
        setPreviewData(result.extractedData);
      } else {
        const result = await extractVisitFromImage.mutateAsync({
          imageUrl,
          visitDate: visitDate ?? new Date().toISOString().split("T")[0]!,
          visitLocation,
        });
        setPreviewData(result.extractedData);
      }
      setPanelState("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image processing failed. Please try again.";
      setErrorMsg(msg);
      setPanelState("error");
    }
  };

  // ─── Text paste ───────────────────────────────────────────────────────────

  const processText = async () => {
    if (!pasteText.trim()) return;
    setPanelState("processing");
    setErrorMsg("");
    try {
      if (mode === "patient") {
        const result = await extractPatientFromText.mutateAsync({ text: pasteText });
        setPreviewData(result.extractedData);
      } else {
        const result = await trpc.ai.extractFromText.useMutation;
        // Use extractFromText for visit mode
        const visitResult = await (async () => {
          const r = await fetch("/api/trpc/ai.extractFromText", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: pasteText,
              sourceType: "text",
              visitDate: visitDate ?? new Date().toISOString().split("T")[0]!,
              visitLocation,
            }),
          });
          return r.json();
        })();
        setPreviewData((visitResult as { result?: { data?: Record<string, unknown> } })?.result?.data?.extractedData as Record<string, unknown> ?? {});
      }
      setPanelState("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Text processing failed. Please try again.";
      setErrorMsg(msg);
      setPanelState("error");
    }
  };

  // ─── Apply extracted data ─────────────────────────────────────────────────

  const applyData = () => {
    if (!previewData) return;
    if (mode === "patient") {
      onApply(previewData as PatientExtractedData);
    } else {
      onApply(previewData as VisitExtractedData);
    }
    toast.success("AI data applied to form. Please review and adjust as needed.");
    resetPanel();
  };

  const resetPanel = () => {
    setPanelState("idle");
    setPreviewData(null);
    setErrorMsg("");
    setPasteText("");
    setAudioUrl(null);
    setRecordingDuration(0);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const countNonNull = (data: Record<string, unknown>) =>
    Object.values(data).filter((v) => v !== null && v !== undefined && v !== "").length;

  const isProcessing = panelState === "processing";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 overflow-hidden">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-rose-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-rose-500" />
          <span className="text-sm font-semibold text-rose-700">
            AI Smart Input
          </span>
          <Badge variant="secondary" className="text-xs bg-rose-100 text-rose-600 border-rose-200">
            Voice · Screenshot · Paste
          </Badge>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-rose-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-rose-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(["voice", "screenshot", "text"] as InputMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setInputMode(m); resetPanel(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  inputMode === m
                    ? "bg-rose-500 text-white shadow-sm"
                    : "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50"
                }`}
              >
                {m === "voice" && <Mic className="w-3.5 h-3.5" />}
                {m === "screenshot" && <ImagePlus className="w-3.5 h-3.5" />}
                {m === "text" && <FileText className="w-3.5 h-3.5" />}
                {m === "voice" ? "Voice Note" : m === "screenshot" ? "Screenshot" : "Paste Text"}
              </button>
            ))}
          </div>

          {/* ── VOICE MODE ── */}
          {inputMode === "voice" && panelState !== "preview" && (
            <div className="space-y-3">
              <p className="text-xs text-rose-600">
                Record a voice note in Arabic or English. The AI will transcribe and extract all relevant{" "}
                {mode === "patient" ? "patient" : "clinical"} information.
              </p>

              {/* Waveform */}
              {panelState === "recording" && (
                <div className="flex items-end justify-center gap-0.5 h-10 bg-white rounded-lg px-3 py-2">
                  {waveformBars.map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 rounded-full bg-rose-400 transition-all duration-75"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              )}

              {/* Timer */}
              {panelState === "recording" && (
                <div className="text-center text-sm font-mono text-rose-600">
                  ● {formatDuration(recordingDuration)}
                </div>
              )}

              {/* Audio playback */}
              {audioUrl && panelState === "idle" && (
                <audio controls src={audioUrl} className="w-full h-8" />
              )}

              {/* Controls */}
              <div className="flex gap-2">
                {panelState === "idle" && !audioUrl && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={startRecording}
                    className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Start Recording
                  </Button>
                )}
                {panelState === "recording" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={stopRecording}
                    className="border-rose-300 text-rose-600 gap-1.5"
                  >
                    <MicOff className="w-3.5 h-3.5" />
                    Stop
                  </Button>
                )}
                {audioUrl && panelState === "idle" && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={processVoice}
                      className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Extract with AI
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { setAudioUrl(null); setRecordingDuration(0); }}
                      className="border-rose-300 text-rose-600"
                    >
                      Re-record
                    </Button>
                  </>
                )}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-sm text-rose-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Transcribing and extracting…
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SCREENSHOT MODE ── */}
          {inputMode === "screenshot" && panelState !== "preview" && (
            <div className="space-y-3">
              <p className="text-xs text-rose-600">
                Upload a photo or screenshot of a handwritten note, printed form, prescription, or any clinical
                document. The AI will read and extract all{" "}
                {mode === "patient" ? "patient" : "clinical visit"} information.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              {!isProcessing ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    Upload Image / Take Photo
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-rose-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing image with AI…
                </div>
              )}
              <p className="text-xs text-rose-400">
                Supports JPG, PNG, HEIC. On mobile, you can take a photo directly with your camera.
              </p>
            </div>
          )}

          {/* ── TEXT PASTE MODE ── */}
          {inputMode === "text" && panelState !== "preview" && (
            <div className="space-y-3">
              <p className="text-xs text-rose-600">
                Paste or type any text — WhatsApp messages, typed notes, copied text in Arabic or English.
                The AI will extract all {mode === "patient" ? "patient" : "clinical"} information.
              </p>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={
                  mode === "patient"
                    ? "e.g. Patient name: Sara Ahmed, DOB: 1990-05-12, married, G2P1, blood type A+, allergic to penicillin…"
                    : "e.g. Patient complains of lower abdominal pain since 3 days. US shows 8-week pregnancy. Prescribed folic acid…"
                }
                rows={4}
                className="text-sm border-rose-200 focus:border-rose-400 resize-none"
              />
              {!isProcessing ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={processText}
                  disabled={!pasteText.trim()}
                  className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Extract with AI
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-rose-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting information…
                </div>
              )}
            </div>
          )}

          {/* ── ERROR STATE ── */}
          {panelState === "error" && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-700">{errorMsg}</p>
                <button
                  type="button"
                  onClick={resetPanel}
                  className="text-xs text-red-500 underline mt-1"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── PREVIEW STATE ── */}
          {panelState === "preview" && previewData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  <span className="text-sm font-semibold text-rose-700">AI Extraction Preview</span>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    {countNonNull(previewData)} fields found
                  </Badge>
                </div>
              </div>

              {/* Preview table */}
              <div className="max-h-56 overflow-y-auto rounded-lg border border-rose-200 bg-white">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(previewData)
                      .filter(([, v]) => v !== null && v !== undefined && v !== "" && !Array.isArray(v))
                      .map(([key, value]) => (
                        <tr key={key} className="border-b border-rose-50 last:border-0">
                          <td className="px-3 py-1.5 font-medium text-rose-600 w-1/3 capitalize">
                            {key.replace(/_/g, " ")}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700 break-words">
                            {String(value)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {Object.values(previewData).every(
                  (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
                ) && (
                  <p className="text-center text-xs text-gray-400 py-4">
                    No data could be extracted. Please try a different input.
                  </p>
                )}
              </div>

              {/* Risk flags / unclear words */}
              {Array.isArray(previewData.risk_flags) && (previewData.risk_flags as string[]).length > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Flags: {(previewData.risk_flags as string[]).join(", ")}</span>
                </div>
              )}

              <p className="text-xs text-rose-500">
                Review the extracted data above. Click <strong>Apply to Form</strong> to auto-fill the fields — you can edit any value afterwards.
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={applyData}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apply to Form
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetPanel}
                  className="border-rose-300 text-rose-600 gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
