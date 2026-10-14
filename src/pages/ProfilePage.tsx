import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();

  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDepartment(profile.department ?? "");
    setDesignation(profile.designation ?? "");
    setPhone(profile.phone ?? "");
    setLoading(false);
  }, [profile]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("profiles")
      .update({
        department: department.trim() || null,
        designation: designation.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    await refreshProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-ink-300 text-sm">
        <Spinner />
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>MY PROFILE & SETTINGS</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-widest">
            PERSONAL IDENTITY
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          Your personal telemetry details and workplace metadata identity profile.
        </p>
      </div>

      <div className="glass-card p-6 lg:p-8 rounded-3xl space-y-4 shadow-2xl">
        <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex mb-4">Account Overview</h2>
        <div className="flex justify-between items-center text-xs py-2.5 border-b border-white/5">
          <span className="text-ink-400">Employee Passcode ID</span>
          <span className="text-accent-400 font-mono font-bold text-sm">{profile?.employee_code || "—"}</span>
        </div>
        <div className="flex justify-between items-center text-xs py-2.5 border-b border-white/5">
          <span className="text-ink-400">Full Name</span>
          <span className="text-ink-100 font-semibold text-sm">{profile?.full_name || "—"}</span>
        </div>
        <div className="flex justify-between items-center text-xs py-2.5 border-b border-white/5">
          <span className="text-ink-400">Email Address</span>
          <span className="text-ink-200 font-mono text-sm">{profile?.email}</span>
        </div>
        <div className="flex justify-between items-center text-xs py-2.5">
          <span className="text-ink-400">Role & Access</span>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-wider font-spacex">
            {profile?.role}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="glass-card p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl">
        <h2 className="text-xs font-bold text-ink-400 uppercase tracking-widest font-spacex">Workplace Metadata</h2>

        <div>
          <label
            htmlFor="department"
            className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex"
          >
            Department
          </label>
          <input
            id="department"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Software Engineering"
            className="w-full h-11 rounded-xl glass-input px-3.5 text-xs text-ink-100 placeholder:text-ink-500 outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="designation"
            className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex"
          >
            Designation
          </label>
          <input
            id="designation"
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. Senior Software Architect"
            className="w-full h-11 rounded-xl glass-input px-3.5 text-xs text-ink-100 placeholder:text-ink-500 outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="phone"
            className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex"
          >
            Contact Phone Number
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +1 555 019 2831"
            className="w-full h-11 rounded-xl glass-input px-3.5 text-xs text-ink-100 placeholder:text-ink-500 outline-none"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-400">
            ✓ Profile details updated successfully.
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-glass-primary h-11 px-6 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Spinner />}
            Save Profile Details
          </button>
        </div>
      </form>
    </div>
  );
}

