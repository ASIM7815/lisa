"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Brain,
  ChevronDown,
  CircleHelp,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { api, ApiClientError, jsonBody } from "@/lib/client/api";
import { CreateCaseModal } from "@/components/create-case-modal";
import { cn } from "@/lib/utils/cn";

type ShellContextValue = {
  showToast: (message: string, kind?: "success" | "error") => void;
  openCreateCase: () => void;
  refreshDashboard: () => void;
  authenticated: boolean;
  requestAuth: () => void;
  operatorName: string;
};

export function useShell() {
  return (globalThis as typeof globalThis & { __lisaShell?: ShellContextValue }).__lisaShell;
}

const NAV = [
  {
    label: "WORKSPACE",
    items: [
      { href: "/", name: "Dashboard", icon: LayoutDashboard },
      { href: "/cases", name: "Cases", icon: FolderOpen },
      { href: "/chat", name: "LISA Chat", icon: MessageSquare },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/memory", name: "Memory", icon: Brain },
      { href: "/decisions", name: "Decisions", icon: ShieldCheck },
      { href: "/analytics", name: "Analytics", icon: BarChart3 },
      { href: "/knowledge", name: "Knowledge base", icon: BookOpen },
    ],
  },
];

const TITLES: Record<string, { title: string; crumb: string }> = {
  "/": { title: "Dashboard", crumb: "Overview" },
  "/cases": { title: "Cases", crumb: "Workspace" },
  "/chat": { title: "LISA Chat", crumb: "Workspace" },
  "/memory": { title: "Memory", crumb: "Intelligence" },
  "/decisions": { title: "Decisions", crumb: "Intelligence" },
  "/analytics": { title: "Analytics", crumb: "Intelligence" },
  "/knowledge": { title: "Knowledge base", crumb: "Intelligence" },
  "/settings": { title: "Settings", crumb: "Workspace" },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [caseCount, setCaseCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [profileName, setProfileName] = useState("Alex Morgan");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("lisa-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lisa-theme", theme);
  }, [theme]);

  useEffect(() => {
    const listener = (event: Event) => {
      const selected = (event as CustomEvent<{ theme: "light" | "dark" | "system" }>).detail.theme;
      setTheme(selected === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : selected);
    };
    window.addEventListener("lisa:theme", listener);
    return () => window.removeEventListener("lisa:theme", listener);
  }, []);

  const showToast = useCallback((message: string, kind: "success" | "error" = "success") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3600);
  }, []);
  const openCreateCase = useCallback(() => setCreateOpen(true), []);
  const refreshDashboard = useCallback(() => {
    setRefreshTick((n) => n + 1);
    window.dispatchEvent(new Event("lisa:refresh"));
  }, []);
  const requestAuth = useCallback(() => setAuthOpen(true), []);

  useEffect(() => {
    (globalThis as typeof globalThis & { __lisaShell?: ShellContextValue }).__lisaShell = {
      showToast, openCreateCase, refreshDashboard, authenticated, requestAuth, operatorName: profileName,
    };
  }, [showToast, openCreateCase, refreshDashboard, authenticated, requestAuth, profileName]);

  useEffect(() => {
    const listener = () => openCreateCase();
    window.addEventListener("lisa:create-case", listener);
    return () => window.removeEventListener("lisa:create-case", listener);
  }, [openCreateCase]);

  useEffect(() => {
    let active = true;
    api<{ authenticationRequired: boolean; authenticated: boolean }>("/api/auth/status")
      .then((result) => {
        if (!active) return;
        setAuthRequired(result.authenticationRequired);
        setAuthenticated(result.authenticated);
        setAuthOpen(result.authenticationRequired && !result.authenticated);
      })
      .catch((error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          setAuthRequired(true);
          setAuthenticated(false);
          setAuthOpen(true);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    api<{ counts: { all: number; awaiting: number } }>("/api/cases?limit=1")
      .then((result) => { setCaseCount(result.counts.all); setAwaitingCount(result.counts.awaiting); })
      .catch(() => undefined);
    api<{ settings: { operatorName?: string } }>("/api/settings")
      .then((result) => { if (result.settings.operatorName) setProfileName(result.settings.operatorName); })
      .catch(() => undefined);
  }, [authenticated, refreshTick, pathname]);

  const title = useMemo(() => {
    if (pathname.startsWith("/cases/")) return { title: "Case details", crumb: "Cases" };
    return TITLES[pathname] ?? { title: "Workspace", crumb: "LISA" };
  }, [pathname]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(`/cases${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    setSearch("");
  };

  return (
    <div className="app-shell">
      <div className={cn("shade", sidebarOpen && "open")} onClick={() => setSidebarOpen(false)} />
      <aside className={cn("sidebar", sidebarOpen && "open")}>
        <Link href="/" className="sidebar-brand" onClick={() => setSidebarOpen(false)}>
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
          <span><span className="brand-name">LISA</span><span className="brand-sub">Operations intelligence</span></span>
        </Link>
        {NAV.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map(({ href, name, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link href={href} className={cn("nav-link", active && "active")} key={href} onClick={() => setSidebarOpen(false)}>
                  <Icon size={16} strokeWidth={active ? 2.1 : 1.8} />
                  <span>{name}</span>
                  {name === "Cases" && caseCount > 0 && <span className="nav-count">{caseCount}</span>}
                  {name === "Decisions" && awaitingCount > 0 && <span className="nav-count">{awaitingCount}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="nav-group">
          <div className="nav-label">PREFERENCES</div>
          <Link href="/settings" className={cn("nav-link", pathname === "/settings" && "active")} onClick={() => setSidebarOpen(false)}>
            <Settings size={16} strokeWidth={1.8} /><span>Settings</span>
          </Link>
        </div>
        <div className="sidebar-bottom">
          <div className="memory-mini">
            <div className="memory-mini-top"><span className="memory-pulse" /> Memory is learning</div>
            <p>Resolved cases become experience that makes the next recommendation smarter.</p>
            <Link href="/memory" className="nav-link" style={{ padding: "8px 0 0", minHeight: "auto", color: "var(--accent)" }}>
              Explore memory <ChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
            </Link>
          </div>
          <div className="profile-box">
            <span className="avatar">{profileName.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
            <div style={{ minWidth: 0, flex: 1 }}><div className="profile-name">{profileName}</div><div className="profile-role">Operations lead</div></div>
            <button className="icon-button" title="Sign out" onClick={async () => {
              if (authRequired) { await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); setAuthenticated(false); setAuthOpen(true); }
            }}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      <main className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>
            <div className="breadcrumb">LISA <span style={{ padding: "0 6px", color: "var(--border-strong)" }}>/</span> <strong>{title.crumb}</strong> <span style={{ padding: "0 6px", color: "var(--border-strong)" }}>/</span> {title.title}</div>
          </div>
          <div className="topbar-actions">
            <form className="searchbox" onSubmit={submitSearch}>
              <Search size={15} /><input aria-label="Search cases" placeholder="Search cases…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </form>
            <button className="icon-button subtle" title={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button className="icon-button subtle" title="Help and product guide" onClick={() => router.push("/knowledge")}><CircleHelp size={15} /></button>
            <button className="btn btn-primary btn-sm" onClick={openCreateCase}><Plus size={14} /> New case</button>
          </div>
        </header>
        {children}
      </main>
      <CreateCaseModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(record) => {
        setCreateOpen(false); refreshDashboard(); showToast(`${record.ref} created`); router.push(`/cases/${record.id}`);
      }} />
      {authOpen && <AuthModal onSuccess={() => { setAuthenticated(true); setAuthOpen(false); showToast("Welcome back to LISA"); }} />}
      {toast && <div className="toast" role="status"><span className="status-dot" style={{ background: toast.kind === "error" ? "#c25349" : "#58a77f" }} />{toast.message}</div>}
    </div>
  );
}

function AuthModal({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: jsonBody({ token }) });
      onSuccess();
    } catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header"><div><h2 id="auth-title">Welcome to LISA</h2><p>Enter your workspace access token to continue.</p></div><span className="brand-mark"><Sparkles size={17} /></span></div>
        <div className="modal-body"><div className="field"><label htmlFor="auth-token">Workspace token</label><input id="auth-token" type="password" autoComplete="current-password" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Enter LISA_API_TOKEN" /></div>{error && <div className="error-text">{error}</div>}<p className="field-hint">This token stays in this browser session and is exchanged for an HTTP-only cookie. It is never included in client-side API requests.</p></div>
        <div className="modal-footer"><button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Signing in…" : "Continue"}</button></div>
      </form>
    </div>
  );
}
