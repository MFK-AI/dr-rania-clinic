import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Settings, Shield, Users } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminSettings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery();
  const utils = trpc.useUtils();

  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated");
      utils.admin.listUsers.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const [telegramChatId, setTelegramChatId] = useState("");
  const saveTelegram = trpc.admin.updateTelegram.useMutation({
    onSuccess: () => toast.success("Telegram Chat ID saved"),
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (user?.role !== "admin") {
    return (
      <div className="p-6 text-center">
        <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Admin access required</p>
        <Button variant="ghost" onClick={() => setLocation("/")} className="mt-4">
          Go Home
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      <div>
        <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Admin Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage users, roles, and system configuration
        </p>
      </div>

      {/* User Management */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            User Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : !users || users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{u.name ?? "Unnamed User"}</p>
                    <p className="text-xs text-muted-foreground">{u.email ?? u.openId}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={u.isActive ?? true}
                      onCheckedChange={() => toast.info("Toggle active coming soon")}
                      disabled={u.id === user?.id}
                    />
                    <Select
                      value={u.role}
                      onValueChange={(v) => {
                        if (v === "user") { toast.info("Use doctor or assistant roles"); return; }
                        updateUserRole.mutate({ userId: u.id, role: v as "admin" | "doctor" | "assistant" });
                      }}
                      disabled={u.id === user?.id}
                    >
                      <SelectTrigger className="w-32 h-8 text-xs rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge
                      className={`text-xs ${
                        u.isActive ? "status-done" : "status-cancelled"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram Configuration */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Telegram Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect a Telegram bot to receive instant alerts for new patients, urgent reminders,
            and AI review completions.
          </p>
          <div className="flex gap-3 max-w-md">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="telegramChatId">Your Telegram Chat ID</Label>
              <Input
                id="telegramChatId"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g., 123456789"
                className="rounded-lg"
              />
              <p className="text-xs text-muted-foreground">
                Send /start to @userinfobot on Telegram to get your Chat ID
              </p>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  if (!telegramChatId.trim()) {
                    toast.error("Please enter a Chat ID");
                    return;
                  }
                  saveTelegram.mutate({ telegramChatId: telegramChatId.trim() });
                }}
                disabled={saveTelegram.isPending}
                className="gap-2"
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
