import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BrainCircuit, Check, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";

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
  risk_flags?: string[];
  unclear_words_or_phrases?: string[];
  missing_documentation_items?: string[];
};

export default function AiReview() {
  const { data: pending, isLoading, refetch } = trpc.ai.listPending.useQuery();
  const utils = trpc.useUtils();
  const [activeId, setActiveId] = useState<number | null>(null);

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
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {!pending || pending.length === 0 ? (
        <div className="text-center py-20">
          <BrainCircuit className="h-14 w-14 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">No extractions pending review</p>
          <p className="text-sm text-muted-foreground mt-1">
            AI extractions appear here after processing voice notes or documents.
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
                      Extraction #{extraction.id} — {extraction.sourceType}
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
                    Visit #{extraction.visitId} · Patient #{extraction.patientId}
                  </p>
                </CardHeader>

                {activeId === extraction.id && (
                  <CardContent className="pt-0 space-y-4">
                    {/* Transcript */}
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
                      <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                        <p className="text-xs font-semibold text-warning-foreground uppercase tracking-wide mb-2">
                          Unclear Words
                        </p>
                        <p className="text-xs">{unclearWords.join(", ")}</p>
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!extraction.visitId) {
                            toast.error("No visit associated with this extraction");
                            return;
                          }
                          approveExtraction.mutate({
                            extractionId: extraction.id,
                            visitId: extraction.visitId,
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
                            approvedReminders: [],
                          });
                        }}
                        disabled={approveExtraction.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve & Apply
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
