import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Spinner } from "../components/icons";

type Org = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  company_size: string | null;
  employee_limit: number;
  subscription_plan: string;
  subscription_status: string;
  geofence_lat: number | null;
  geofence_lon: number | null;
  geofence_radius_meters: number;
  geofencing_enabled: boolean;
};

function GeofenceSettings({ org, onSaved }: { org: Org; onSaved: (o: Partial<Org>) => void }) {
  const [lat, setLat] = useState(org.geofence_lat?.toString() ?? "");
  const [lon, setLon] = useState(org.geofence_lon?.toString() ?? "");
  const [radius, setRadius] = useState(org.geofence_radius_meters.toString());
  const [enabled, setEnabled] = useState(org.geofencing_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
      },
      (err) => setError(err.message)
    );
  }

  async function save() {
    setError(null);
    setSaving(true);
    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLon = lon.trim() ? Number(lon) : null;
    const { error } = await supabase.rpc("update_geofence", {
      p_lat: parsedLat,
      p_lon: parsedLon,
      p_radius_meters: Number(radius) || 150,
      p_enabled: enabled,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved({ geofence_lat: parsedLat, geofence_lon: parsedLon, geofence_radius_meters: Number(radius), geofencing_enabled: enabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-2xl glass-card p-6 border border-base-750/50 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-ink-100 font-bold text-sm uppercase tracking-wider font-spacex">Office Geofence Security</h2>
          <p className="text-ink-400 text-xs mt-0.5">
            Require employee GPS check-in verification within target radius.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-accent-400 cursor-pointer bg-accent-500/10 px-3 py-1.5 rounded-xl border border-accent-500/20">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-teal-500" />
          Geofencing Enforcement
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-ink-300 mb-1.5 font-mono uppercase">Latitude</label>
          <input
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="12.9716"
            className="w-full h-10 rounded-xl glass-input px-3 text-xs text-ink-100 font-mono outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-ink-300 mb-1.5 font-mono uppercase">Longitude</label>
          <input
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="77.5946"
            className="w-full h-10 rounded-xl glass-input px-3 text-xs text-ink-100 font-mono outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-ink-300 mb-1.5 font-mono uppercase">Radius (meters)</label>
          <input
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            className="w-full h-10 rounded-xl glass-input px-3 text-xs text-ink-100 font-mono outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400 font-semibold">
          ✓ Geofence telemetry parameters saved.
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-base-750/50">
        <button
          type="button"
          onClick={useCurrentLocation}
          className="text-xs font-semibold text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Acquire Current GPS Coordinates
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-glass-primary h-9 px-4 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          {saving ? "Saving…" : "Save Geofence"}
        </button>
      </div>
    </div>
  );
}


export default function SettingsPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const isAdmin = profile?.role === "admin";

  const [org, setOrg] = useState<Org | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select(
          "id, name, slug, industry, company_size, employee_limit, subscription_plan, subscription_status, geofence_lat, geofence_lon, geofence_radius_meters, geofencing_enabled"
        )
        .single();

      if (error) {
        setError(error.message);
      } else if (data) {
        const o = data as Org;
        setOrg(o);
        setName(o.name);
        setIndustry(o.industry ?? "");
        setCompanySize(o.company_size ?? "");
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError("Company name can't be empty.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: name.trim(),
        industry: industry.trim() || null,
        company_size: companySize.trim() || null,
      })
      .eq("id", org.id);
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-ink-500 text-sm">
        <Spinner />
        Loading…
      </div>
    );
  }

  if (error && !org) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8 animate-fade-in-up">
      <div>
        <h1 className="font-spacex text-xl lg:text-2xl font-bold text-ink-100 uppercase tracking-wider flex items-center gap-3">
          <span>COMPANY SETTINGS</span>
          <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-accent-500/15 text-accent-400 border border-accent-500/30 uppercase tracking-widest font-spacex">
            ORGANIZATION CORE
          </span>
        </h1>
        <p className="text-ink-400 text-xs mt-1.5 leading-relaxed">
          {isOwner
            ? "Manage organization profile, workspace parameters, and geofencing policies."
            : "Your organization's configuration. Only the owner can edit these parameters."}
        </p>
      </div>

      <div className="rounded-2xl glass-card p-6 border border-base-750/50 shadow-2xl">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex">
              Company Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
              className="w-full h-11 rounded-xl glass-input px-3.5 text-sm text-ink-100 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex">
              Workspace Domain Slug
            </label>
            <div className="h-11 rounded-xl bg-base-950/80 border border-base-750 px-3.5 flex items-center text-sm font-mono text-ink-400">
              workwise.app/<span className="text-accent-400 font-bold">{org?.slug}</span>
            </div>
            <p className="text-ink-500 text-[11px] mt-1.5">
              The workspace URL slug is immutably bound to your company ID.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex">
                Industry
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. Software & Technology"
                className="w-full h-11 rounded-xl glass-input px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-wider font-spacex">
                Company Size
              </label>
              <input
                type="text"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. 10-50 Employees"
                className="w-full h-11 rounded-xl glass-input px-3.5 text-sm text-ink-100 placeholder:text-ink-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}
          {saved && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-400">
              ✓ Organization profile updated successfully.
            </div>
          )}

          {isOwner && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="btn-glass-primary h-11 px-6 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <Spinner />
                    Saving changes...
                  </>
                ) : (
                  "Save Organization Details"
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {(isOwner || isAdmin) && org && (
        <div className="mt-6">
          <GeofenceSettings org={org} onSaved={(patch) => setOrg({ ...org, ...patch } as Org)} />
        </div>
      )}
    </div>
  );
}

