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
import { Eye, EyeOff, KeyRound, Lock, MessageCircle, Plus, Settings, Shield, UserCircle, Users } from "lucide-react";
import { useState } from "react";

export default function AdminSettings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: users, isLoading: usersLoading } = trpc.admin.listUsers.useQuery();
  const updateUserRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); utils.admin.listUsers.invalidate(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const [editingTelegramId, setEditingTelegramId] = useState<number | null>(null);
  const [telegramDraft, setTelegramDraft] = useState("");
  const updateUserTelegram = trpc.admin.updateUserTelegramById.useMutation({
    onSuccess: () => {
      toast.success("Telegram ID saved — this user will now receive all reminder alerts");
      setEditingTelegramId(null);
      utils.admin.listUsers.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const [newStaff, setNewStaff] = useState({ name: "", email: "", password: "", role: "assistant" as "doctor" | "assistant" | "admin", telegramChatId: "" });
  const [showNewPwd, setShowNewPwd] = useState(false);
  const createStaff = trpc.auth.createStaff.useMutation({
    onSuccess: () => {
      toast.success("Account created successfully");
      setNewStaff({ name: "", email: "", password: "", role: "assistant", telegramChatId: "" });
      utils.admin.listUsers.invalidate();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const { data: myProfile } = trpc.auth.getProfile.useQuery();
  const [profile, setProfile] = useState({ title: "", name: "", specialty: "", dateOfBirth: "", address: "", country: "", emirate: "", mobileNumber: "", telegramChatId: "" });
  const [profileLoaded, setProfileLoaded] = useState(false);
  if (myProfile && !profileLoaded) {
    const p = myProfile as { title?: string; specialty?: string; dateOfBirth?: string; address?: string; country?: string; emirate?: string; mobileNumber?: string; name?: string | null; telegramChatId?: string | null };
    setProfile({ title: p.title ?? "", name: p.name ?? "", specialty: p.specialty ?? "", dateOfBirth: p.dateOfBirth ?? "", address: p.address ?? "", country: p.country ?? "", emirate: p.emirate ?? "", mobileNumber: p.mobileNumber ?? "", telegramChatId: p.telegramChatId ?? "" });
    setProfileLoaded(true);
  }
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => toast.success("Profile saved"),
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [showPwds, setShowPwds] = useState(false);
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => { toast.success("Password changed successfully"); setPwdForm({ current: "", next: "", confirm: "" }); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const isDoctor = user?.role === "doctor" || user?.role === "admin";

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage staff accounts, Telegram notifications, profile, and password</p>
      </div>

      {/* ── Staff Accounts & Telegram ──────────────────────────────────────── */}
      {isDoctor && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              Staff Accounts &amp; Telegram IDs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Staff members with a Telegram Chat ID receive all reminder alerts. Ask each nurse to send{" "}
              <code className="bg-muted px-1 rounded">/start</code> to <code className="bg-muted px-1 rounded">@userinfobot</code> on Telegram.
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
                      <Select value={u.role} onValueChange={(v) => updateUserRole.mutate({ userId: u.id, role: v as "admin" | "doctor" | "assistant" })} disabled={u.id === user?.id}>
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
                          <Input value={telegramDraft} onChange={(e) => setTelegramDraft(e.target.value)} placeholder="Telegram Chat ID" className="h-7 text-xs flex-1 rounded-lg" autoFocus />
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
                <div className="space-y-1.5"><Label className="text-xs">Full Name *</Label><Input value={newStaff.name} onChange={(e) => setNewStaff(f => ({...f, name: e.target.value}))} placeholder="e.g., Nurse Aisha" className="rounded-lg h-9" /></div>
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
                if (!newStaff.name.trim() || !newStaff.email.trim() || newStaff.password.length < 8) { toast.error("Name, email and at least 8-char password required"); return; }
                (createStaff.mutate as (input: { name: string; email: string; password: string; role: "doctor"|"assistant"|"admin"; telegramChatId?: string }) => void)({ name: newStaff.name.trim(), email: newStaff.email.trim(), password: newStaff.password, role: newStaff.role, telegramChatId: newStaff.telegramChatId.trim() || undefined });
              }} disabled={createStaff.isPending} className="gap-2">
                <Plus className="h-4 w-4" />{createStaff.isPending ? "Creating…" : "Create Account"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── My Profile ───────────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <UserCircle className="h-3.5 w-3.5" />
            My Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Select value={profile.title} onValueChange={(v) => setProfile(f => ({...f, title: v}))}>
                <SelectTrigger className="rounded-lg h-9"><SelectValue placeholder="Select title" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr.">Dr.</SelectItem>
                  <SelectItem value="Prof.">Prof.</SelectItem>
                  <SelectItem value="Assoc. Prof.">Assoc. Prof.</SelectItem>
                  <SelectItem value="Nurse">Nurse</SelectItem>
                  <SelectItem value="">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Full Name</Label><Input value={profile.name} onChange={(e) => setProfile(f => ({...f, name: e.target.value}))} placeholder="Dr. Rania Khalil" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Specialty</Label><Input value={profile.specialty} onChange={(e) => setProfile(f => ({...f, specialty: e.target.value}))} placeholder="Obstetrics & Gynecology" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Date of Birth</Label><Input type="date" value={profile.dateOfBirth} onChange={(e) => setProfile(f => ({...f, dateOfBirth: e.target.value}))} className="rounded-lg h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Mobile Number</Label><Input value={profile.mobileNumber} onChange={(e) => setProfile(f => ({...f, mobileNumber: e.target.value}))} placeholder="+971 50 000 0000" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-primary" />My Telegram Chat ID</Label>
              <Input value={profile.telegramChatId} onChange={(e) => setProfile(f => ({...f, telegramChatId: e.target.value}))} placeholder="Send /start to @userinfobot" className="rounded-lg h-9" />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Country</Label><Input value={profile.country} onChange={(e) => setProfile(f => ({...f, country: e.target.value}))} placeholder="United Arab Emirates" className="rounded-lg h-9" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Emirate</Label>
              <Select value={profile.emirate} onValueChange={(v) => setProfile(f => ({...f, emirate: v}))}>
                <SelectTrigger className="rounded-lg h-9"><SelectValue placeholder="Select emirate" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dubai">Dubai</SelectItem>
                  <SelectItem value="Abu Dhabi">Abu Dhabi</SelectItem>
                  <SelectItem value="Sharjah">Sharjah</SelectItem>
                  <SelectItem value="Ajman">Ajman</SelectItem>
                  <SelectItem value="Fujairah">Fujairah</SelectItem>
                  <SelectItem value="Ras Al Khaimah">Ras Al Khaimah</SelectItem>
                  <SelectItem value="Umm Al Quwain">Umm Al Quwain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label className="text-xs">Clinic Address</Label><Input value={profile.address} onChange={(e) => setProfile(f => ({...f, address: e.target.value}))} placeholder="Prime Hospital / Mazher Center, Dubai" className="rounded-lg h-9" /></div>
          </div>
          <Button onClick={() => updateProfile.mutate(profile)} disabled={updateProfile.isPending} className="gap-2">
            {updateProfile.isPending ? "Saving…" : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Change Password ───────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            Change Password
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
            if (!pwdForm.current || !pwdForm.next || !pwdForm.confirm) { toast.error("All three fields are required"); return; }
            if (pwdForm.next.length < 8) { toast.error("New password must be at least 8 characters"); return; }
            if (pwdForm.next !== pwdForm.confirm) { toast.error("Passwords don't match"); return; }
            changePassword.mutate({ currentPassword: pwdForm.current, newPassword: pwdForm.next });
          }} disabled={changePassword.isPending} className="w-full gap-2">
            <Lock className="h-4 w-4" />{changePassword.isPending ? "Saving…" : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {!isDoctor && (
        <Card className="border shadow-sm">
          <CardContent className="p-6 text-center">
            <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Staff management is restricted to Dr. Rania and admins.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
