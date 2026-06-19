import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";

export default function ExportData() {
  const [includePatients, setIncludePatients] = useState(true);
  const [includeVisits, setIncludeVisits] = useState(true);

  const { data: exports, isLoading } = trpc.exports.listExports.useQuery();
  const utils = trpc.useUtils();

  const generateExcel = trpc.exports.generateExcel.useMutation({
    onSuccess: (data) => {
      toast.success(`Export ready: ${data.patientCount} patients, ${data.visitCount} visits`);
      utils.exports.listExports.invalidate();
      // Auto-open download
      window.open(data.fileUrl, "_blank");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          Export Data
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Export patient and visit records as a spreadsheet file
        </p>
      </div>

      {/* Export Options */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Export Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="includePatients"
                checked={includePatients}
                onCheckedChange={(v) => setIncludePatients(!!v)}
              />
              <Label htmlFor="includePatients" className="cursor-pointer">
                Include Patient Records
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="includeVisits"
                checked={includeVisits}
                onCheckedChange={(v) => setIncludeVisits(!!v)}
              />
              <Label htmlFor="includeVisits" className="cursor-pointer">
                Include Visit Records
              </Label>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-3">
              Exports are generated as tab-separated values (.tsv) compatible with Excel, Google
              Sheets, and all major spreadsheet applications.
            </p>
            <Button
              onClick={() =>
                generateExcel.mutate({ includePatients, includeVisits })
              }
              disabled={generateExcel.isPending || (!includePatients && !includeVisits)}
              className="gap-2"
            >
              {generateExcel.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {generateExcel.isPending ? "Generating…" : "Generate & Download Export"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Export History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : !exports || exports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No exports generated yet
            </p>
          ) : (
            <div className="space-y-2">
              {exports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      Export #{exp.id} — {exp.exportType}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(exp.createdAt).toLocaleString()}
                      </span>
                      {exp.patientCount != null && (
                        <span className="text-xs text-muted-foreground">
                          {exp.patientCount} patients · {exp.visitCount ?? 0} visits
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      className={`text-xs ${
                        exp.status === "completed"
                          ? "status-done"
                          : exp.status === "failed"
                          ? "status-overdue"
                          : "status-pending"
                      }`}
                    >
                      {exp.status}
                    </Badge>
                    {exp.fileUrl && (
                      <a href={exp.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
