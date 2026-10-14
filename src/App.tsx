import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import { ThemeProvider } from "./lib/ThemeContext";
import PublicOnlyRoute from "./components/PublicOnlyRoute";
import RequireRole from "./components/RequireRole";
import RequireNoProfile from "./components/RequireNoProfile";
import RootRedirect from "./components/RootRedirect";
import RoleShell from "./components/RoleShell";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import SetNamePage from "./pages/SetNamePage";
import CreateCompanyPage from "./pages/CreateCompanyPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import PlaceholderPage from "./pages/PlaceholderPage";
import EmployeesPage from "./pages/EmployeesPage";
import AttendancePage from "./pages/AttendancePage";
import FaceRegisterPage from "./pages/FaceRegisterPage";
import ActivityPage from "./pages/ActivityPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import EmployeeDashboardPage from "./pages/EmployeeDashboardPage";
import ProfilePage from "./pages/ProfilePage";
import WellbeingPage from "./pages/WellbeingPage";
import NotificationsPage from "./pages/NotificationsPage";
import TasksPage from "./pages/TasksPage";
import EmployeeTasksPage from "./pages/EmployeeTasksPage";
import StressMonitoringPage from "./pages/StressMonitoringPage";

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard" },
  { label: "Tasks", to: "/owner/tasks" },
  { label: "Employees", to: "/owner/employees" },
  { label: "Attendance", to: "/owner/attendance" },
  { label: "Stress Monitoring", to: "/owner/stress" },
  { label: "Activity", to: "/owner/activity" },
  { label: "Reports", to: "/owner/reports" },
  { label: "Wellbeing", to: "/owner/wellbeing" },
  { label: "Notifications", to: "/owner/notifications" },
  { label: "Company Settings", to: "/owner/settings" },
];

const adminNav = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Tasks", to: "/admin/tasks" },
  { label: "Employees", to: "/admin/employees" },
  { label: "Attendance", to: "/admin/attendance" },
  { label: "Stress Monitoring", to: "/admin/stress" },
  { label: "Activity", to: "/admin/activity" },
  { label: "Reports", to: "/admin/reports" },
  { label: "Wellbeing", to: "/admin/wellbeing" },
  { label: "Notifications", to: "/admin/notifications" },
  { label: "Settings", to: "/admin/settings" },
];

const managerNav = [
  { label: "Dashboard", to: "/manager/dashboard" },
  { label: "Tasks", to: "/manager/tasks" },
  { label: "Team Members", to: "/manager/employees" },
  { label: "Attendance", to: "/manager/attendance" },
  { label: "Stress Monitoring", to: "/manager/stress" },
  { label: "Activity", to: "/manager/activity" },
  { label: "Reports", to: "/manager/reports" },
  { label: "Wellbeing", to: "/manager/wellbeing" },
  { label: "Notifications", to: "/manager/notifications" },
  { label: "Settings", to: "/manager/settings" },
];

const hrNav = [
  { label: "Dashboard", to: "/hr/dashboard" },
  { label: "Employees & Onboarding", to: "/hr/employees" },
  { label: "Attendance Logs", to: "/hr/attendance" },
  { label: "Tasks", to: "/hr/tasks" },
  { label: "Stress Analytics", to: "/hr/stress" },
  { label: "Workplace Activity", to: "/hr/activity" },
  { label: "HR Reports", to: "/hr/reports" },
  { label: "Wellbeing", to: "/hr/wellbeing" },
  { label: "Notifications", to: "/hr/notifications" },
  { label: "Settings", to: "/hr/settings" },
];

const employeeNav = [
  { label: "My Dashboard", to: "/employee/dashboard" },
  { label: "My Tasks", to: "/employee/tasks" },
  { label: "My Attendance", to: "/employee/attendance" },
  { label: "My Stress", to: "/employee/stress" },
  { label: "My Activity", to: "/employee/activity" },
  { label: "Wellbeing", to: "/employee/wellbeing" },
  { label: "Notifications", to: "/employee/notifications" },
  { label: "My Profile", to: "/employee/profile" },
];

// Builds one <Route> per nav item. Employees, Tasks, Attendance, Activity,
// Reports, Settings, Profile, and both Dashboards have real pages.
function placeholderRoutes(
  items: { label: string; to: string }[],
  phase: string,
  includeDashboard: boolean
) {
  return items.map((item) => {
    let element = <PlaceholderPage title={item.label} phase={phase} />;
    if (item.to.endsWith("/tasks") && includeDashboard) {
      element = <TasksPage />;
    } else if (item.to.endsWith("/tasks") && !includeDashboard) {
      element = <EmployeeTasksPage />;
    } else if (item.to.endsWith("/employees")) {
      element = <EmployeesPage />;
    } else if (item.to.endsWith("/attendance")) {
      element = <AttendancePage />;
    } else if (item.to.endsWith("/activity")) {
      element = <ActivityPage />;
    } else if (item.to.endsWith("/reports")) {
      element = <ReportsPage />;
    } else if (item.to.endsWith("/settings")) {
      element = <SettingsPage />;
    } else if (item.to.endsWith("/profile")) {
      element = <ProfilePage />;
    } else if (item.to.endsWith("/wellbeing")) {
      element = <WellbeingPage />;
    } else if (includeDashboard && item.to.endsWith("/dashboard")) {
      element = <DashboardPage />;
    } else if (!includeDashboard && item.to.endsWith("/dashboard")) {
      element = <EmployeeDashboardPage />;
    } else if (item.to.endsWith("/notifications")) {
      element = <NotificationsPage />;
    } else if (item.to.endsWith("/stress")) {
      element = <StressMonitoringPage />;
    }
    return <Route key={item.to} path={item.to} element={element} />;
  });
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          {/* Onboarding -- signed in, but not yet linked to an organization */}
          <Route element={<RequireNoProfile />}>
            <Route path="/set-name" element={<SetNamePage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/create-company" element={<CreateCompanyPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
          </Route>

          {/* Owner section */}
          <Route element={<RequireRole roles={["owner"]} />}>
            <Route element={<RoleShell navItems={ownerNav} roleLabel="Owner" />}>
              {placeholderRoutes(ownerNav, "later phases", true)}
            </Route>
          </Route>

          {/* Admin section */}
          <Route element={<RequireRole roles={["admin"]} />}>
            <Route element={<RoleShell navItems={adminNav} roleLabel="Admin" />}>
              {placeholderRoutes(adminNav, "later phases", true)}
            </Route>
          </Route>

          {/* Manager section */}
          <Route element={<RequireRole roles={["manager"]} />}>
            <Route element={<RoleShell navItems={managerNav} roleLabel="Manager" />}>
              {placeholderRoutes(managerNav, "later phases", true)}
            </Route>
          </Route>

          {/* HR section */}
          <Route element={<RequireRole roles={["hr"]} />}>
            <Route element={<RoleShell navItems={hrNav} roleLabel="HR Specialist" />}>
              {placeholderRoutes(hrNav, "later phases", true)}
            </Route>
          </Route>

          {/* Employee section */}
          <Route element={<RequireRole roles={["employee"]} />}>
            <Route element={<RoleShell navItems={employeeNav} roleLabel="Employee" />}>
              {placeholderRoutes(employeeNav, "later phases", false)}
              <Route path="/face-register" element={<FaceRegisterPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
