import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  Bell,
  BrainCircuit,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Settings,
  Shield,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Users, label: "Patients", path: "/patients" },
  { icon: Bell, label: "Reminders", path: "/reminders" },
  { icon: BrainCircuit, label: "AI Review", path: "/ai-review" },
  { icon: Upload, label: "Files", path: "/files" },
  { icon: FileSpreadsheet, label: "Export Data", path: "/export" },
];

// Settings is accessible to ALL users; Audit is doctor/admin only
const settingsItem = { icon: Settings, label: "Settings", path: "/admin" };
const adminMenuItems = [
  { icon: Shield, label: "Audit Log", path: "/audit" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (w: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isDoctor = user?.role === "doctor" || user?.role === "admin";

  const activeItem =
    [...menuItems, settingsItem, ...adminMenuItems].find((i) => i.path === location) ??
    menuItems[0];

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - left;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border bg-sidebar"
          disableTransition={isResizing}
        >
          {/* Header */}
          <SidebarHeader className="h-16 border-b border-sidebar-border">
            <div className="flex items-center gap-3 px-3">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src="/logo.png"
                    alt="Dr. Rania Mousa Clinic"
                    className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-sidebar-primary/30 scale-110"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-display font-semibold text-sidebar-foreground truncate">
                      Dr. Rania Khalil
                    </p>
                    <p className="text-xs text-sidebar-foreground/50 truncate">
                      drmousa.clinic
                    </p>
                  </div>
                </div>
              )}
              {isCollapsed && (
                <img
                  src="/logo.png"
                  alt="Dr. Rania Mousa Clinic"
                  className="h-8 w-8 rounded-full object-cover shrink-0 ring-2 ring-sidebar-primary/30 scale-110"
                />
              )}
            </div>
          </SidebarHeader>

          {/* Navigation */}
          <SidebarContent className="py-3">
            <SidebarMenu className="px-2 space-y-0.5">
              {menuItems.map((item) => {
                const isActive =
                  item.path === "/"
                    ? location === "/"
                    : location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 rounded-lg font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`}
                      />
                      <span className="text-sm">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Settings — visible to ALL users */}
              <div className="my-2 mx-1 h-px bg-sidebar-border" />
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.startsWith(settingsItem.path)}
                  onClick={() => setLocation(settingsItem.path)}
                  tooltip={settingsItem.label}
                  className="h-10 rounded-lg font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
                >
                  <settingsItem.icon
                    className={`h-4 w-4 shrink-0 ${location.startsWith(settingsItem.path) ? "text-sidebar-primary" : ""}`}
                  />
                  <span className="text-sm">{settingsItem.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Audit Log — doctor/admin only */}
              {isDoctor && adminMenuItems.map((item) => {
                const isActive = location.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 rounded-lg font-normal text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`}
                      />
                      <span className="text-sm">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-8 w-8 shrink-0 ring-1 ring-sidebar-border">
                    <AvatarFallback className="text-xs font-semibold bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                        {user?.name ?? "—"}
                      </p>
                      <p className="text-xs text-sidebar-foreground/50 truncate mt-1 capitalize">
                        {user?.role ?? ""}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-2">
                  <p className="text-xs font-semibold">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role} · drmousa.clinic</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/admin")} className="cursor-pointer gap-2">
                  <UserCircle className="h-4 w-4" />
                  Profile &amp; Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors"
            style={{ zIndex: 50 }}
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-lg" />
              <span className="text-sm font-medium">{activeItem?.label}</span>
            </div>
          </div>
        )}
        <main className="flex-1 min-h-0">{children}</main>
      </SidebarInset>
    </>
  );
}
