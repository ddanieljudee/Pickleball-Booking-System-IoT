import React, { useState } from "react";
import { User } from "../data/mockData";
import { api } from "../config";
import { Eye, EyeOff, X } from "lucide-react";

interface RegisterAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdminToken: string;
  onSuccess?: (newAdmin: User) => void;
}

export function RegisterAdminModal({
  isOpen,
  onClose,
  currentAdminToken,
  onSuccess
}: RegisterAdminModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Enter a valid email address";
    }
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    }
    else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      errs.password = "Password must contain uppercase, lowercase, and a number";
    }
    if (!confirmPassword) errs.confirmPassword = "Please confirm your password";
    else if (password !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }
    return errs;
  };

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    setSuccessMessage("");

    try {
      // Call backend API to create new admin (requires admin token)
      const res = await fetch(api("/api/users"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentAdminToken}`
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role: "admin"
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMessage(
          `Admin account created successfully for ${data.user.email}. They can now login with their credentials.`
        );
        
        // Reset form
        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setErrors({});
        
        // Call success callback if provided
        if (onSuccess) {
          onSuccess(data.user);
        }
        
        // Auto-close modal after 2 seconds
        setTimeout(() => {
          onClose();
          setSuccessMessage("");
        }, 2000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setErrors({ 
          email: errorData.error || "Failed to create admin account" 
        });
      }
    } catch (err) {
      setErrors({ 
        email: "Backend server is unavailable. Please try again." 
      });
      console.error("Admin registration error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="reg-admin-overlay">
      <div className="reg-admin-box">
        {/* Close button */}
        <button onClick={onClose} className="reg-admin-close" aria-label="Close">
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="reg-admin-header">
          <h2 className="reg-admin-title">Register New Admin Account</h2>
          <p className="reg-admin-desc">
            Create a new admin account with full dashboard access.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="reg-admin-success">✓ {successMessage}</div>
        )}

        {/* Form */}
        <form onSubmit={handleRegisterAdmin}>
          {/* Full Name */}
          <div className="reg-admin-form-group">
            <label className="reg-admin-label">
              Full Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              placeholder="Admin Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }}
              className={`reg-admin-input ${errors.name ? "error" : ""}`}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="reg-admin-form-group">
            <label className="reg-admin-label">
              Email Address <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }}
              className={`reg-admin-input ${errors.email ? "error" : ""}`}
            />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="reg-admin-form-group">
            <label className="reg-admin-label">
              Password <span className="text-danger">*</span>
            </label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
                className={`reg-admin-input pr-11 ${errors.password ? "error" : ""}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle-btn">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="form-error">{errors.password}</p>}
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
          </div>

          {/* Confirm Password */}
          <div className="reg-admin-form-group mb-6">
            <label className="reg-admin-label">
              Confirm Password <span className="text-danger">*</span>
            </label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: "" })); }}
                className={`reg-admin-input pr-11 ${errors.confirmPassword ? "error" : ""}`}
              />
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="password-toggle-btn">
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="form-error">{errors.confirmPassword}</p>}
          </div>

          {/* Buttons */}
          <div className="reg-admin-actions">
            <button type="button" onClick={onClose} className="reg-admin-cancel-btn">Cancel</button>
            <button type="submit" disabled={loading} className="reg-admin-submit-btn">
              {loading ? "Creating..." : "Create Admin Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
