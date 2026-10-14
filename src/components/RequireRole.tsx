import { Navigate, Outlet } from "react-router-dom";
import { useAuth, UserRole } from "../lib/AuthContext";
import GlobalLoadingScreen from "./GlobalLoadingScreen";

export default function RequireRole({ roles }: { roles: UserRole[] }) {
  const { session, profile, initializing, profileLoading } = useAuth();

  if (initializing || (session && profileLoading)) {
    return <GlobalLoadingScreen />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || !profile.organization_id) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!roles.includes(profile.role)) {
    // Logged in, in an org, but wrong section for their role.
    return <Navigate to={`/${profile.role}/dashboard`} replace />;
  }

  return <Outlet />;
}
