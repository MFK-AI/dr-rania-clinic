import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import VoiceRecorder, { type VoiceRecorderResult } from "@/components/VoiceRecorder";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BrainCircuit, Bell, Check, ChevronRight, RefreshCw, Mic } from "lucide-react";
import { useState, useMemo } from "react";

type ExtractedData = {
  reason_for_visit?: string | null;
  diagnosis?: string | null;
  examination?: string | null;
  ultrasound_findings?: string | null;
  labs_imaging?: string | null;
  pending_results?: string | null;
  management_plan?: string | null;
  medications?: string | null;
  advice?: string | null;
  follow_up_plan?: string | null;
  extraction_status?: string | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  risk_flags?: string[];
  unclear_words_or_phrases?: string[];
  missing_documentation_items?: string[];
  reminders?: Array<{
    // normalized shape (from extractRemindersFromVisit)
    title?: string;
    reminderType?: string;
    dueDate?: string;
    dueTime?: string;
    notes?: string;
    priority?: string;
    // raw shape from voice/screenshot extraction (AiReminderSuggestion)
    reminder_title?: string;
    reminder_type?: string;
    due_date?: string;
    due_time?: string;
    action_required?: string;
    sensitivity_level?: string;
  }>;
};

export default function AiReview() {
  const { data: pending, isLoading, refetch } = trpc.ai.listPending.useQuery();
  const utils = trpc.useUtils();
  const [activeId, setActiveId] = useState<number | null>(null);
  // Track which AI-suggested reminders the doctor has checked for each extraction
  const [approvedReminderIds, setApprovedReminderIds] = useState<Record<number, Set<number>>>({});
  // Doctor can override the patient link for any extraction before approving
  const [patientOverrides, setPatientOverrides] = useState<Record<number, number>>({});

  // ── Voice recorder state ─────────────────────────────────────────────────
  const [showRecorder, setShowRecorder] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  // Always load patients (needed for linking unlinked extractions)
  const { data: patientList } = trpc.patients.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: true }
  );

  const patientOptions = useMemo(
    () => patientList ?? [],
    [patientList]
  );

  const handleVoiceResult = (result: VoiceRecorderResult) => {
    toast.success("Voice note processed — extraction added to queue below");
    setShowRecorder(false);
    setSelectedPatientId("");
    utils.ai.listPending.invalidate();
  };

  // ── Approve mutation ─────────────────────────────────────────────────────
  const approveExtraction = trpc.ai.approve.useMutation({
    onSuccess: () => {
      toast.success("AI extraction approved and applied to visit");
      utils.ai.listPending.invalidate();
      setActiveId(null);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            AI Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending?.length ?? 0} extraction{pending?.length !== 1 ? "s" : ""} awaiting review
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRecorder((v) => !v)}
            className="gap-2"
          >
            <Mic className="h-3.5 w-3.5" />
            {showRecorder ? "Hide Recorder" : "New Voice Note"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Voice Recorder Panel ────────────────────────────────────────────── */}
      {showRecorder && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Record a Voice Note
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Dictate clinical notes in Arabic or English. AI will transcribe and extract
              structured data for your review.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Patient selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Patient (optional)</Label>
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a patient…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No patient selected</SelectItem>
                  {patientOptions.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} {p.phone ? `· ${p.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recorder — only render when a valid patientId is chosen OR user skips */}
            <VoiceRecorder
              patientId={
                selectedPatientId && selectedPatientId !== "none"
                  ? Number(selectedPatientId)
                  : 0
              }
              onResult={handleVoiceResult}
              onError={(msg) => toast.error(msg)}
              language="ar"
            />

            <p className="text-xs text-muted-foreground">
              Supported languages: Arabic, English, mixed Arabic-English. Max recording: 15 MB (~30 min).
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Pending Extractions List ────────────────────────────────────────── */}
      {!pending || pending.length === 0 ? (
        <div className="text-center py-20">
          <BrainCircuit className="h-14 w-14 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">No extractions pending review</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use the <strong>New Voice Note</strong> button above to record clinical notes, or upload
            a document from the Files page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((extraction) => {
            const data = extraction.extractedData as ExtractedData | null;
            const riskFlags = extraction.riskFlags as string[] | null;
            const unclearWords = extraction.unclearWords as string[] | null;

            return (
              <Card
                key={extraction.id}
                className={`border shadow-sm cursor-pointer transition-all hover:border-primary/30 ${
                  activeId === extraction.id ? "border-primary/50 shadow-md" : ""
                }`}
                onClick={() => setActiveId(activeId === extraction.id ? null : extraction.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      Extraction #{extraction.id} —{" "}
                      <span className="capitalize">{extraction.sourceType}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-xs ${
                          extraction.extractionStatus === "Clear"
                            ? "status-done"
                            : extraction.extractionStatus === "Unclear"
                            ? "status-overdue"
                            : "status-pending"
                        }`}
                      >
                        {extraction.extractionStatus ?? "Needs Review"}
                      </Badge>
                      <ChevronRight
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          activeId === extraction.id ? "rotate-90" : ""
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {extraction.visitId ? `Visit #${extraction.visitId} · ` : ""}
                    {extraction.patientId
                      ? `Patient #${extraction.patientId} — ${patientList?.find((p) => p.id === extraction.patientId)?.name ?? "linked"}`
                      : patientOverrides[extraction.id]
                      ? `Patient linked: ${patientList?.find((p) => p.id === patientOverrides[extraction.id])?.name ?? `#${patientOverrides[extraction.id]}`}`
                      : "No patient linked"}
                  </p>
                </CardHeader>

                {activeId === extraction.id && (
                  <CardContent className="pt-0 space-y-4">

                    {/* Patient Link — required before approving */}
                    {!extraction.patientId && (
                      <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          ⚠️ No Patient Linked — select before approving
                        </p>
                        <p className="text-xs text-amber-700/80 mb-3">
                          This extraction has no patient linked.
                          {data?.patient_name && ` AI detected: "${data.patient_name}".`}
                          {data?.patient_phone && ` Phone: ${data.patient_phone}.`}
                          {" "}Select the correct patient to link reminders properly.
                        </p>
                        <Select
                          value={patientOverrides[extraction.id] ? String(patientOverrides[extraction.id]) : ""}
                          onValueChange={(v) => {
                            if (v) setPatientOverrides((prev) => ({ ...prev, [extraction.id]: Number(v) }));
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm bg-white">
                            <SelectValue placeholder="Select patient to link…" />
                          </SelectTrigger>
                          <SelectContent>
                            {patientList?.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name}{p.phone ? ` · ${p.phone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {extraction.transcript && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Transcript
                        </p>
                        <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-6">
                          {extraction.transcript}
                        </p>
                      </div>
                    )}

                    {/* Extracted Data */}
                    {data && (
                      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Extracted Data
                        </p>
                        {data.reason_for_visit && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Reason for Visit</p>
                            <p className="text-sm">{data.reason_for_visit}</p>
                          </div>
                        )}
                        {data.diagnosis && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Diagnosis</p>
                            <p className="text-sm">{data.diagnosis}</p>
                          </div>
                        )}
                        {data.management_plan && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Management Plan</p>
                            <p className="text-sm">{data.management_plan}</p>
                          </div>
                        )}
                        {data.medications && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Medications</p>
                            <p className="text-sm">{data.medications}</p>
                          </div>
                        )}
                        {data.follow_up_plan && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Follow-up Plan</p>
                            <p className="text-sm">{data.follow_up_plan}</p>
                          </div>
                        )}
                        {data.advice && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Advice</p>
                            <p className="text-sm">{data.advice}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Risk Flags */}
                    {riskFlags && riskFlags.length > 0 && (
                      <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                        <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">
                          Risk Flags
                        </p>
                        <ul className="space-y-1">
                          {riskFlags.map((flag, i) => (
                            <li key={i} className="text-xs text-destructive">
                              • {flag}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Unclear Words */}
                    {unclearWords && unclearWords.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                          Unclear Words / Phrases
                        </p>
                        <p className="text-xs text-amber-800">{unclearWords.join(", ")}</p>
                      </div>
                    )}

                    {/* AI-Suggested Reminders — doctor reviews and selects which to approve */}
                    {Array.isArray(data?.reminders) && data.reminders.length > 0 && (() => {
                      // Normalize both raw (AiReminderSuggestion) and processed reminder shapes
                      type NormalizedReminder = {
                        title: string; reminderType: string; dueDate: string;
                        dueTime?: string; notes?: string; priority?: string;
                      };
                      const normalized: NormalizedReminder[] = data.reminders.map((r) => ({
                        title: r.title ?? r.reminder_title ?? "Follow-up",
                        reminderType: r.reminderType ?? r.reminder_type ?? "custom",
                        dueDate: r.dueDate ?? r.due_date ?? new Date().toISOString().split("T")[0],
                        dueTime: r.dueTime ?? r.due_time ?? undefined,
                        notes: r.notes ?? r.action_required ?? undefined,
                        priority: r.priority ?? r.sensitivity_level ?? undefined,
                      }));
                      return normalized.length > 0 ? (
                        <div className="border border-primary/20 rounded-lg p-3 bg-primary/5">
                          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5" />
                            AI-Suggested Reminders — select to approve
                          </p>
                          <div className="space-y-2">
                            {normalized.map((r, i) => {
                              const isChecked = approvedReminderIds[extraction.id]?.has(i) ?? false;
                              return (
                                <label
                                  key={i}
                                  className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                    isChecked ? "bg-primary/10" : "hover:bg-muted/50"
                                  }`}
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      setApprovedReminderIds((prev) => {
                                        const set = new Set(prev[extraction.id] ?? []);
                                        if (checked) set.add(i); else set.delete(i);
                                        return { ...prev, [extraction.id]: set };
                                      });
                                    }}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-foreground">{r.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      📅 {r.dueDate}{r.dueTime ? ` at ${r.dueTime}` : ""} ·{" "}
                                      <span className="capitalize">{r.reminderType.replace(/_/g, " ")}</span>
                                      {r.priority && ` · ${r.priority} priority`}
                                    </p>
                                    {r.notes && (
                                      <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{r.notes}</p>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground/60 mt-2">
                            Checked reminders will be saved and synced to Google Calendar + Telegram on approval.
                          </p>
                        </div>
                      ) : null;
                    })()}

                    <div className="flex gap-2 justify-end pt-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Build approved reminders from checked items
                          // Note: visitId may be null for standalone voice notes --
                          // the server handles this gracefully (skips visit update,
                          // still creates reminders + Calendar + Telegram)
                          // Normalize both raw and processed reminder shapes (same as rendering above)
                          type NormR = { title: string; reminderType: string; dueDate: string; dueTime?: string; notes?: string };
                          const allReminders: NormR[] = Array.isArray(data?.reminders)
                            ? data.reminders.map((r: Record<string, string | undefined>) => ({
                                title: r.title ?? r.reminder_title ?? "Follow-up",
                                reminderType: r.reminderType ?? r.reminder_type ?? "custom",
                                dueDate: r.dueDate ?? r.due_date ?? new Date().toISOString().split("T")[0],
                                dueTime: r.dueTime ?? r.due_time ?? undefined,
                                notes: r.notes ?? r.action_required ?? undefined,
                              }))
                            : [];
                          const checkedIndices = approvedReminderIds[extraction.id] ?? new Set();
                          const validTypes = [
                            "call_patient", "inform_result", "check_lab", "check_imaging",
                            "follow_up", "medication_review", "procedure_booking", "custom",
                          ] as const;
                          type ReminderType = typeof validTypes[number];
                          const selectedReminders = allReminders
                            .filter((_, i) => checkedIndices.has(i))
                            .map((r) => ({
                              reminderType: (validTypes.includes(r.reminderType as ReminderType)
                                ? r.reminderType
                                : "custom") as ReminderType,
                              title: r.title,
                              dueDate: r.dueDate,
                              dueTime: r.dueTime,
                              notes: r.notes,
                              patientId: extraction.patientId ?? patientOverrides[extraction.id] ?? 0,
                            }));
                          approveExtraction.mutate({
                            extractionId: extraction.id,
                            visitId: extraction.visitId ?? undefined,
                            // Send the doctor-selected patient override explicitly
                            // so the server can persist it and use it reliably
                            // (React state resets on page reload; DB doesn't)
                            patientOverride: patientOverrides[extraction.id] ?? undefined,
                            finalData: {
                              reasonForVisit: data?.reason_for_visit ?? undefined,
                              diagnosis: data?.diagnosis ?? undefined,
                              examination: data?.examination ?? undefined,
                              ultrasoundFindings: data?.ultrasound_findings ?? undefined,
                              labsImaging: data?.labs_imaging ?? undefined,
                              pendingResults: data?.pending_results ?? undefined,
                              managementPlan: data?.management_plan ?? undefined,
                              medications: data?.medications ?? undefined,
                              advice: data?.advice ?? undefined,
                              followUpPlan: data?.follow_up_plan ?? undefined,
                            },
                            approvedReminders: selectedReminders,
                          });
                        }}
                        disabled={approveExtraction.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve &amp; Apply
                        {(approvedReminderIds[extraction.id]?.size ?? 0) > 0 && (
                          <span className="ml-1 bg-white/20 text-white rounded-full px-1.5 py-0.5 text-xs">
                            +{approvedReminderIds[extraction.id]?.size} reminder{approvedReminderIds[extraction.id]?.size !== 1 ? "s" : ""}
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
