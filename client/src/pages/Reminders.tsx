import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, Bell, Calendar, CalendarDays, Check, ChevronDown, ChevronUp, ExternalLink, Plus, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";

type ReminderStatus = "pending" | "done" | "overdue" | "cancelled" | "postponed";
type ReminderType =
  | "call_patient"
  | "inform_result"
  | "check_lab"
  | "check_imaging"
  | "follow_up"
  | "medication_review"
  | "procedure_booking"
  | "custom";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  done: "Done",
  overdue: "Overdue",
  cancelled: "Cancelled",
  postponed: "Postponed",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "status-pending",
  done: "status-done",
  overdue: "status-overdue",
  cancelled: "status-cancelled",
  postponed: "status-postponed",
};

export default function Reminders() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newForm, setNewForm] = useState({
    patientId: "",
    title: "",
    description: "",
    dueDate: "",
    reminderType: "follow_up" as ReminderType,
    notifyUserIds: [] as number[],
  });

  const { data: staffList } = trpc.admin.listUsers.useQuery(undefined, {
    select: (users) => users.filter((u) => u.isActive && (u as { telegramChatId?: string }).telegramChatId),
  });
  const [patientSearch, setPatientSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const { data: reminders, isLoading } = trpc.reminders.listAll.useQuery({ limit: 200 });
  const { data: patientList } = trpc.patients.list.useQuery(
    { limit: 500, offset: 0 },
    { enabled: showNewDialog }
  );

  const filteredPatients = useMemo(() => {
    if (!patientList) return [];
    const q = patientSearch.toLowerCase().trim();
    if (!q) return patientList.slice(0, 20);
    return patientList
      .filter((p) =>
        p.name?.toLowerCase().includes(q) || p.phone?.includes(q)
      )
      .slice(0, 10);
  }, [patientList, patientSearch]);

  const selectedPatient = useMemo(
    () => patientList?.find((p) => String(p.id) === newForm.patientId),
    [patientList, newForm.patientId]
  );
  const utils = trpc.useUtils();

  const createReminder = trpc.reminders.create.useMutation({
    onSuccess: () => {
      toast.success("Reminder created");
      utils.reminders.listAll.invalidate();
      setShowNewDialog(false);
      setNewForm({ patientId: "", title: "", description: "", dueDate: "", reminderType: "follow_up", notifyUserIds: [] });
    },
    onError: (err) => toast.error(err.message),
  });

  const sendToCalendar = trpc.reminders.sendToCalendar.useMutation({
    onSuccess: () => {
      toast.success("Reminder approved — Calendar and Telegram alert sent");
      utils.reminders.listAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const completeReminder = trpc.reminders.complete.useMutation({
    onSuccess: () => {
      utils.reminders.listAll.invalidate();
      utils.reminders.getOverdue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelReminder = trpc.reminders.cancel.useMutation({
    onSuccess: () => {
      utils.reminders.listAll.invalidate();
      utils.reminders.getOverdue.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered =
    filterStatus === "all"
      ? reminders ?? []
      : (reminders ?? []).filter((r) => r.status === filterStatus);

  const overdueCount = (reminders ?? []).filter((r) => r.status === "overdue").length;
  const pendingCount = (reminders ?? []).filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Reminders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {overdueCount > 0 && (
              <span className="text-destructive font-medium">{overdueCount} overdue · </span>
            )}
            {pendingCount} pending
          </p>
        </div>
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              New Reminder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Reminder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Patient *</Label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{selectedPatient.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedPatient.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setNewForm((f) => ({ ...f, patientId: "" })); setPatientSearch(""); }}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Search by name or phone number…"
                      className="rounded-lg"
                      autoComplete="off"
                    />
                    {patientSearch.length > 0 && filteredPatients.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-md max-h-48 overflow-y-auto">
                        {filteredPatients.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              setNewForm((f) => ({ ...f, patientId: String(p.id) }));
                              setPatientSearch("");
                            }}
                          >
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.phone}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {patientSearch.length > 0 && filteredPatients.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-md px-3 py-2">
                        <p className="text-sm text-muted-foreground">No patients found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  value={newForm.title}
                  onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Follow-up CBC results"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={newForm.reminderType}
                  onValueChange={(v) => setNewForm((f) => ({ ...f, reminderType: v as ReminderType }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Follow-up</SelectItem>
                    <SelectItem value="call_patient">Call Patient</SelectItem>
                    <SelectItem value="inform_result">Inform Result</SelectItem>
                    <SelectItem value="check_lab">Check Lab</SelectItem>
                    <SelectItem value="check_imaging">Check Imaging</SelectItem>
                    <SelectItem value="medication_review">Medication Review</SelectItem>
                    <SelectItem value="procedure_booking">Procedure Booking</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date *</Label>
                <Input
                  type="date"
                  value={newForm.dueDate}
                  onChange={(e) => setNewForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="rounded-lg"
                />
              </div>
              {/* Notify specific nurses */}
              {staffList && staffList.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    Notify Staff via Telegram (optional)
                  </Label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-lg p-2 bg-muted/20">
                    {staffList.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={newForm.notifyUserIds.includes(s.id)}
                          onChange={(e) => {
                            setNewForm((f) => ({
                              ...f,
                              notifyUserIds: e.target.checked
                                ? [...f.notifyUserIds, s.id]
                                : f.notifyUserIds.filter((id) => id !== s.id),
                            }));
                          }}
                          className="rounded border-border"
                        />
                        <span className="text-sm">{s.name}</span>
                        <span className="text-xs text-muted-foreground">({s.role})</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Selected staff receive a direct Telegram message when this reminder is created.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  value={newForm.description}
                  onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Additional details…"
                  rows={2}
                  className="rounded-lg resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!newForm.title || !newForm.dueDate || !newForm.patientId) {
                      toast.error("Select a patient, add a title, and set a due date");
                      return;
                    }
                    createReminder.mutate({
                      patientId: parseInt(newForm.patientId),
                      title: newForm.title,
                      notes: newForm.description || undefined,
                      dueDate: newForm.dueDate,
                      reminderType: newForm.reminderType,
                      notifyUserIds: newForm.notifyUserIds.length > 0 ? newForm.notifyUserIds : undefined,
                    });
                  }}
                  disabled={createReminder.isPending}
                >
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "overdue", "pending", "postponed", "done", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
            {s === "overdue" && overdueCount > 0 && (
              <span className="ml-1.5 bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 text-xs">
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No reminders found</p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {filtered.map((reminder) => (
            <Card
              key={reminder.id}
              className={`border shadow-sm cursor-pointer transition-colors ${
                reminder.status === "overdue" ? "border-destructive/30" : ""
              }`}
              onClick={() => setExpandedId((prev) => prev === reminder.id ? null : reminder.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 p-1.5 rounded-lg ${
                      reminder.status === "overdue"
                        ? "bg-destructive/10"
                        : reminder.status === "done"
                        ? "bg-success/10"
                        : "bg-warning/10"
                    }`}
                  >
                    {reminder.status === "overdue" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : reminder.status === "done" ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Bell className="h-4 w-4 text-warning" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium truncate">{reminder.title}</p>
                        {expandedId === reminder.id
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      </div>
                      <Badge className={`text-xs shrink-0 ${STATUS_CLASSES[reminder.status] ?? ""}`}>
                        {STATUS_LABELS[reminder.status] ?? reminder.status}
                      </Badge>
                    </div>
                    {reminder.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{reminder.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Due: {reminder.dueDate}
                      </span>
                      {reminder.patientId && (() => {
                        const pt = patientList?.find((p) => p.id === reminder.patientId);
                        return (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLocation(`/patients/${reminder.patientId}`); }}
                            className="text-xs text-primary hover:underline flex items-center gap-0.5"
                          >
                            {pt ? pt.name : `Patient #${reminder.patientId}`}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground capitalize">
                        {reminder.reminderType?.replace(/_/g, " ")}
                      </span>
                      {reminder.requiresDoctorReview && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                          ⏳ Needs Calendar Approval
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0 items-end">
                    {reminder.requiresDoctorReview && reminder.status !== "done" && reminder.status !== "cancelled" && (
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs px-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border-0"
                        variant="outline"
                        onClick={() => sendToCalendar.mutate({ id: reminder.id })}
                        disabled={sendToCalendar.isPending}
                        title="Approve — send to Google Calendar + Telegram"
                      >
                        <CalendarDays className="h-3 w-3" />
                        Approve
                      </Button>
                    )}
                    {reminder.status !== "done" && reminder.status !== "cancelled" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-success hover:text-success hover:bg-success/10"
                          onClick={() => completeReminder.mutate({ id: reminder.id })}
                          title="Mark as done"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => cancelReminder.mutate({ id: reminder.id })}
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                  {/* Expanded detail section */}
                  {expandedId === reminder.id && (
                    <div
                      className="mt-3 pt-3 border-t border-border/50 space-y-1.5 text-xs text-muted-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {reminder.sourceText && (
                        <p><span className="font-medium text-foreground/70">Source:</span> {reminder.sourceText}</p>
                      )}
                      {reminder.completionNote && (
                        <p><span className="font-medium text-foreground/70">Completion note:</span> {reminder.completionNote}</p>
                      )}
                      {reminder.completedAt && (
                        <p><span className="font-medium text-foreground/70">Completed at:</span> {new Date(reminder.completedAt).toLocaleString("en-AE", { timeZone: "Asia/Dubai" })}</p>
                      )}
                      {reminder.patientId && (
                        <button
                          type="button"
                          onClick={() => setLocation(`/patients/${reminder.patientId}`)}
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          Open patient profile <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
