import React, { useState } from "react";
import { User } from "../data/mockData";
import { api } from "../config";
import { toast } from "sonner";
import { Eye, EyeOff, Menu, X } from "lucide-react";

interface RegisterPageProps {
  navigate: (page: string, user?: User) => void;
}

export function RegisterPage({ navigate }: RegisterPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role] = useState<"user" | "admin">("user"); // Force user role
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      errs.password = "Password must contain uppercase, lowercase, and a number";
    }
    if (!confirmPassword) errs.confirmPassword = "Please confirm your password";
    else if (password !== confirmPassword) errs.confirmPassword = "Passwords do not match";
    return errs;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);

    try {
      // Call backend registration API
      const res = await fetch(api("/api/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        
        // Check if registration endpoint returns token (some do)
        if (data.token) {
          const regUser = data.user;
          // Server doesn't return created_at on register, so set it to now
          if (!regUser.createdAt && !regUser.created_at) {
            regUser.createdAt = new Date().toISOString();
          } else if (regUser.created_at && !regUser.createdAt) {
            regUser.createdAt = regUser.created_at;
          }
          sessionStorage.setItem("token", data.token);
          sessionStorage.setItem("user", JSON.stringify(regUser));
          navigate("user-dashboard", regUser);
        } else {
          // If not, prompt user to login
          setErrors({});
          toast.success("Registration successful! Please login.");
          navigate("login");
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setErrors({ email: errorData.error || "Registration failed. Email may already be registered." });
      }
    } catch (err) {
      setErrors({ email: "Backend server is unavailable. Please try again." });
      console.error("Registration error:", err);
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
          <button className="lp-nav-btn-outline" onClick={() => navigate("login")}>Sign In</button>
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
        <div className="auth-container auth-container-wide">
          <div className="auth-back-row">
            <button className="auth-back-btn" onClick={() => navigate("landing")}>
              ← Back to Home
            </button>
          </div>
          <div className="auth-card">
            <div className="auth-card-header">
              <h1 className="auth-title">Create Account</h1>
              <p className="auth-subtitle">Register to start booking courts</p>
            </div>
            <form onSubmit={handleRegister}>
            {/* Full Name */}
            <div className="form-group">
              <label className="form-label">
                Full Name <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Fadzil Daniel"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }}
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label">
                Email Address <span className="required">*</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }}
              />
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label">
                Password <span className="required">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
                  className="form-input form-input-with-toggle"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle-btn"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && (() => {
                let score = 0;
                if (password.length >= 8) score++;
                if (/[A-Z]/.test(password)) score++;
                if (/[a-z]/.test(password)) score++;
                if (/\d/.test(password)) score++;
                const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
                const cls = score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";
                return (
                  <div className="pw-strength">
                    <div className="pw-strength-bar">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`pw-strength-seg${score >= i ? ` ${cls}` : ""}`} />
                      ))}
                    </div>
                    <span className={`pw-strength-label ${cls}`}>{label}</span>
                  </div>
                );
              })()}
              {errors.password && <p className="form-error">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div className="form-group">
              <label className="form-label">
                Confirm Password <span className="required">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: "" })); }}
                  className="form-input form-input-with-toggle"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="password-toggle-btn"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg btn-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin-icon">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creating account...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Create Account
                </>
              )}
            </button>
          </form>
          </div>
          <div className="auth-footer">
            Already have an account?{" "}
            <button className="auth-link" onClick={() => navigate("login")}>
              Sign in here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
