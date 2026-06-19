import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";

export default function PatientForm() {
  const { id } = useParams<{ id: string }>();
  const patientId = id ? parseInt(id) : null;
  const isEdit = !!patientId;
  const [, setLocation] = useLocation();

  const { data: existing, isLoading } = trpc.patients.getById.useQuery(
    { id: patientId! },
    { enabled: isEdit }
  );

  const [form, setForm] = useState({
    name: "",
    phone: "",
    age: "",
    visitLocation: "",
    maritalStatus: "",
    pregnancyStatus: "",
    gravida: "",
    para: "",
    allergies: "",
    importantNotes: "",
  });

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name ?? "",
        phone: existing.phone ?? "",
        age: existing.age?.toString() ?? "",
        visitLocation: existing.visitLocation ?? "",
        maritalStatus: existing.maritalStatus ?? "",
        pregnancyStatus: existing.pregnancyStatus ?? "",
        gravida: existing.gravida?.toString() ?? "",
        para: existing.para?.toString() ?? "",
        allergies: existing.allergies ?? "",
        importantNotes: existing.importantNotes ?? "",
      });
    }
  }, [existing]);

  const utils = trpc.useUtils();

  const createPatient = trpc.patients.create.useMutation({
    onSuccess: (data) => {
      toast.success("Patient created successfully");
      utils.patients.list.invalidate();
      setLocation(`/patients/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      toast.success("Patient updated successfully");
      utils.patients.getById.invalidate({ id: patientId! });
      setLocation(`/patients/${patientId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Name and phone are required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      age: form.age ? parseInt(form.age) : undefined,
      visitLocation: (form.visitLocation || undefined) as "Prime Hospital" | "Mazher Center" | undefined,
      maritalStatus: (form.maritalStatus || undefined) as "single" | "married" | "divorced" | "widowed" | undefined,
      pregnancyStatus: form.pregnancyStatus || undefined,
      gravida: form.gravida ? parseInt(form.gravida) : undefined,
      para: form.para ? parseInt(form.para) : undefined,
      allergies: form.allergies || undefined,
      importantNotes: form.importantNotes || undefined,
    };
    if (isEdit) {
      updatePatient.mutate({ id: patientId!, data: payload });
    } else {
      createPatient.mutate(payload);
    }
  };

  const isSubmitting = createPatient.isPending || updatePatient.isPending;

  if (isEdit && isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(isEdit ? `/patients/${patientId}` : "/patients")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-display font-semibold">
          {isEdit ? "Edit Patient" : "New Patient"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Patient full name"
                  required
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+20 1XX XXX XXXX"
                  required
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  min="1"
                  max="120"
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                  placeholder="Years"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitLocation">Visit Location</Label>
                <Select
                  value={form.visitLocation}
                  onValueChange={(v) => setForm((f) => ({ ...f, visitLocation: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Prime Hospital">Prime Hospital</SelectItem>
                    <SelectItem value="Mazher Center">Mazher Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maritalStatus">Marital Status</Label>
                <Select
                  value={form.maritalStatus}
                  onValueChange={(v) => setForm((f) => ({ ...f, maritalStatus: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="married">Married</SelectItem>
                    <SelectItem value="divorced">Divorced</SelectItem>
                    <SelectItem value="widowed">Widowed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Obstetric History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pregnancyStatus">Pregnancy Status</Label>
                <Select
                  value={form.pregnancyStatus}
                  onValueChange={(v) => setForm((f) => ({ ...f, pregnancyStatus: v }))}
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_pregnant">Not Pregnant</SelectItem>
                    <SelectItem value="pregnant">Pregnant</SelectItem>
                    <SelectItem value="postpartum">Postpartum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gravida">Gravida (G)</Label>
                <Input
                  id="gravida"
                  type="number"
                  min="0"
                  value={form.gravida}
                  onChange={(e) => setForm((f) => ({ ...f, gravida: e.target.value }))}
                  placeholder="0"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="para">Para (P)</Label>
                <Input
                  id="para"
                  type="number"
                  min="0"
                  value={form.para}
                  onChange={(e) => setForm((f) => ({ ...f, para: e.target.value }))}
                  placeholder="0"
                  className="rounded-lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Clinical Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea
                id="allergies"
                value={form.allergies}
                onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
                placeholder="Known drug or food allergies…"
                rows={2}
                className="rounded-lg resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="importantNotes">Important Notes</Label>
              <Textarea
                id="importantNotes"
                value={form.importantNotes}
                onChange={(e) => setForm((f) => ({ ...f, importantNotes: e.target.value }))}
                placeholder="Critical information to display prominently…"
                rows={3}
                className="rounded-lg resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation(isEdit ? `/patients/${patientId}` : "/patients")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            <Save className="h-4 w-4" />
            {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Create Patient"}
          </Button>
        </div>
      </form>
    </div>
  );
}
