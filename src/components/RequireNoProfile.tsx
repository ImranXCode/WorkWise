import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import GlobalLoadingScreen from "./GlobalLoadingScreen";

export default function RequireNoProfile() {
  const { session, user, profile, initializing, profileLoading } = useAuth();
  const location = useLocation();

  // If we're about to bounce someone to /login, remember where they were
  // trying to go (e.g. /accept-invite?token=...) so we can send them back
  // here -- not to the generic onboarding screen -- once they're signed in.
  useEffect(() => {
    if (!initializing && !session) {
      sessionStorage.setItem(
        "post_login_redirect",
        location.pathname + location.search
      );
    }
  }, [initializing, session, location.pathname, location.search]);

  if (initializing || (session && profileLoading)) {
    return <GlobalLoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && profile.organization_id) {
    // Already onboarded -- nothing to do here, send them to their dashboard.
    return <Navigate to={`/${profile.role}/dashboard`} replace />;
  }

  const hasName = Boolean(
    user?.user_metadata?.full_name || user?.user_metadata?.name
  );
  if (!hasName && location.pathname !== "/set-name") {
    return <Navigate to="/set-name" replace />;
  }

  return <Outlet />;
}
