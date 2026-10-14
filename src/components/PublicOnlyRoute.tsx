import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import GlobalLoadingScreen from "./GlobalLoadingScreen";

export default function PublicOnlyRoute() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return <GlobalLoadingScreen />;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
