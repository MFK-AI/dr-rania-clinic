import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.refetch();
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Login failed. Please check your credentials.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please enter your email and password.");
      return;
    }
    loginMutation.mutate({ email: email.trim(), password });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "linear-gradient(135deg, oklch(0.96 0.015 195) 0%, oklch(0.97 0.01 10) 50%, oklch(0.96 0.012 85) 100%)",
      }}
    >
      {/* Decorative blobs — use design system colours */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl"
          style={{ background: "oklch(0.45 0.14 195 / 0.08)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl"
          style={{ background: "oklch(0.72 0.12 10 / 0.10)" }}
        />
      </div>

      <div className="relative w-full max-w-sm animate-slide-in">
        {/* Logo / Brand */}
        <div className="text-center mb-8 space-y-3">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mx-auto shadow-lg"
            style={{
              background: "var(--color-primary)",
              boxShadow: "0 8px 24px oklch(0.45 0.14 195 / 0.30)",
            }}
          >
            {/* Clinic logo if available, otherwise fallback monogram */}
            <img
              src="/logo.png"
              alt="Dr. Rania Mousa Clinic"
              className="w-10 h-10 rounded-xl object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("hidden");
              }}
            />
            <span hidden className="text-xl font-display font-bold text-primary-foreground">R</span>
          </div>
          <div>
            <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
              Dr. Rania Khalil
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Patient Intelligence Assistant
            </p>
          </div>
        </div>

        <Card className="border border-border shadow-xl bg-card/90 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-foreground">Sign in</CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Authorized clinic staff only
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loginMutation.isPending}
                  className="h-10 bg-muted/40 border-input focus:border-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loginMutation.isPending}
                    className="h-10 pr-10 bg-muted/40 border-input focus:border-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg transition-all"
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          drmousa.clinic · Secure Medical Records System
        </p>
      </div>
    </div>
  );
}
