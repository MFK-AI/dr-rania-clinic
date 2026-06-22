import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  Calendar,
  Clock,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`card-hover cursor-pointer border-0 shadow-sm ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <p className="text-3xl font-display font-semibold text-foreground">
              {value}
            </p>
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.admin.getDashboardStats.useQuery();
  const { data: todaysVisits, isLoading: visitsLoading } = trpc.visits.getTodays.useQuery();
  const { data: overdueReminders, isLoading: remindersLoading } = trpc.reminders.getOverdue.useQuery();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Hero Header */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-lg"
        style={{
          backgroundImage: "url('/bg-hero.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          minHeight: "140px",
        }}
      >
        {/* Overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.16_0.04_210/0.92)] via-[oklch(0.16_0.04_210/0.75)] to-transparent" />
        <div className="relative z-10 flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Dr. Rania Mousa Clinic"
              className="h-16 w-16 rounded-full object-cover shadow-lg shrink-0 scale-110"
            />
            <div>
              <h1 className="text-2xl font-display font-semibold text-white">
                {greeting}, {user?.name?.split(" ")[0] ?? "Doctor"} 👋
              </h1>
              <p className="text-sm text-white/70 mt-1">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-xs text-white/50 mt-0.5">Dr. Rania Mousa Clinic — Gynecology & Obstetrics</p>
            </div>
          </div>
          <Button
            onClick={() => setLocation("/patients/new")}
            className="gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm"
          >
            <Plus className="h-4 w-4" />
            New Patient
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <StatCard
            icon={Calendar}
            label="Today's Visits"
            value={stats?.todayVisits ?? 0}
            color="bg-primary/10 text-primary"
            onClick={() => setLocation("/patients")}
          />
          <StatCard
            icon={TrendingUp}
            label="Visits This Week"
            value={stats?.visitsThisWeek ?? 0}
            color="bg-info/10 text-info"
          />
          <StatCard
            icon={Bell}
            label="Pending Reminders"
            value={stats?.pendingReminders ?? 0}
            color="bg-warning/10 text-warning"
            onClick={() => setLocation("/reminders")}
          />
          <StatCard
            icon={AlertTriangle}
            label="Overdue"
            value={stats?.overdueReminders ?? 0}
            color="bg-destructive/10 text-destructive"
            onClick={() => setLocation("/reminders")}
          />
        </div>
      )}

      {/* Secondary Stats */}
      {!statsLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          <StatCard
            icon={Users}
            label="New Patients (Week)"
            value={stats?.newPatientsThisWeek ?? 0}
            color="bg-primary text-white"
            onClick={() => setLocation("/patients")}
          />
          <StatCard
            icon={BrainCircuit}
            label="AI Reviews Pending"
            value={stats?.pendingAiReviews ?? 0}
            color="bg-accent text-accent-foreground"
            onClick={() => setLocation("/ai-review")}
          />
          <StatCard
            icon={Activity}
            label="Exports Generated"
            value={stats?.exportsGenerated ?? 0}
            color="bg-muted text-muted-foreground"
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Visits */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Today's Visits
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/patients")}
                className="text-xs text-muted-foreground"
              >
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {visitsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : todaysVisits?.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No visits scheduled today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaysVisits?.slice(0, 5).map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/visits/${visit.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Patient #{visit.patientId}</p>
                        <p className="text-xs text-muted-foreground">{visit.visitLocation}</p>
                      </div>
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

        {/* Overdue Reminders */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Overdue Reminders
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/reminders")}
                className="text-xs text-muted-foreground"
              >
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {remindersLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : overdueReminders?.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No overdue reminders</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueReminders?.slice(0, 5).map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => setLocation("/reminders")}
                  >
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {reminder.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="h-3 w-3 text-destructive" />
                        <p className="text-xs text-destructive">Due: {reminder.dueDate}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "New Patient", icon: Users, path: "/patients/new", color: "bg-primary/10 text-primary" },
              { label: "New Visit", icon: Calendar, path: "/visits/new", color: "bg-info/10 text-info" },
              { label: "Upload Files", icon: Activity, path: "/files", color: "bg-accent text-accent-foreground" },
              { label: "AI Review", icon: BrainCircuit, path: "/ai-review", color: "bg-warning/10 text-warning" },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => setLocation(action.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border hover:bg-muted/50 transition-all hover:shadow-sm active:scale-95"
              >
                <div className={`p-2.5 rounded-xl ${action.color}`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-medium text-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
