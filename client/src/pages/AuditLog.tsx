import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ClipboardList, RefreshCw, Shield } from "lucide-react";
import { useLocation } from "wouter";

const ACTION_COLORS: Record<string, string> = {
  create_patient: "status-done",
  update_patient: "status-pending",
  delete_patient: "status-overdue",
  create_visit: "status-done",
  update_visit: "status-pending",
  delete_visit: "status-overdue",
  finalize_visit: "status-done",
  create_reminder: "status-pending",
  complete_reminder: "status-done",
  cancel_reminder: "status-cancelled",
  approve_ai_extraction: "status-done",
  manage_users: "status-pending",
  view_audit_log: "bg-muted text-muted-foreground",
};

export default function AuditLog() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: events, isLoading, refetch } = trpc.admin.listAuditEvents.useQuery({
    limit: 200,
    offset: 0,
  });

  if (user?.role !== "admin" && user?.role !== "doctor") {
    return (
      <div className="p-6 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Access restricted</p>
        <Button variant="ghost" onClick={() => setLocation("/")} className="mt-4">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete record of all system actions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !events || events.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No audit events recorded yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map((event) => (
            <Card key={event.id} className="border shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={`text-xs ${
                          ACTION_COLORS[event.action] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {event.action.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {event.entityType} #{event.entityId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        User #{event.userId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {event.metadata != null && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                        {JSON.stringify(event.metadata as Record<string, unknown>)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
