import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PatientList from "./pages/PatientList";
import PatientDetail from "./pages/PatientDetail";
import PatientForm from "./pages/PatientForm";
import VisitDetail from "./pages/VisitDetail";
import VisitForm from "./pages/VisitForm";
import Reminders from "./pages/Reminders";
import AiReview from "./pages/AiReview";
import FilesUpload from "./pages/FilesUpload";
import AdminSettings from "./pages/AdminSettings";
import AuditLog from "./pages/AuditLog";
import ExportData from "./pages/ExportData";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading clinic system…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* Public route — login page */}
      <Route path="/login" component={Login} />

      {/* All other routes are protected */}
      <Route>
        <AuthGate>
          <DashboardLayout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/patients" component={PatientList} />
              <Route path="/patients/new" component={PatientForm} />
              <Route path="/patients/:id" component={PatientDetail} />
              <Route path="/patients/:id/edit" component={PatientForm} />
              <Route path="/visits/new" component={VisitForm} />
              <Route path="/visits/:id" component={VisitDetail} />
              <Route path="/visits/:id/edit" component={VisitForm} />
              <Route path="/reminders" component={Reminders} />
              <Route path="/ai-review" component={AiReview} />
              <Route path="/files" component={FilesUpload} />
              <Route path="/admin" component={AdminSettings} />
              <Route path="/audit" component={AuditLog} />
              <Route path="/export" component={ExportData} />
              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </DashboardLayout>
        </AuthGate>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
