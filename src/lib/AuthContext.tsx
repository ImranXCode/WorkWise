import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type UserRole = "owner" | "admin" | "manager" | "hr" | "employee";

export type Profile = {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  department: string | null;
  designation: string | null;
  employee_code: string | null;
  phone: string | null;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  profileLoading: boolean;
  initializing: boolean;
  refreshProfile: () => Promise<void>;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean; alreadyExists: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  createOrganization: (
    name: string,
    slug: string
  ) => Promise<{ error: string | null }>;
  acceptInvitation: (token: string) => Promise<{ error: string | null }>;
  updateFullName: (name: string) => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Maps raw Supabase/Postgres error text to language a non-technical user can act on.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid input syntax for type uuid")) {
    return "Invalid invitation passcode format or code not found. Please check your employee passcode (e.g. GROK-0011) and try again.";
  }
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match our records.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email address before signing in — check your inbox.";
  }
  if (m.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (m.includes("duplicate key") && m.includes("slug")) {
    return "That workspace URL is already taken — try a different one.";
  }
  if (m.includes("row-level security policy") && m.includes("organizations")) {
    return "Permission denied: Row-level security prevented creating organization. Please run the fix migration in Supabase SQL Editor.";
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, organization_id, full_name, email, role, avatar_url, department, designation, employee_code, phone"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to load profile:", error.message);
      setProfile(null);
      setOrganization(null);
    } else {
      // null here just means "no profile yet" -- a normal state for a
      // brand-new user who hasn't finished onboarding.
      const p = data as Profile | null;
      setProfile(p);

      if (p?.organization_id) {
        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("id", p.organization_id)
          .maybeSingle();
        if (orgError) {
          console.error("Failed to load organization:", orgError.message);
          setOrganization(null);
        } else {
          setOrganization(org as Organization | null);
        }
      } else {
        setOrganization(null);
      }
    }
    setProfileLoading(false);
  }

  // Load (or clear) the profile row whenever who's signed in changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }
    loadProfile(userId);
  }, [session?.user?.id]);

  async function refreshProfile() {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  async function signUpWithPassword(
    email: string,
    password: string,
    fullName: string
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      return { error: friendlyAuthError(error.message), needsConfirmation: false, alreadyExists: false };
    }

    // Supabase returns user with empty identities[] when email is already taken
    // (it doesn't reveal this as an error for security, but we can detect it).
    const alreadyExists =
      !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;

    if (alreadyExists) {
      return {
        error: "An account with this email already exists. Try signing in instead.",
        needsConfirmation: false,
        alreadyExists: true,
      };
    }

    // If a session was returned, the user is auto-confirmed (no email needed)
    const needsConfirmation = !data.session;

    return { error: null, needsConfirmation, alreadyExists: false };
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/login",
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function createOrganization(name: string, slug: string) {
    // 1. Try SQL RPC function first
    const { error: rpcError } = await supabase.rpc("create_organization", {
      p_name: name,
      p_slug: slug,
    });

    if (!rpcError) {
      await refreshProfile();
      return { error: null };
    }

    console.warn("create_organization RPC error:", rpcError.message);

    // If it's a known validation error from the RPC, return it directly without running fallback
    const rpcMsg = rpcError.message || "";
    if (
      rpcMsg.includes("already belongs to an organization") ||
      rpcMsg.includes("Must be signed in") ||
      (rpcMsg.includes("duplicate key") && rpcMsg.includes("slug"))
    ) {
      return { error: friendlyAuthError(rpcMsg) };
    }

    const currentUser = session?.user;
    if (!currentUser) {
      return { error: friendlyAuthError(rpcError.message) };
    }

    try {
      // Step A: Insert organization with created_by = currentUser.id
      const { data: orgData, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name, slug, created_by: currentUser.id })
        .select("id")
        .single();

      let targetOrgId = orgData?.id;

      if (orgErr || !targetOrgId) {
        // Fallback: If currentUser.id is rejected by schema, try with created_by: null
        const { data: orgData2, error: orgErr2 } = await supabase
          .from("organizations")
          .insert({ name, slug, created_by: null })
          .select("id")
          .single();

        if (orgErr2 || !orgData2) {
          console.warn("createOrganization client fallback also failed:", orgErr2 || orgErr);
          // If fallback fails due to RLS, prefer the original rpcError so the real cause isn't masked
          const isRlsError = (orgErr2?.message || orgErr?.message || "").includes("row-level security");
          const errorToShow = isRlsError && rpcError.message ? rpcError.message : (orgErr2?.message || orgErr?.message || rpcError.message);
          return { error: friendlyAuthError(errorToShow) };
        }
        targetOrgId = orgData2.id;
      }

      // Step B: Upsert owner profile for the newly created organization
      const { error: profileErr } = await supabase.from("profiles").upsert({
        id: currentUser.id,
        organization_id: targetOrgId,
        email: currentUser.email || "",
        full_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || "",
        role: "owner",
      });

      if (profileErr) {
        console.error("Profile upsert warning:", profileErr.message);
      }

      // Step C: Link created_by on organizations table now that profile & user rows exist
      await supabase
        .from("organizations")
        .update({ created_by: currentUser.id })
        .eq("id", targetOrgId);

      await refreshProfile();
      return { error: null };
    } catch (fallbackErr: any) {
      return { error: friendlyAuthError(rpcError.message || fallbackErr.message) };
    }
  }

  async function acceptInvitation(token: string) {
    const { error } = await supabase.rpc("accept_invitation", {
      p_token: token,
    });
    if (error) return { error: friendlyAuthError(error.message) };
    await refreshProfile();
    return { error: null };
  }

  async function updateFullName(name: string) {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name },
    });
    // supabase-js fires onAuthStateChange (USER_UPDATED) on success, which
    // refreshes `session`/`user` automatically -- no manual refresh needed.
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        organization,
        profileLoading,
        initializing,
        refreshProfile,
        signInWithPassword,
        signUpWithPassword,
        signInWithGoogle,
        sendPasswordReset,
        signOut,
        createOrganization,
        acceptInvitation,
        updateFullName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
