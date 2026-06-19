import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Save, Mic, MicOff, Loader2 } from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { AIAssistPanel, type PatientExtractedData } from "@/components/AIAssistPanel";

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
      title={state === "idle" ? (placeholder ?? "Dictate this field") : state === "recording" ? "Tap to stop recording" : "Processing…"}
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

// ─── Main PatientForm ─────────────────────────────────────────────────────────

export default function PatientForm() {
  const { id } = useParams<{ id: string }>();
  const patientId = id ? parseInt(id) : null;
  const isEdit = !!patientId;
  const [, setLocation] = useLocation();

  const { data: existing, isLoading } = trpc.patients.getById.useQuery(
    { id: patientId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState({
    name: "",
    phone: "",
    age: "",
    dateOfBirth: "",
    bloodType: "",
    visitLocation: "",
    maritalStatus: "",
    pregnancyStatus: "",
    gravida: "",
    para: "",
    abortions: "",
    allergies: "",
    chronicConditions: "",
    currentMedications: "",
    surgicalHistory: "",
    familyHistory: "",
    importantNotes: "",
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? "",
        phone: existing.phone ?? "",
        age: existing.age?.toString() ?? "",
        dateOfBirth: "",
        bloodType: "",
        visitLocation: existing.visitLocation ?? "",
        maritalStatus: existing.maritalStatus ?? "",
        pregnancyStatus: existing.pregnancyStatus ?? "",
        gravida: existing.gravida?.toString() ?? "",
        para: existing.para?.toString() ?? "",
        abortions: "",
        allergies: existing.allergies ?? "",
        chronicConditions: "",
        currentMedications: "",
        surgicalHistory: "",
        familyHistory: "",
        importantNotes: existing.importantNotes ?? "",
      });
    }
  }, [existing]);

  const utils = trpc.useUtils();

  const createPatient = trpc.patients.create.useMutation({
    onSuccess: (data) => {
      toast.success("Patient created successfully");
      utils.patients.list.invalidate();
      setLocation(`/patients/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      toast.success("Patient updated successfully");
      utils.patients.getById.invalidate({ id: patientId! });
      setLocation(`/patients/${patientId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── AI auto-fill handler ─────────────────────────────────────────────────

  const handleAiApply = useCallback((data: PatientExtractedData) => {
    setForm((f) => ({
      ...f,
      name: data.name ? String(data.name) : f.name,
      phone: data.phone ? String(data.phone) : f.phone,
      age: data.age != null ? String(data.age) : f.age,
      dateOfBirth: data.dateOfBirth ? String(data.dateOfBirth) : f.dateOfBirth,
      bloodType: data.bloodType ? String(data.bloodType) : f.bloodType,
      maritalStatus: data.maritalStatus ?? f.maritalStatus,
      pregnancyStatus: data.pregnancyStatus ?? f.pregnancyStatus,
      gravida: data.gravida != null ? String(data.gravida) : f.gravida,
      para: data.para != null ? String(data.para) : f.para,
      abortions: data.abortions != null ? String(data.abortions) : f.abortions,
      allergies: data.allergies ? String(data.allergies) : f.allergies,
      chronicConditions: data.chronicConditions ? String(data.chronicConditions) : f.chronicConditions,
      currentMedications: data.currentMedications ? String(data.currentMedications) : f.currentMedications,
      surgicalHistory: data.surgicalHistory ? String(data.surgicalHistory) : f.surgicalHistory,
      familyHistory: data.familyHistory ? String(data.familyHistory) : f.familyHistory,
      importantNotes: data.notes ? String(data.notes) : f.importantNotes,
    }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      age: form.age ? parseInt(form.age) : undefined,
      visitLocation: (form.visitLocation || undefined) as "Prime Hospital" | "Mazher Center" | undefined,
      maritalStatus: (form.maritalStatus || undefined) as "single" | "married" | "divorced" | "widowed" | undefined,
      pregnancyStatus: form.pregnancyStatus || undefined,
      gravida: form.gravida ? parseInt(form.gravida) : undefined,
      para: form.para ? parseInt(form.para) : undefined,
      allergies: form.allergies || undefined,
      importantNotes: form.importantNotes || undefined,
    };
    if (isEdit) {
      updatePatient.mutate({ id: patientId!, data: payload });
    } else {
      createPatient.mutate(payload);
    }
  };

  const isSubmitting = createPatient.isPending || updatePatient.isPending;

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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(isEdit ? `/patients/${patientId}` : "/patients")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-semibold">
            {isEdit ? "Edit Patient" : "New Patient"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Use AI Smart Input to auto-fill from voice, screenshot, or pasted text — or type directly in any field
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── AI Smart Input Panel ── */}
        <AIAssistPanel mode="patient" onApply={handleAiApply} />

        {/* ── Basic Information ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Full Name *</Label>
                <div className="relative">
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Patient full name — or use AI Smart Input above"
                    required
                    className="rounded-lg pr-9"
                  />
                  <FieldMicButton
                    placeholder="Dictate patient name"
                    onTranscript={(t) => setForm((f) => ({ ...f, name: t.trim() }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number *</Label>
                <div className="relative">
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+20 1XX XXX XXXX"
                    required
                    className="rounded-lg pr-9"
                  />
                  <FieldMicButton
                    placeholder="Dictate phone number"
                    onTranscript={(t) => setForm((f) => ({ ...f, phone: t.replace(/\s/g, "") }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="age">Age</Label>
                <div className="relative">
                  <Input
                    id="age"
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                    placeholder="Years"
                    className="rounded-lg pr-9"
                  />
                  <FieldMicButton
                    placeholder="Dictate age"
                    onTranscript={(t) => {
                      const n = parseInt(t.replace(/\D/g, ""));
                      if (!isNaN(n)) setForm((f) => ({ ...f, age: String(n) }));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bloodType">Blood Type</Label>
                <div className="relative">
                  <Input
                    id="bloodType"
                    value={form.bloodType}
                    onChange={(e) => setForm((f) => ({ ...f, bloodType: e.target.value }))}
                    placeholder="e.g. A+, O−"
                    className="rounded-lg pr-9"
                  />
                  <FieldMicButton
                    placeholder="Dictate blood type"
                    onTranscript={(t) => setForm((f) => ({ ...f, bloodType: t.trim() }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="visitLocation">Default Location</Label>
                <Select
                  value={form.visitLocation}
                  onValueChange={(v) => setForm((f) => ({ ...f, visitLocation: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Prime Hospital">Prime Hospital</SelectItem>
                    <SelectItem value="Mazher Center">Mazher Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="maritalStatus">Marital Status</Label>
                <Select
                  value={form.maritalStatus}
                  onValueChange={(v) => setForm((f) => ({ ...f, maritalStatus: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Obstetric History ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Obstetric History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 space-y-1.5">
                <Label htmlFor="pregnancyStatus">Pregnancy Status</Label>
                <Select
                  value={form.pregnancyStatus}
                  onValueChange={(v) => setForm((f) => ({ ...f, pregnancyStatus: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_pregnant">Not Pregnant</SelectItem>
                    <SelectItem value="pregnant">Pregnant</SelectItem>
                    <SelectItem value="postpartum">Postpartum</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {[
                { key: "gravida", label: "Gravida (G)" },
                { key: "para", label: "Para (P)" },
                { key: "abortions", label: "Abortions (A)" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="relative">
                    <Input
                      id={key}
                      type="number"
                      min="0"
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder="0"
                      className="rounded-lg pr-9"
                    />
                    <FieldMicButton
                      placeholder={`Dictate ${label}`}
                      onTranscript={(t) => {
                        const n = parseInt(t.replace(/\D/g, ""));
                        if (!isNaN(n)) setForm((f) => ({ ...f, [key]: String(n) }));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Medical History ── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Medical History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "allergies", label: "Allergies", placeholder: "Known drug or food allergies…" },
              { key: "chronicConditions", label: "Chronic Conditions", placeholder: "Diabetes, hypertension, thyroid disorders…" },
              { key: "currentMedications", label: "Current Medications", placeholder: "Ongoing medications and dosages…" },
              { key: "surgicalHistory", label: "Surgical History", placeholder: "Previous operations and procedures…" },
              { key: "familyHistory", label: "Family History", placeholder: "Relevant family medical history…" },
              { key: "importantNotes", label: "Important Notes", placeholder: "Critical information to display prominently…" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <div className="relative">
                  <Textarea
                    id={key}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={2}
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

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation(isEdit ? `/patients/${patientId}` : "/patients")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            <Save className="h-4 w-4" />
            {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Create Patient"}
          </Button>
        </div>
      </form>
    </div>
  );
}
