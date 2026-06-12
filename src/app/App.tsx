import React, { Suspense, useState } from "react";
import { Toaster } from "sonner";
import "../styles/pickleball.css";
import { User } from "./data/mockData";
import { isTokenExpired } from "./config";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

const LandingPage = React.lazy(() =>
  import("./components/LandingPage").then((module) => ({ default: module.LandingPage }))
);
const LoginPage = React.lazy(() =>
  import("./components/LoginPage").then((module) => ({ default: module.LoginPage }))
);
const RegisterPage = React.lazy(() =>
  import("./components/RegisterPage").then((module) => ({ default: module.RegisterPage }))
);
const GuestDashboard = React.lazy(() =>
  import("./components/GuestDashboard").then((module) => ({ default: module.GuestDashboard }))
);
const UserDashboard = React.lazy(() =>
  import("./components/UserDashboard").then((module) => ({ default: module.UserDashboard }))
);
const AdminDashboard = React.lazy(() =>
  import("./components/AdminDashboard").then((module) => ({ default: module.AdminDashboard }))
);

// Application pages
type Page =
  | "landing"
  | "login"
  | "register"
  | "guest-dashboard"
  | "user-dashboard"
  | "admin-dashboard";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    // restore page on reload (cleared when browser closes)
    const savedPage = sessionStorage.getItem("pb_page");
    return (savedPage as Page) || "landing";
  });
  
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // restore session on reload (cleared when browser closes)
    const savedUser = sessionStorage.getItem("user") || sessionStorage.getItem("pb_user");
    if (!savedUser) return null;
    // clear expired sessions
    if (isTokenExpired()) {
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("pb_user");
      sessionStorage.removeItem("pb_page");
      return null;
    }
    return JSON.parse(savedUser);
  });

  // navigate to a page, optionally set user
  const navigate = (page: string, user?: User) => {
    setCurrentPage(page as Page);
    sessionStorage.setItem("pb_page", page);
    
    if (user) {
      setCurrentUser(user);
      sessionStorage.setItem("user", JSON.stringify(user));
      sessionStorage.setItem("pb_user", JSON.stringify(user));
    } else if (page === "landing") {
      setCurrentUser(null);
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("pb_user");
    }
    window.scrollTo(0, 0);
  };

  // Page Router
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors closeButton />
      <div className="pb-app">
        <Suspense
          fallback={
            <div className="page-enter page-contents">
              <div className="loading-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner">
                  <path d="M21 12a9 9 0 1 1-6.218-8.182" />
                </svg>
                <p className="loading-text">Loading page...</p>
              </div>
            </div>
          }
        >
          <div key={currentPage} className="page-enter page-contents">
          {currentPage === "landing" && (
            <LandingPage navigate={navigate} />
          )}

          {currentPage === "login" && (
            <LoginPage navigate={navigate} />
          )}

          {currentPage === "register" && (
            <RegisterPage navigate={navigate} />
          )}

          {currentPage === "guest-dashboard" && (
            <GuestDashboard navigate={navigate} />
          )}

          {currentPage === "user-dashboard" && currentUser?.role === "admin" && (
            <AdminDashboard user={currentUser} navigate={navigate} />
          )}

          {currentPage === "user-dashboard" && currentUser && currentUser.role !== "admin" && (
            <UserDashboard user={currentUser} navigate={navigate} />
          )}

          {currentPage === "admin-dashboard" && currentUser?.role === "admin" && (
            <AdminDashboard user={currentUser} navigate={navigate} />
          )}

          {/* Fallback if somehow a protected route is accessed without user */}
          {(currentPage === "user-dashboard" || currentPage === "admin-dashboard") && (!currentUser || (currentPage === "admin-dashboard" && currentUser.role !== "admin")) && currentUser?.role !== "admin" && (
            <LandingPage navigate={navigate} />
          )}
          </div>
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
