import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  BrainCircuit,
  Calendar,
  Edit,
  FileText,
  Trash2,
  User,
} from "lucide-react";
import { useLocation, useParams } from "wouter";

function Section({ title, value }: { title: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();
  const visitId = parseInt(id ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor" || user?.role === "admin";

  const { data, isLoading } = trpc.visits.getById.useQuery({ id: visitId });
  const utils = trpc.useUtils();

  const deleteVisit = trpc.visits.delete.useMutation({
    onSuccess: () => {
      toast.success("Visit deleted");
      if (data?.visit.patientId) {
        setLocation(`/patients/${data.visit.patientId}`);
      } else {
        setLocation("/patients");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeVisit = trpc.visits.finalize.useMutation({
    onSuccess: () => {
      toast.success("Visit finalized");
      utils.visits.getById.invalidate({ id: visitId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!data?.visit) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Visit not found.</p>
        <Button variant="ghost" onClick={() => setLocation("/patients")} className="mt-4">
          Back to Patients
        </Button>
      </div>
    );
  }

  const { visit, attachments } = data;

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    ai_pending: "status-pending",
    ai_review: "status-pending",
    final: "status-done",
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(`/patients/${visit.patientId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-semibold">
              Visit — {new Date(visit.visitDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h1>
            <Badge className={`text-xs ${statusColors[visit.status] ?? ""}`}>
              {visit.status === "ai_review" ? "AI Review" : visit.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {visit.visitLocation} · {visit.visitType ?? "Visit"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/visits/${visitId}/edit`)}
            className="gap-1.5"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          {visit.status !== "final" && isDoctor && (
            <Button
              size="sm"
              onClick={() => finalizeVisit.mutate({ id: visitId })}
              disabled={finalizeVisit.isPending}
              className="gap-1.5"
            >
              Finalize
            </Button>
          )}
          {isDoctor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Delete this visit?")) deleteVisit.mutate({ id: visitId });
              }}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Visit Info */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <User className="h-3.5 w-3.5" />
            Clinical Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Section title="Reason for Visit" value={visit.reasonForVisit} />
          <Section title="Examination" value={visit.examination} />
          <Section title="Ultrasound Findings" value={visit.ultrasoundFindings} />
          <Section title="Labs / Imaging" value={visit.labsImaging} />
          <Section title="Pending Results" value={visit.pendingResults} />
          <Section title="Diagnosis" value={visit.diagnosis} />
          <Section title="Management Plan" value={visit.managementPlan} />
          <Section title="Medications" value={visit.medications} />
          <Section title="Advice" value={visit.advice} />
          <Section title="Follow-up Plan" value={visit.followUpPlan} />
          {!visit.reasonForVisit && !visit.diagnosis && !visit.managementPlan && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No clinical notes recorded yet.{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => setLocation(`/visits/${visitId}/edit`)}
              >
                Add notes
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Extraction */}
      {visit.aiExtractionId && (
        <Card className="border shadow-sm border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
              <BrainCircuit className="h-4 w-4" />
              AI Extraction Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              AI has extracted structured data from this visit's notes.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/ai-review")}
              className="gap-2"
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              Review AI Extraction
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Attachments ({attachments.length})
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
