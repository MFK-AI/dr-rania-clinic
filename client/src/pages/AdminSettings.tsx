import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Eye, EyeOff, KeyRound, Lock, LogOut, MessageCircle,
  Palette, Plus, RefreshCw, Settings, Shield, Sheet, UserCircle, Users,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

// ── Theme presets ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: "rose",   label: "Rose Mauve",   primary: "#9B4F6B", preview: "oklch(0.52 0.16 0)" },
  { id: "teal",   label: "Medical Teal", primary: "#0D7B7B", preview: "oklch(0.52 0.13 185)" },
  { id: "violet", label: "Soft Violet",  primary: "#6D4ABA", preview: "oklch(0.52 0.16 285)" },
  { id: "amber",  label: "Warm Amber",   primary: "#B07020", preview: "oklch(0.55 0.14 60)" },
  { id: "navy",   label: "Deep Navy",    primary: "#1A3A6B", preview: "oklch(0.35 0.1 255)" },
];

export default function AdminSettings() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ── Staff list ────────────────────────────────────────────────────────────
  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery(
    undefined, { enabled: user?.role === "doctor" || user?.role === "admin" }
  );
  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.admin.listUsers.invalidate(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // ── Per-user Telegram ─────────────────────────────────────────────────────
  const [editingTelegramId, setEditingTelegramId] = useState<number | null>(null);
  const [telegramDraft, setTelegramDraft] = useState("");
  const updateUserTelegram = trpc.admin.updateUserTelegramById.useMutation({
    onSuccess: () => {
      toast.success("Telegram ID saved — this user will now receive reminder alerts");
      setEditingTelegramId(null);
      utils.admin.listUsers.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // ── Create staff ──────────────────────────────────────────────────────────
  const [newStaff, setNewStaff] = useState({ name: "", email: "", password: "", role: "assistant" as "doctor"|"assistant"|"admin", telegramChatId: "" });
  const [showNewPwd, setShowNewPwd] = useState(false);
  const createStaff = trpc.auth.createStaff.useMutation({
    onSuccess: () => {
      toast.success("Account created");
      setNewStaff({ name: "", email: "", password: "", role: "assistant", telegramChatId: "" });
      utils.admin.listUsers.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // ── My Profile ────────────────────────────────────────────────────────────
  const { data: myProfile } = trpc.auth.getProfile.useQuery();
  const [profile, setProfile] = useState({ title: "", name: "", specialty: "", dateOfBirth: "", address: "", country: "", emirate: "", mobileNumber: "", telegramChatId: "" });
  const [profileLoaded, setProfileLoaded] = useState(false);
  if (myProfile && !profileLoaded) {
    const p = myProfile as { title?: string; specialty?: string; dateOfBirth?: string; address?: string; country?: string; emirate?: string; mobileNumber?: string; name?: string|null; telegramChatId?: string|null };
    setProfile({ title: p.title ?? "", name: p.name ?? "", specialty: p.specialty ?? "", dateOfBirth: p.dateOfBirth ?? "", address: p.address ?? "", country: p.country ?? "", emirate: p.emirate ?? "", mobileNumber: p.mobileNumber ?? "", telegramChatId: p.telegramChatId ?? "" });
    setProfileLoaded(true);
  }
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => toast.success("Profile saved"),
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // ── Change password ───────────────────────────────────────────────────────
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [showPwds, setShowPwds] = useState(false);
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => { toast.success("Password changed"); setPwdForm({ current: "", next: "", confirm: "" }); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem("clinic-theme") ?? "rose");
  function applyTheme(id: string) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return;
    document.documentElement.style.setProperty("--color-primary", t.preview);
    localStorage.setItem("clinic-theme", id);
    setActiveTheme(id);
    toast.success(`Theme changed to ${t.label}`);
  }

  // ── Full Sync ────────────────────────────────────────────────────────────
  const runFullSync = trpc.sync.runFullSync.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success(result.message ?? "Google Sheets rebuilt successfully");
      else toast.error(result.message ?? "Sync failed");
    },
    onError: (err: { message: string }) => toast.error("Sync failed: " + err.message),
  });

  const isDoctor = user?.role === "doctor" || user?.role === "admin";

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Profile, staff, notifications, theme, and account</p>
        </div>
        <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => { logout(); setLocation("/login"); }}>
          <LogOut className="h-4 w-4" />Sign out
        </Button>
      </div>

      {/* ── My Profile ───────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <UserCircle className="h-3.5 w-3.5" />My Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Select value={profile.title || "_none_"} onValueChange={(v) => setProfile(f => ({...f, title: v === "_none_" ? "" : v}))}>
                <SelectTrigger className="rounded-lg h-9"><SelectValue placeholder="Select title" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr.">Dr.</SelectItem>
                  <SelectItem value="Prof.">Prof.</SelectItem>
                  <SelectItem value="Assoc. Prof.">Assoc. Prof.</SelectItem>
                  <SelectItem value="Nurse">Nurse</SelectItem>
                  <SelectItem value="_none_">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input value={profile.name} onChange={(e) => setProfile(f => ({...f, name: e.target.value}))} placeholder="Dr. Rania Khalil" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Specialty</Label><Input value={profile.specialty} onChange={(e) => setProfile(f => ({...f, specialty: e.target.value}))} placeholder="Obstetrics &amp; Gynecology" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Date of Birth</Label><Input type="date" value={profile.dateOfBirth} onChange={(e) => setProfile(f => ({...f, dateOfBirth: e.target.value}))} className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Mobile Number</Label><Input value={profile.mobileNumber} onChange={(e) => setProfile(f => ({...f, mobileNumber: e.target.value}))} placeholder="+971 50 000 0000" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-primary" />My Telegram Chat ID</Label>
              <Input value={profile.telegramChatId} onChange={(e) => setProfile(f => ({...f, telegramChatId: e.target.value}))} placeholder="Send /start to @userinfobot" className="rounded-lg h-9" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Country</Label><Input value={profile.country} onChange={(e) => setProfile(f => ({...f, country: e.target.value}))} placeholder="United Arab Emirates" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Emirate</Label>
              <Select value={profile.emirate || "_none_"} onValueChange={(v) => setProfile(f => ({...f, emirate: v === "_none_" ? "" : v}))}>
                <SelectTrigger className="rounded-lg h-9"><SelectValue placeholder="Select emirate" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dubai">Dubai</SelectItem>
                  <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
                  <SelectItem value="Sharjah">Sharjah</SelectItem>
                  <SelectItem value="Ajman">Ajman</SelectItem>
                  <SelectItem value="Fujairah">Fujairah</SelectItem>
                  <SelectItem value="Ras Al Khaimah">Ras Al Khaimah</SelectItem>
                  <SelectItem value="Umm Al Quwain">Umm Al Quwain</SelectItem>
                  <SelectItem value="_none_">Not specified</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Clinic Address</Label><Input value={profile.address} onChange={(e) => setProfile(f => ({...f, address: e.target.value}))} placeholder="Prime Hospital / Mazher Center, Dubai" className="rounded-lg h-9" /></div>
          </div>
          <Button onClick={() => updateProfile.mutate({ ...profile, title: profile.title || undefined, emirate: profile.emirate || undefined })} disabled={updateProfile.isPending} className="gap-2">
            {updateProfile.isPending ? "Saving…" : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Theme ────────────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Palette className="h-3.5 w-3.5" />App Theme Color
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {THEMES.map((t) => (
              <button key={t.id} type="button" onClick={() => applyTheme(t.id)}
                className={"flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all " + (activeTheme === t.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40")}>
                <span className="h-5 w-5 rounded-full shrink-0 ring-1 ring-border" style={{ background: t.primary }} />
                <span className="text-sm font-medium">{t.label}</span>
                {activeTheme === t.id && <span className="text-xs text-primary font-semibold">Active</span>}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Theme is saved in your browser. Each device remembers its own preference.</p>
        </CardContent>
      </Card>

      {/* ── Google Sheets Sync ───────────────────────────────────────────── */}
      {isDoctor && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Sheet className="h-3.5 w-3.5" />Google Sheets Sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              If patient data is showing in wrong columns, run Full Sync.
              This clears the entire sheet and rebuilds it from the database with the correct column order.
            </p>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => runFullSync.mutate()}
                disabled={runFullSync.isPending}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className={"h-4 w-4 " + (runFullSync.isPending ? "animate-spin" : "")} />
                {runFullSync.isPending ? "Rebuilding sheet…" : "Run Full Sync"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Takes ~10 seconds. Do not close the page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-sm">
          <div className="space-y-1.5">
            <Label className="text-xs">Current Password</Label>
            <div className="relative">
              <Input type={showPwds ? "text" : "password"} value={pwdForm.current} onChange={(e) => setPwdForm(f => ({...f, current: e.target.value}))} placeholder="Current password" className="rounded-lg h-9 pr-10" />
              <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPwds(v => !v)}>{showPwds ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">New Password (min 8 chars)</Label><Input type={showPwds ? "text" : "password"} value={pwdForm.next} onChange={(e) => setPwdForm(f => ({...f, next: e.target.value}))} placeholder="New password" className="rounded-lg h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Confirm New Password</Label><Input type={showPwds ? "text" : "password"} value={pwdForm.confirm} onChange={(e) => setPwdForm(f => ({...f, confirm: e.target.value}))} placeholder="Repeat new password" className="rounded-lg h-9" /></div>
          <Button onClick={() => {
            if (!pwdForm.current || !pwdForm.next || !pwdForm.confirm) { toast.error("All fields required"); return; }
            if (pwdForm.next.length < 8) { toast.error("Min 8 characters"); return; }
            if (pwdForm.next !== pwdForm.confirm) { toast.error("Passwords don\'t match"); return; }
            changePassword.mutate({ currentPassword: pwdForm.current, newPassword: pwdForm.next });
          }} disabled={changePassword.isPending} className="w-full gap-2">
            <Lock className="h-4 w-4" />{changePassword.isPending ? "Saving…" : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Staff & Telegram — doctor only ───────────────────────────────── */}
      {isDoctor && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />Staff &amp; Telegram Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Staff members with a Telegram Chat ID receive all reminder alerts automatically.
              Ask each nurse to send <code className="bg-muted px-1 rounded">/start</code> to{" "}
              <code className="bg-muted px-1 rounded">@userinfobot</code> on Telegram, then share the ID here.
            </p>
            {usersLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
            ) : (
              <div className="space-y-2">
                {(users ?? []).map((u) => (
                  <div key={u.id} className="rounded-lg border bg-card p-3 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{u.name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">{u.email ?? u.openId}</p>
                      </div>
                      <Select value={u.role} onValueChange={(v) => updateUserRole.mutate({ userId: u.id, role: v as "admin"|"doctor"|"assistant" })} disabled={u.id === user?.id}>
                        <SelectTrigger className="w-32 h-7 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="doctor">Doctor</SelectItem>
                          <SelectItem value="assistant">Nurse / Assistant</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge className={"text-xs " + (u.isActive ? "status-done" : "status-cancelled")}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2">
                      <MessageCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                      {editingTelegramId === u.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input value={telegramDraft} onChange={(e) => setTelegramDraft(e.target.value)} placeholder="Telegram Chat ID (numbers only)" className="h-7 text-xs flex-1 rounded-lg" autoFocus />
                          <Button size="sm" className="h-7 text-xs px-2" onClick={() => updateUserTelegram.mutate({ userId: u.id, telegramChatId: telegramDraft.trim() || null })} disabled={updateUserTelegram.isPending}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingTelegramId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs flex-1">
                            {(u as { telegramChatId?: string }).telegramChatId
                              ? <span className="text-success font-medium">✓ {(u as { telegramChatId?: string }).telegramChatId}</span>
                              : <span className="text-muted-foreground italic">No Telegram ID — will not receive alerts</span>}
                          </span>
                          <button type="button" className="text-xs text-primary hover:underline shrink-0"
                            onClick={() => { setEditingTelegramId(u.id); setTelegramDraft((u as { telegramChatId?: string }).telegramChatId ?? ""); }}>
                            {(u as { telegramChatId?: string }).telegramChatId ? "Change" : "Set ID"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />Add New Nurse / Staff Account
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Full Name *</Label><Input value={newStaff.name} onChange={(e) => setNewStaff(f => ({...f, name: e.target.value}))} placeholder="Nurse Aisha" className="rounded-lg h-9" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Email *</Label><Input type="email" value={newStaff.email} onChange={(e) => setNewStaff(f => ({...f, email: e.target.value}))} placeholder="nurse@clinic.com" className="rounded-lg h-9" /></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password * (min 8 chars)</Label>
                  <div className="relative">
                    <Input type={showNewPwd ? "text" : "password"} value={newStaff.password} onChange={(e) => setNewStaff(f => ({...f, password: e.target.value}))} placeholder="Min 8 characters" className="rounded-lg h-9 pr-10" />
                    <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowNewPwd(v => !v)}>{showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={newStaff.role} onValueChange={(v) => setNewStaff(f => ({...f, role: v as typeof f.role}))}>
                    <SelectTrigger className="rounded-lg h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assistant">Nurse / Assistant</SelectItem>
                      <SelectItem value="doctor">Doctor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label className="text-xs flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-primary" />Telegram Chat ID (optional)</Label>
                  <Input value={newStaff.telegramChatId} onChange={(e) => setNewStaff(f => ({...f, telegramChatId: e.target.value}))} placeholder="Ask them to send /start to @userinfobot" className="rounded-lg h-9" />
                </div>
              </div>
              <Button onClick={() => {
                if (!newStaff.name.trim() || !newStaff.email.trim() || newStaff.password.length < 8) { toast.error("Name, email, and 8+ char password required"); return; }
                (createStaff.mutate as (input: { name: string; email: string; password: string; role: "doctor"|"assistant"|"admin"; telegramChatId?: string }) => void)({ name: newStaff.name.trim(), email: newStaff.email.trim(), password: newStaff.password, role: newStaff.role, telegramChatId: newStaff.telegramChatId.trim() || undefined });
              }} disabled={createStaff.isPending} className="gap-2">
                <Plus className="h-4 w-4" />{createStaff.isPending ? "Creating…" : "Create Account"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isDoctor && (
        <Card className="border border-dashed">
          <CardContent className="p-5 text-center">
            <Shield className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Staff management is restricted to Dr. Rania and admins.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
