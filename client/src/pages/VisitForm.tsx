import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import VoiceRecorder, { type VoiceRecorderResult } from "@/components/VoiceRecorder";
import { AIAssistPanel, type VisitExtractedData } from "@/components/AIAssistPanel";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Save, Mic, MicOff, Loader2 } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useParams, useSearch } from "wouter";

type VisitLocation = "Prime Hospital" | "Mazher Center";

// ─── Per-field inline mic button ─────────────────────────────────────────────

function FieldMicButton({
  onTranscript,
  placeholder,
  top = false,
}: {
  onTranscript: (text: string) => void;
  placeholder?: string;
  top?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const transcribeAndExtract = trpc.ai.transcribeAndExtract.useMutation();

  const start = async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(
        (t) => MediaRecorder.isTypeSupported(t)
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setState("processing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
          const fd = new FormData();
          fd.append("file", blob, "field-note.webm");
          const uploadRes = await fetch("/api/storage/upload", { method: "POST", body: fd });
          if (!uploadRes.ok) throw new Error("Upload failed");
          const { url } = (await uploadRes.json()) as { url: string };
          const result = await transcribeAndExtract.mutateAsync({
            audioUrl: url,
            visitDate: new Date().toISOString().split("T")[0]!,
          });
          onTranscript(result.transcript);
          toast.success("Voice transcribed — field updated");
        } catch {
          toast.error("Transcription failed. Please try again.");
        } finally {
          setState("idle");
        }
      };
      recorder.start(250);
      setState("recording");
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const stop = () => { mediaRecorderRef.current?.stop(); };

  if (typeof MediaRecorder === "undefined") return null;

  return (
    <button
      type="button"
      title={state === "idle" ? (placeholder ?? "Dictate this field") : state === "recording" ? "Tap to stop" : "Processing…"}
      onClick={state === "idle" ? start : state === "recording" ? stop : undefined}
      className={`absolute right-2 ${top ? "top-2" : "top-1/2 -translate-y-1/2"} p-1.5 rounded-md transition-colors z-10 ${
        state === "recording"
          ? "bg-rose-100 text-rose-600 animate-pulse"
          : state === "processing"
          ? "bg-gray-100 text-gray-400 cursor-wait"
          : "text-gray-400 hover:text-rose-500 hover:bg-rose-50"
      }`}
    >
      {state === "processing" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : state === "recording" ? (
        <MicOff className="w-3.5 h-3.5" />
      ) : (
        <Mic className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

// ─── Main VisitForm ───────────────────────────────────────────────────────────

export default function VisitForm() {
  const { id } = useParams<{ id: string }>();
  const visitId = id ? parseInt(id) : null;
  const isEdit = !!visitId;
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const patientIdFromQuery = params.get("patientId") ? parseInt(params.get("patientId")!) : null;

  const { data: existing, isLoading } = trpc.visits.getById.useQuery(
    { id: visitId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState({
    patientId: patientIdFromQuery?.toString() ?? "",
    visitDate: new Date().toISOString().split("T")[0],
    visitLocation: "Prime Hospital" as VisitLocation,
    visitType: "",
    reasonForVisit: "",
    diagnosis: "",
    examination: "",
    ultrasoundFindings: "",
    labsImaging: "",
    pendingResults: "",
    managementPlan: "",
    medications: "",
    advice: "",
    followUpPlan: "",
  });

  // ── Voice recorder toggle ─────────────────────────────────────────────────
  const [showVoice, setShowVoice] = useState(false);

  // ── AI auto-fill handler (from AIAssistPanel) ─────────────────────────────
  const handleAiApply = useCallback((data: VisitExtractedData) => {
    setForm((f) => ({
      ...f,
      reasonForVisit:     data.reason_for_visit    ? String(data.reason_for_visit)    : f.reasonForVisit,
      diagnosis:          data.diagnosis           ? String(data.diagnosis)           : f.diagnosis,
      examination:        data.examination         ? String(data.examination)         : f.examination,
      ultrasoundFindings: data.ultrasound_findings ? String(data.ultrasound_findings) : f.ultrasoundFindings,
      labsImaging:        data.labs_imaging        ? String(data.labs_imaging)        : f.labsImaging,
      pendingResults:     data.pending_results     ? String(data.pending_results)     : f.pendingResults,
      managementPlan:     data.management_plan     ? String(data.management_plan)     : f.managementPlan,
      medications:        data.medications         ? String(data.medications)         : f.medications,
      advice:             data.advice              ? String(data.advice)              : f.advice,
      followUpPlan:       data.follow_up_plan      ? String(data.follow_up_plan)      : f.followUpPlan,
    }));
  }, []);

  useEffect(() => {
    if (existing?.visit) {
      const v = existing.visit;
      setForm({
        patientId: v.patientId.toString(),
        visitDate: v.visitDate,
        visitLocation: (v.visitLocation ?? "Prime Hospital") as VisitLocation,
        visitType: v.visitType ?? "",
        reasonForVisit: v.reasonForVisit ?? "",
        diagnosis: v.diagnosis ?? "",
        examination: v.examination ?? "",
        ultrasoundFindings: v.ultrasoundFindings ?? "",
        labsImaging: v.labsImaging ?? "",
        pendingResults: v.pendingResults ?? "",
        managementPlan: v.managementPlan ?? "",
        medications: v.medications ?? "",
        advice: v.advice ?? "",
        followUpPlan: v.followUpPlan ?? "",
      });
    }
  }, [existing]);

  const utils = trpc.useUtils();

  const extractReminders = trpc.ai.extractRemindersFromVisit.useMutation({
    onSuccess: (data) => {
      const count = data.savedCount ?? 0;
      if (count > 0) {
        toast.success(`🔔 ${count} reminder${count > 1 ? 's' : ''} auto-saved from visit notes — check Reminders page`);
      }
    },
  });

  const createVisit = trpc.visits.create.useMutation({
    onSuccess: (data) => {
      toast.success("Visit created successfully");
      utils.visits.listByPatient.invalidate({ patientId: parseInt(form.patientId) });
      // Auto-extract reminders from clinical notes in background
      if (form.diagnosis || form.pendingResults || form.followUpPlan || form.managementPlan) {
        extractReminders.mutate({
          visitId: data.id,
          patientId: parseInt(form.patientId),
          visitDate: form.visitDate,
          diagnosis: form.diagnosis || undefined,
          examination: form.examination || undefined,
          labsImaging: form.labsImaging || undefined,
          pendingResults: form.pendingResults || undefined,
          managementPlan: form.managementPlan || undefined,
          medications: form.medications || undefined,
          advice: form.advice || undefined,
          followUpPlan: form.followUpPlan || undefined,
        });
      }
      setLocation(`/visits/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateVisit = trpc.visits.update.useMutation({
    onSuccess: () => {
      toast.success("Visit updated successfully");
      utils.visits.getById.invalidate({ id: visitId! });
      setLocation(`/visits/${visitId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Auto-fill form from quick VoiceRecorder ───────────────────────────────
  const handleVoiceResult = (result: VoiceRecorderResult) => {
    const d = result.extractedData as Record<string, string | undefined>;
    setForm((f) => ({
      ...f,
      reasonForVisit:     d["reason_for_visit"]    ?? f.reasonForVisit,
      diagnosis:          d["diagnosis"]            ?? f.diagnosis,
      examination:        d["examination"]          ?? f.examination,
      ultrasoundFindings: d["ultrasound_findings"]  ?? f.ultrasoundFindings,
      labsImaging:        d["labs_imaging"]         ?? f.labsImaging,
      pendingResults:     d["pending_results"]      ?? f.pendingResults,
      managementPlan:     d["management_plan"]      ?? f.managementPlan,
      medications:        d["medications"]          ?? f.medications,
      advice:             d["advice"]               ?? f.advice,
      followUpPlan:       d["follow_up_plan"]       ?? f.followUpPlan,
    }));
    setShowVoice(false);
    toast.success("Voice note transcribed — fields pre-filled. Please review before saving.");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patientId || !form.visitDate) {
      toast.error("Patient and visit date are required");
      return;
    }
    const payload = {
      patientId: parseInt(form.patientId),
      visitDate: form.visitDate,
      visitLocation: form.visitLocation,
      visitType: form.visitType || undefined,
      reasonForVisit: form.reasonForVisit || undefined,
      diagnosis: form.diagnosis || undefined,
      examination: form.examination || undefined,
      ultrasoundFindings: form.ultrasoundFindings || undefined,
      labsImaging: form.labsImaging || undefined,
      pendingResults: form.pendingResults || undefined,
      managementPlan: form.managementPlan || undefined,
      medications: form.medications || undefined,
      advice: form.advice || undefined,
      followUpPlan: form.followUpPlan || undefined,
    };
    if (isEdit) {
      updateVisit.mutate({ id: visitId!, data: payload });
    } else {
      createVisit.mutate(payload);
    }
  };

  const isSubmitting = createVisit.isPending || updateVisit.isPending;

  if (isEdit && isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-semibold">
            {isEdit ? "Edit Visit" : "New Visit"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Use AI Smart Input to auto-fill from voice, screenshot, or pasted text — or type directly in any field
          </p>
        </div>
        <div className="ml-auto">
          <Button
            type="button"
            variant={showVoice ? "default" : "outline"}
            size="sm"
            onClick={() => setShowVoice((v) => !v)}
            className="gap-2"
          >
            {showVoice ? (
              <>
                <MicOff className="h-3.5 w-3.5" />
                Hide Quick Dictation
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                Quick Dictation
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── AI Smart Input Panel (screenshot + paste + full voice) ── */}
      <AIAssistPanel mode="visit" onApply={handleAiApply} />

      {/* ── Quick Voice Recorder Card ── */}
      {showVoice && (
        <div className="mb-5 mt-4">
          <Card className="border-primary/40 shadow-md bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                Quick Dictation — Auto-fills All Fields
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Speak your full clinical notes in Arabic or English. AI will transcribe and
                automatically fill all fields below. Review before saving.
              </p>
            </CardHeader>
            <CardContent>
              <VoiceRecorder
                patientId={form.patientId ? parseInt(form.patientId) : 0}
                visitId={visitId ?? undefined}
                onResult={handleVoiceResult}
                onError={(msg) => toast.error(msg)}
                language="ar"
              />
            </CardContent>
          </Card>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 mt-4">
        {/* ── Visit Details ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Visit Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="visitDate">Visit Date *</Label>
                <Input
                  id="visitDate"
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
                  required
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitLocation">Location *</Label>
                <Select
                  value={form.visitLocation}
                  onValueChange={(v) => setForm((f) => ({ ...f, visitLocation: v as VisitLocation }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Prime Hospital">Prime Hospital</SelectItem>
                    <SelectItem value="Mazher Center">Mazher Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitType">Visit Type</Label>
                <Select
                  value={form.visitType}
                  onValueChange={(v) => setForm((f) => ({ ...f, visitType: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_patient">New Patient</SelectItem>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="procedure">Procedure</SelectItem>
                    <SelectItem value="prenatal">Prenatal</SelectItem>
                    <SelectItem value="postnatal">Postnatal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reasonForVisit">Reason for Visit</Label>
                <div className="relative">
                  <Input
                    id="reasonForVisit"
                    value={form.reasonForVisit}
                    onChange={(e) => setForm((f) => ({ ...f, reasonForVisit: e.target.value }))}
                    placeholder="Brief reason"
                    className="rounded-lg pr-9"
                  />
                  <FieldMicButton
                    placeholder="Dictate reason for visit"
                    onTranscript={(t) => setForm((f) => ({ ...f, reasonForVisit: t.trim() }))}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Clinical Assessment ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Clinical Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "examination",        label: "Examination Findings",  placeholder: "Physical examination findings…",  rows: 3 },
              { key: "ultrasoundFindings", label: "Ultrasound Findings",   placeholder: "US findings…",                    rows: 2 },
              { key: "labsImaging",        label: "Labs / Imaging",        placeholder: "Results…",                        rows: 2 },
              { key: "pendingResults",     label: "Pending Results",       placeholder: "Awaiting…",                       rows: 2 },
              { key: "diagnosis",          label: "Diagnosis",             placeholder: "Clinical diagnosis…",             rows: 2 },
            ].map(({ key, label, placeholder, rows }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <div className="relative">
                  <Textarea
                    id={key}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={rows}
                    className="rounded-lg resize-none pr-9"
                  />
                  <FieldMicButton
                    top
                    placeholder={`Dictate ${label.toLowerCase()}`}
                    onTranscript={(t) =>
                      setForm((f) => ({
                        ...f,
                        [key]: f[key as keyof typeof f]
                          ? `${f[key as keyof typeof f]}\n${t}`
                          : t,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Management & Follow-up ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Management &amp; Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "managementPlan", label: "Management Plan",  placeholder: "Treatment and management plan…",  rows: 3, isTextarea: true },
              { key: "medications",    label: "Medications",      placeholder: "Prescribed medications…",         rows: 2, isTextarea: true },
              { key: "advice",         label: "Advice",           placeholder: "Patient advice…",                 rows: 2, isTextarea: true },
            ].map(({ key, label, placeholder, rows }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <div className="relative">
                  <Textarea
                    id={key}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={rows}
                    className="rounded-lg resize-none pr-9"
                  />
                  <FieldMicButton
                    top
                    placeholder={`Dictate ${label.toLowerCase()}`}
                    onTranscript={(t) =>
                      setForm((f) => ({
                        ...f,
                        [key]: f[key as keyof typeof f]
                          ? `${f[key as keyof typeof f]}\n${t}`
                          : t,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="followUpPlan">Follow-up Plan</Label>
              <div className="relative">
                <Input
                  id="followUpPlan"
                  value={form.followUpPlan}
                  onChange={(e) => setForm((f) => ({ ...f, followUpPlan: e.target.value }))}
                  placeholder="e.g., Return in 2 weeks for CBC"
                  className="rounded-lg pr-9"
                />
                <FieldMicButton
                  placeholder="Dictate follow-up plan"
                  onTranscript={(t) => setForm((f) => ({ ...f, followUpPlan: t.trim() }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            <Save className="h-4 w-4" />
            {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Create Visit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
