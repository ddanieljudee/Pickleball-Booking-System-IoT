import React, { useState } from "react";
import { User } from "../data/mockData";
import { api } from "../config";
import { toast } from "sonner";
import { Eye, EyeOff, Menu, X } from "lucide-react";

interface LoginPageProps {
  navigate: (page: string, user?: User) => void;
}

export function LoginPage({ navigate }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Call the backend API
      const res = await fetch(api("/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const { token, user } = data;
        
        // Map snake_case from API to camelCase for frontend
        if (user.created_at && !user.createdAt) {
          user.createdAt = user.created_at;
        }
        
        // Store JWT token and user in sessionStorage (auto-clears on browser close)
        sessionStorage.setItem("token", token);
        sessionStorage.setItem("user", JSON.stringify(user));
        
        if (user.role === "admin") {
          navigate("admin-dashboard", user);
        } else {
          navigate("user-dashboard", user);
        }
      } else {
        // Handle authentication errors
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || "Login failed. Please try again.");
      }
    } catch (err) {
      // Backend is unavailable - show maintenance message
      console.error('Login error:', err);
      setError(
        "Backend server is currently unavailable. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Shared Navbar */}
      <header className="auth-nav">
        <div className="lp-brand">
          <div className="lp-brand-icon">PB</div>
          <div>
            <h1 className="lp-brand-name">Pickleball Pro</h1>
            <p className="lp-brand-sub">Court Booking</p>
          </div>
        </div>
        <nav className="lp-nav">
          <button className="lp-nav-link" onClick={() => navigate("guest-dashboard")}>Browse Courts</button>
          <button className="lp-nav-btn-outline-active" onClick={() => navigate("login")}>Sign In</button>
          <button className="lp-nav-btn-primary" onClick={() => navigate("register")}>Get Started</button>
        </nav>
        <button className="lp-hamburger" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </header>

      {/* Mobile nav overlay */}
      {mobileMenuOpen && <div className="lp-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <nav className={`lp-mobile-nav${mobileMenuOpen ? ' open' : ''}`}>
        <div className="lp-mobile-nav-header">
          <div className="lp-brand">
            <div className="lp-brand-icon">PB</div>
            <div>
              <h1 className="lp-brand-name">Pickleball Pro</h1>
              <p className="lp-brand-sub">Court Booking</p>
            </div>
          </div>
          <button className="lp-mobile-nav-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="lp-mobile-nav-links">
          <button className="lp-mobile-nav-link" onClick={() => { navigate("guest-dashboard"); setMobileMenuOpen(false); }}>Browse Courts</button>
          <button className="lp-mobile-nav-link" onClick={() => { navigate("login"); setMobileMenuOpen(false); }}>Sign In</button>
          <button className="lp-mobile-nav-btn-primary" onClick={() => { navigate("register"); setMobileMenuOpen(false); }}>Get Started Free</button>
        </div>
      </nav>

      <div className="auth-page-body">
        <div className="auth-container">
          <div className="auth-back-row">
            <button className="auth-back-btn" onClick={() => navigate("landing")}>
              ← Back to Home
            </button>
          </div>
          <div className="auth-card">
            <div className="auth-card-header">
              <h1 className="auth-title">Sign In</h1>
              <p className="auth-subtitle">Access your booking account</p>
            </div>
            {error && (
              <div className="alert alert-danger">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">
                  Email Address <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Password <span className="required">*</span>
                </label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-input form-input-with-toggle"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle-btn"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="forgot-password-row">
                <button
                  type="button"
                  className="forgot-link"
                  onClick={() => toast.info("Password reset is not yet available in this version.")}
                >
                  Forgot Password?
                </button>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin-icon">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
          <div className="auth-footer">
            Don't have an account?{" "}
            <button className="auth-link" onClick={() => navigate("register")}>
              Create one here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
