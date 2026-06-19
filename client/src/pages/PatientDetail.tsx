import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Edit,
  FileText,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { useLocation, useParams } from "wouter";

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const patientId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor" || user?.role === "admin";

  const { data: patient, isLoading } = trpc.patients.getById.useQuery({ id: patientId });
  const { data: visits } = trpc.visits.listByPatient.useQuery({ patientId });
  const { data: reminders } = trpc.reminders.listByPatient.useQuery({ patientId });
  const { data: attachments } = trpc.files.listByPatient.useQuery({ patientId });

  const utils = trpc.useUtils();
  const deletePatient = trpc.patients.delete.useMutation({
    onSuccess: () => {
      toast.success("Patient deleted successfully");
      setLocation("/patients");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Patient not found.</p>
        <Button variant="ghost" onClick={() => setLocation("/patients")} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  const pendingReminders = reminders?.filter((r) => r.status === "pending" || r.status === "overdue") ?? [];

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/patients")} className="mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-semibold">{patient.name}</h1>
            {patient.importantNotes && (
              <Badge variant="outline" className="text-destructive border-destructive/30 gap-1">
                <AlertTriangle className="h-3 w-3" />
                Important Notes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Patient ID: {patient.id}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/patients/${patientId}/edit`)}
            className="gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          {isDoctor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Delete this patient? This cannot be undone.")) {
                  deletePatient.mutate({ id: patientId });
                }
              }}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Patient Info Card */}
      <Card className="border shadow-sm">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoField icon={Phone} label="Phone" value={patient.phone} />
            <InfoField icon={User} label="Age" value={patient.age ? `${patient.age} years` : "—"} />
            <InfoField icon={MapPin} label="Location" value={patient.visitLocation ?? "—"} />
            <InfoField label="Marital Status" value={patient.maritalStatus ?? "—"} />
            <InfoField label="Pregnancy" value={patient.pregnancyStatus ?? "—"} />
            {(patient.gravida !== null || patient.para !== null) && (
              <InfoField
                label="G/P"
                value={`G${patient.gravida ?? "?"} P${patient.para ?? "?"}`}
              />
            )}
          </div>
          {patient.allergies && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-1">
                ⚠ Allergies
              </p>
              <p className="text-sm text-foreground">{patient.allergies}</p>
            </div>
          )}
          {patient.importantNotes && (
            <div className="mt-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
              <p className="text-xs font-semibold text-warning uppercase tracking-wide mb-1">
                Important Notes
              </p>
              <p className="text-sm text-foreground">{patient.importantNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Reminders Alert */}
      {pendingReminders.length > 0 && (
        <div className="p-4 rounded-xl bg-warning/5 border border-warning/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">
              {pendingReminders.length} pending reminder{pendingReminders.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingReminders.slice(0, 2).map((r) => r.title).join(", ")}
              {pendingReminders.length > 2 ? ` +${pendingReminders.length - 2} more` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/reminders")}
            className="ml-auto shrink-0"
          >
            View
          </Button>
        </div>
      )}

      {/* Visits Timeline */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Visit History ({visits?.length ?? 0})
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/visits/new?patientId=${patientId}`)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Visit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!visits || visits.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No visits recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visits.map((visit) => (
                <div
                  key={visit.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors border"
                  onClick={() => setLocation(`/visits/${visit.id}`)}
                >
                  <div className="text-center shrink-0 w-12">
                    <p className="text-xs font-semibold text-primary">
                      {new Date(visit.visitDate).toLocaleDateString("en-US", { month: "short" })}
                    </p>
                    <p className="text-lg font-display font-bold leading-none">
                      {new Date(visit.visitDate).getDate()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {visit.reasonForVisit ?? visit.visitType ?? "Visit"}
                    </p>
                    <p className="text-xs text-muted-foreground">{visit.visitLocation}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      visit.status === "final"
                        ? "status-done text-xs"
                        : visit.status === "ai_review"
                        ? "status-pending text-xs"
                        : "text-xs"
                    }
                  >
                    {visit.status === "ai_review" ? "AI Review" : visit.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Files ({attachments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((file) => (
                <a
                  key={file.id}
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs truncate">{file.fileName}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
