import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import { Spinner } from "./icons";
import StressCheckModal from "./StressCheckModal";
import WorkspaceSearchModal from "./WorkspaceSearchModal";
import { checkStressCooldown } from "../lib/stressService";

type NavItem = { label: string; to: string };


/* ── SVG nav icons ─────────────────────────────────────────────── */
const navIcons: Record<string, JSX.Element> = {
  Dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  "My Dashboard": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  Tasks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  "My Tasks": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  Employees: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Attendance: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  "My Attendance": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  "Stress Monitoring": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  "My Stress": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  Activity: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  "My Activity": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Wellbeing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0L12 5.36l-.77-.78a5.4 5.4 0 0 0-7.65 7.65l1.06 1.06L12 20.71l7.36-7.36 1.06-1.06a5.4 5.4 0 0 0 0-7.65Z" />
    </svg>
  ),
  Notifications: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  "Company Settings": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  Settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  "My Profile": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

import AIChatbotDrawer from "./AIChatbotDrawer";

export default function RoleShell({
  navItems,
  roleLabel,
}: {
  navItems: NavItem[];
  roleLabel: string;
}) {
  const { signOut, organization, user, profile, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();


  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

  // Global keyboard listener for Command Palette (⌘K or Ctrl+K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Check for unread notifications and update dot status
  useEffect(() => {
    let isSubscribed = true;
    async function checkNotifications() {
      const lastSeen = Number(localStorage.getItem("workwise_last_seen_notif") || 0);

      if (location.pathname.endsWith("/notifications")) {
        localStorage.setItem("workwise_last_seen_notif", String(Date.now()));
        if (isSubscribed) setHasUnreadNotifications(false);
        return;
      }

      const { data } = await supabase
        .from("notifications")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && isSubscribed) {
        const latestTime = new Date(data.created_at).getTime();
        setHasUnreadNotifications(latestTime > lastSeen);
      }
    }

    checkNotifications();
    return () => {
      isSubscribed = false;
    };
  }, [location.pathname]);

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Name can't be empty.");
      return;
    }

    setSavingName(true);
    setNameError(null);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", profile?.id ?? "");

    setSavingName(false);

    if (error) {
      setNameError(error.message);
      return;
    }

    await refreshProfile();
    setEditingName(false);
  }

  const displayName = profile?.full_name || user?.email || "";
  const initials = getInitials(displayName || "U");

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  async function handleLogoutClick() {
    if (!user) {
      signOut();
      return;
    }
    const cooldown = checkStressCooldown(user.id);
    if (cooldown.inCooldown) {
      signOut();
      return;
    }
    setLogoutModalOpen(true);
  }

  // Get current page title from the active nav item
  const currentPageTitle = navItems.find((item) => location.pathname === item.to)?.label || "";

  return (
    <>
      <StressCheckModal
        isOpen={logoutModalOpen}
        eventType="LOGOUT"
        onClose={() => setLogoutModalOpen(false)}
        onSkip={() => signOut()}
        onComplete={() => {
          setLogoutModalOpen(false);
          signOut();
        }}
      />
      <div className="min-h-screen bg-base-950 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-50 inset-y-0 left-0 lg:my-3 lg:ml-3 lg:h-[calc(100vh-24px)] w-64 flex flex-col transition-all duration-300 lg:relative lg:translate-x-0 lg:z-auto lg:rounded-2xl overflow-hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "linear-gradient(180deg, rgba(var(--c-base-900), 0.85), rgba(var(--c-base-950), 0.92))",
          backdropFilter: "blur(24px) saturate(190%)",
          WebkitBackdropFilter: "blur(24px) saturate(190%)",
          border: "1px solid rgba(var(--c-base-700), 0.4)",
          boxShadow: "0 20px 40px -12px rgba(var(--c-shadow), 0.5)",
        }}
      >
        {/* Subtle ambient aurora in sidebar */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute top-0 left-0 w-full h-48" style={{
            background: "radial-gradient(ellipse at 30% 0%, rgba(var(--c-accent-500), 0.12) 0%, transparent 70%)"
          }} />
          <div className="absolute bottom-0 right-0 w-full h-32" style={{
            background: "radial-gradient(ellipse at 70% 100%, rgba(var(--c-cobalt-500), 0.08) 0%, transparent 70%)"
          }} />
        </div>

        {/* Brand */}
        <div className="relative z-10 px-5 pt-5 pb-4 space-y-3">
          <Logo />
          {organization && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-base-800/50 border border-base-700/50 backdrop-blur-sm shadow-sm group hover:border-accent-500/30 transition-colors">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-500/25 to-cobalt-500/15 border border-accent-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-400">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold text-ink-200 font-display tracking-wide truncate capitalize">
                {organization.name}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="relative z-10 flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <p className="px-3 pt-1 pb-2 text-[9px] font-bold text-ink-500 uppercase tracking-[0.22em] font-spacex">
            Core Modules
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `nav-link ${
                  isActive ? "nav-link-active" : ""
                } group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-250 ${
                  isActive
                    ? "bg-gradient-to-r from-accent-500/18 via-accent-500/10 to-transparent text-accent-400 border border-accent-500/30 shadow-[0_2px_12px_rgba(20,184,166,0.15)]"
                    : "text-ink-400 hover:bg-base-800/60 hover:text-ink-200 border border-transparent"
                }`
              }
            >
              <span className={`shrink-0 transition-all duration-300 group-hover:scale-110`}>
                {navIcons[item.label] || (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="relative z-10 px-3 py-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(var(--c-accent-500), 0.8), rgba(var(--c-cobalt-500), 0.8), rgba(var(--c-violet-500), 0.7))",
                boxShadow: "0 2px 10px rgba(var(--c-accent-500), 0.25)",
              }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-100 truncate">
                {displayName}
              </p>
              <p className="text-[11px] text-ink-500 font-medium truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogoutClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-400 hover:bg-rose-500/10 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all duration-250"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-8 gap-4 border-b border-white/5"
          style={{
            background: "rgba(var(--c-base-950), 0.8)",
            backdropFilter: "blur(24px) saturate(190%)",
            WebkitBackdropFilter: "blur(24px) saturate(190%)",
          }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden shrink-0 w-9 h-9 rounded-xl border border-base-700/40 bg-base-800/40 hover:bg-base-700/60 flex items-center justify-center text-ink-400 hover:text-ink-200 transition-all duration-200"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="flex items-center gap-4 min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2 w-full max-w-sm">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  className="h-9 flex-1 min-w-0 rounded-xl glass-input px-3 text-sm text-ink-100 outline-none"
                />
                <button
                  onClick={saveName}
                  disabled={savingName}
                  className="shrink-0 h-9 px-3.5 rounded-xl btn-glass-primary text-xs font-semibold flex items-center gap-1.5"
                >
                  {savingName && <Spinner />}
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  disabled={savingName}
                  className="shrink-0 h-9 px-3 rounded-xl btn-glass text-ink-100 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                {currentPageTitle && (
                  <h1 className="text-base font-bold text-ink-100 truncate tracking-tight font-display">
                    {currentPageTitle}
                  </h1>
                )}
                {displayName && (
                  <button
                    onClick={() => {
                      setNameInput(profile?.full_name || "");
                      setNameError(null);
                      setEditingName(true);
                    }}
                    className="group flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-accent-400 transition-colors truncate sm:hidden"
                    title="Edit your name"
                  >
                    <span className="truncate">{displayName}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <path
                        d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            )}
            {nameError && (
              <span className="text-red-300 text-xs">{nameError}</span>
            )}
          </div>

          {/* Quick Header Actions: Search, System Status, Notifications, Theme Toggle, Role */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Quick search input pill button */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-base-900/60 border border-base-750/60 text-ink-400 text-xs w-48 hover:border-accent-500/40 hover:text-ink-200 transition-all duration-200 cursor-pointer text-left group"
              title="Search workspace (⌘K or Ctrl+K)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-hover:text-accent-400 transition-colors">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="truncate">Search workspace...</span>
              <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-base-800 border border-base-700 text-ink-500 group-hover:text-ink-300 transition-colors">⌘K</kbd>
            </button>

            {/* Notification bell button */}
            <button
              onClick={() => {
                localStorage.setItem("workwise_last_seen_notif", String(Date.now()));
                setHasUnreadNotifications(false);
                const targetPath = roleLabel.toLowerCase().includes("owner") || profile?.role === "owner" ? "/owner/notifications" : "/employee/notifications";
                navigate(targetPath);
              }}
              className="relative p-2 rounded-xl bg-base-800/40 border border-base-750/50 hover:bg-base-750/60 text-ink-400 hover:text-ink-100 transition-all duration-200 group"
              title="Notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-12 transition-transform">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {hasUnreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-400 shadow-[0_0_8px_rgba(45,212,191,0.8)] animate-pulse" />
              )}
            </button>

            <ThemeToggle />

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border shadow-sm font-spacex"
              style={{
                background: "linear-gradient(135deg, rgba(var(--c-accent-500), 0.12), rgba(var(--c-cobalt-500), 0.12))",
                borderColor: "rgba(var(--c-accent-500), 0.3)",
                color: "rgb(var(--c-accent-400))",
              }}>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
              {roleLabel}
            </span>
          </div>
        </header>

        {/* Page content — with subtle ambient background */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle dot grid */}
          <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
          {/* Ambient gradient spots */}
          <div className="absolute top-0 right-0 w-[500px] h-[400px] opacity-[0.03] pointer-events-none blur-3xl" style={{
            background: "radial-gradient(circle, rgba(var(--c-accent-500), 1) 0%, transparent 70%)"
          }} />
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global AI Assistant Chatbot */}
      <AIChatbotDrawer />

      {/* Global Command Palette / Search Workspace Modal */}
      <WorkspaceSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        roleLabel={roleLabel}
        profile={profile}
      />
    </div>
    </>
  );
}
