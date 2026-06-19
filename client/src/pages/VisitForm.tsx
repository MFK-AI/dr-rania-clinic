import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import VoiceRecorder, { type VoiceRecorderResult } from "@/components/VoiceRecorder";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Save, Mic, MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";

type VisitLocation = "Prime Hospital" | "Mazher Center";

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

  const createVisit = trpc.visits.create.useMutation({
    onSuccess: (data) => {
      toast.success("Visit created successfully");
      utils.visits.listByPatient.invalidate({ patientId: parseInt(form.patientId) });
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

  // ── Auto-fill form from AI voice extraction ───────────────────────────────
  const handleVoiceResult = (result: VoiceRecorderResult) => {
    const d = result.extractedData as Record<string, string | undefined>;
    setForm((f) => ({
      ...f,
      reasonForVisit:    d["reason_for_visit"]   ?? f.reasonForVisit,
      diagnosis:         d["diagnosis"]           ?? f.diagnosis,
      examination:       d["examination"]         ?? f.examination,
      ultrasoundFindings:d["ultrasound_findings"] ?? f.ultrasoundFindings,
      labsImaging:       d["labs_imaging"]        ?? f.labsImaging,
      pendingResults:    d["pending_results"]     ?? f.pendingResults,
      managementPlan:    d["management_plan"]     ?? f.managementPlan,
      medications:       d["medications"]         ?? f.medications,
      advice:            d["advice"]              ?? f.advice,
      followUpPlan:      d["follow_up_plan"]      ?? f.followUpPlan,
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
        <h1 className="text-2xl font-display font-semibold">
          {isEdit ? "Edit Visit" : "New Visit"}
        </h1>
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
                Hide Voice Input
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                Dictate Notes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Voice Recorder Card ─────────────────────────────────────────────── */}
      {showVoice && (
        <div className="mb-5">
          <Card className="border-primary/40 shadow-md bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                Dictate Visit Notes
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Speak your clinical notes in Arabic or English. AI will transcribe and
                automatically fill in the form fields below. You can review and edit before saving.
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

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Visit Details ──────────────────────────────────────────────────── */}
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
                <Input
                  id="reasonForVisit"
                  value={form.reasonForVisit}
                  onChange={(e) => setForm((f) => ({ ...f, reasonForVisit: e.target.value }))}
                  placeholder="Brief reason"
                  className="rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Clinical Assessment ────────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Clinical Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="examination">Examination Findings</Label>
              <Textarea
                id="examination"
                value={form.examination}
                onChange={(e) => setForm((f) => ({ ...f, examination: e.target.value }))}
                placeholder="Physical examination findings…"
                rows={2}
                className="rounded-lg resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ultrasoundFindings">Ultrasound Findings</Label>
              <Textarea
                id="ultrasoundFindings"
                value={form.ultrasoundFindings}
                onChange={(e) => setForm((f) => ({ ...f, ultrasoundFindings: e.target.value }))}
                placeholder="US findings…"
                rows={2}
                className="rounded-lg resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="labsImaging">Labs / Imaging</Label>
                <Textarea
                  id="labsImaging"
                  value={form.labsImaging}
                  onChange={(e) => setForm((f) => ({ ...f, labsImaging: e.target.value }))}
                  placeholder="Results…"
                  rows={2}
                  className="rounded-lg resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pendingResults">Pending Results</Label>
                <Textarea
                  id="pendingResults"
                  value={form.pendingResults}
                  onChange={(e) => setForm((f) => ({ ...f, pendingResults: e.target.value }))}
                  placeholder="Awaiting…"
                  rows={2}
                  className="rounded-lg resize-none"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Textarea
                id="diagnosis"
                value={form.diagnosis}
                onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
                placeholder="Clinical diagnosis…"
                rows={2}
                className="rounded-lg resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Management & Follow-up ─────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Management &amp; Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="managementPlan">Management Plan</Label>
              <Textarea
                id="managementPlan"
                value={form.managementPlan}
                onChange={(e) => setForm((f) => ({ ...f, managementPlan: e.target.value }))}
                placeholder="Treatment and management plan…"
                rows={3}
                className="rounded-lg resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="medications">Medications</Label>
                <Textarea
                  id="medications"
                  value={form.medications}
                  onChange={(e) => setForm((f) => ({ ...f, medications: e.target.value }))}
                  placeholder="Prescribed medications…"
                  rows={2}
                  className="rounded-lg resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="advice">Advice</Label>
                <Textarea
                  id="advice"
                  value={form.advice}
                  onChange={(e) => setForm((f) => ({ ...f, advice: e.target.value }))}
                  placeholder="Patient advice…"
                  rows={2}
                  className="rounded-lg resize-none"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpPlan">Follow-up Plan</Label>
              <Input
                id="followUpPlan"
                value={form.followUpPlan}
                onChange={(e) => setForm((f) => ({ ...f, followUpPlan: e.target.value }))}
                placeholder="e.g., Return in 2 weeks for CBC"
                className="rounded-lg"
              />
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
