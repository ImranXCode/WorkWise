import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Profile } from "../lib/AuthContext";

type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  category: "Navigation" | "Employee" | "Task";
  to: string;
  icon: string;
};

type WorkspaceSearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  roleLabel: string;
  profile: Profile | null;
};

export default function WorkspaceSearchModal({
  isOpen,
  onClose,
  roleLabel,
  profile,
}: WorkspaceSearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dbResults, setDbResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  const isOwnerOrAdmin =
    roleLabel.toLowerCase().includes("owner") ||
    roleLabel.toLowerCase().includes("admin") ||
    roleLabel.toLowerCase().includes("manager") ||
    roleLabel.toLowerCase().includes("hr") ||
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    profile?.role === "manager" ||
    profile?.role === "hr";

  const prefix = profile?.role ? `/${profile.role}` : "/employee";

  // Predefined navigation items
  const baseNavItems: SearchResultItem[] = isOwnerOrAdmin
    ? [
        {
          id: "nav-dash",
          title: "Dashboard",
          subtitle: "Overview metrics, attendance rates & active staff",
          category: "Navigation",
          to: `${prefix}/dashboard`,
          icon: "📊",
        },
        {
          id: "nav-tasks",
          title: "Tasks & Projects",
          subtitle: "Manage company tasks, assignees & deadlines",
          category: "Navigation",
          to: `${prefix}/tasks`,
          icon: "📋",
        },
        {
          id: "nav-emp",
          title: "Employee Directory",
          subtitle: "Manage staff, roles & passcodes",
          category: "Navigation",
          to: `${prefix}/employees`,
          icon: "👥",
        },
        {
          id: "nav-att",
          title: "Attendance Logs",
          subtitle: "Face verification records & live attendance",
          category: "Navigation",
          to: `${prefix}/attendance`,
          icon: "⏱️",
        },
        {
          id: "nav-stress",
          title: "Stress Monitoring",
          subtitle: "AI workplace sentiment & stress analytics",
          category: "Navigation",
          to: `${prefix}/stress`,
          icon: "🧠",
        },
        {
          id: "nav-wellbeing",
          title: "Wellbeing & Breaks",
          subtitle: "Break tracking & stress relief insights",
          category: "Navigation",
          to: `${prefix}/wellbeing`,
          icon: "💚",
        },
        {
          id: "nav-notif",
          title: "Notifications & Dispatches",
          subtitle: "Company announcements & system alerts",
          category: "Navigation",
          to: `${prefix}/notifications`,
          icon: "🔔",
        },
        {
          id: "nav-[#sett]",
          title: "Company Settings",
          subtitle: "Geofencing, organization info & security",
          category: "Navigation",
          to: `${prefix}/settings`,
          icon: "⚙️",
        },
      ]
    : [
        {
          id: "nav-emp-dash",
          title: "My Dashboard",
          subtitle: "Personal attendance, tasks & stress status",
          category: "Navigation",
          to: "/employee/dashboard",
          icon: "📊",
        },
        {
          id: "nav-emp-tasks",
          title: "My Tasks",
          subtitle: "View assigned work and update progress",
          category: "Navigation",
          to: "/employee/tasks",
          icon: "📋",
        },
        {
          id: "nav-emp-att",
          title: "My Attendance",
          subtitle: "Face check-in/out and monthly record",
          category: "Navigation",
          to: "/employee/attendance",
          icon: "⏱️",
        },
        {
          id: "nav-emp-stress",
          title: "My Stress Status",
          subtitle: "AI stress detection and wellness checks",
          category: "Navigation",
          to: "/employee/stress",
          icon: "🧠",
        },
        {
          id: "nav-emp-prof",
          title: "My Profile",
          subtitle: "Employee passcode, details & face registration",
          category: "Navigation",
          to: "/employee/profile",
          icon: "👤",
        },
      ];

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search DB for employees and tasks when query changes
  useEffect(() => {
    if (!query.trim()) {
      setDbResults([]);
      return;
    }

    let isSubscribed = true;
    setSearching(true);

    async function searchDatabase() {
      try {
        const q = query.trim();
        const results: SearchResultItem[] = [];

        // Search profiles/employees if owner/admin
        if (isOwnerOrAdmin) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, designation")
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,designation.ilike.%${q}%`)
            .limit(5);

          if (profilesData && isSubscribed) {
            profilesData.forEach((p) => {
              results.push({
                id: `emp-${p.id}`,
                title: p.full_name || p.email,
                subtitle: `Role: ${p.role} ${p.designation ? `• ${p.designation}` : ""}`,
                category: "Employee",
                to: `${prefix}/employees`,
                icon: "👤",
              });
            });
          }
        }

        // Search tasks
        const { data: tasksData } = await supabase
          .from("tasks")
          .select("id, title, status, priority")
          .ilike("title", `%${q}%`)
          .limit(5);

        if (tasksData && isSubscribed) {
          tasksData.forEach((t) => {
            results.push({
              id: `task-${t.id}`,
              title: t.title,
              subtitle: `Status: ${t.status} • Priority: ${t.priority}`,
              category: "Task",
              to: `${prefix}/tasks`,
              icon: "📌",
            });
          });
        }

        if (isSubscribed) {
          setDbResults(results);
          setSearching(false);
        }
      } catch {
        if (isSubscribed) setSearching(false);
      }
    }

    const timer = setTimeout(searchDatabase, 200);
    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [query, isOwnerOrAdmin, prefix]);

  // Combined results
  const filteredNav = baseNavItems.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase())
  );
  const allResults = [...filteredNav, ...dbResults];

  // Handle Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allResults.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allResults.length) % Math.max(1, allResults.length));
    } else if (e.key === "Enter" && allResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(allResults[selectedIndex]);
    }
  };

  const handleSelect = (item: SearchResultItem) => {
    navigate(item.to);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4 bg-base-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-base-900 border border-base-700/80 shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-base-750/70 bg-base-850/50">
          <svg
            className="w-5 h-5 text-accent-400 shrink-0 mr-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search pages, employees, tasks, dispatches..."
            className="w-full bg-transparent text-ink-100 placeholder:text-ink-500 text-sm font-medium outline-none"
          />
          {searching ? (
            <span className="text-xs text-accent-400 animate-pulse font-mono shrink-0 ml-2">Searching...</span>
          ) : (
            <kbd className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-base-800 border border-base-700 text-ink-400 shrink-0 ml-2">
              ESC to close
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {allResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-400">
              No matching results found for "<span className="text-ink-200">{query}</span>"
            </div>
          ) : (
            allResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-150 text-left ${
                    isSelected
                      ? "bg-accent-500/15 border border-accent-500/30 text-ink-100"
                      : "hover:bg-base-800/60 border border-transparent text-ink-300"
                  }`}
                >
                  <span className="text-xl shrink-0 leading-none">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-ink-100 truncate">{item.title}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-base-800 text-ink-400 uppercase tracking-wider shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-400 truncate mt-0.5">{item.subtitle}</p>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-accent-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer tip */}
        <div className="px-4 py-2.5 bg-base-950/60 border-t border-base-800 flex items-center justify-between text-[11px] text-ink-500">
          <span>Navigate with <kbd className="px-1.5 py-0.5 bg-base-800 rounded border border-base-700 font-mono text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 bg-base-800 rounded border border-base-700 font-mono text-[10px]">↓</kbd></span>
          <span>Press <kbd className="px-1.5 py-0.5 bg-base-800 rounded border border-base-700 font-mono text-[10px]">ENTER</kbd> to open</span>
        </div>
      </div>
    </div>
  );
}
