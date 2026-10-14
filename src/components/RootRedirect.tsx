import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import GlobalLoadingScreen from "./GlobalLoadingScreen";

export default function RootRedirect() {
  const { session, user, profile, initializing, profileLoading } = useAuth();

  if (initializing || (session && profileLoading)) {
    return <GlobalLoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || !profile.organization_id) {
    const hasName = Boolean(
      user?.user_metadata?.full_name || user?.user_metadata?.name
    );
    if (!hasName) {
      return <Navigate to="/set-name" replace />;
    }

    // Signed in, has a name, but no profile/organization yet. If they were
    // on their way somewhere specific before being asked to sign in (e.g.
    // an invite link), send them back there instead of the generic
    // onboarding screen.
    const redirect = sessionStorage.getItem("post_login_redirect");
    if (redirect && redirect !== "/") {
      sessionStorage.removeItem("post_login_redirect");
      return <Navigate to={redirect} replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  return <Navigate to={`/${profile.role}/dashboard`} replace />;
}
