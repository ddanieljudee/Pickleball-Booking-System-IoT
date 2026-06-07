import React, { useState } from "react";
import { User } from "../data/mockData";
import { api } from "../config";
import { Eye, EyeOff, CheckCircle2, UserCog } from "lucide-react";

interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate: (updatedUser: User) => void;
}

export function EditProfileModal({ user, onClose, onUpdate }: EditProfileModalProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
    if (password && password.length < 8) errs.password = "Password must be at least 8 characters";
    return errs;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    const updatePayload = {
      name: name.trim(),
      email: email.trim(),
      ...(password && { password })
    };

    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/users/${user.id}`), {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        },
        body: JSON.stringify(updatePayload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update profile");
      }
      
      const updatedUser = { ...user, ...updatePayload };
      setSuccess(true);
      setTimeout(() => onUpdate(updatedUser), 1500);
    } catch (err) {
      console.error("Profile update error:", err);
      setErrors({ submit: err instanceof Error ? err.message : "Failed to update profile" });
      setLoading(false);
    }
  };

  // ─── SUCCESS STATE ─────────────────────────────────────────────
  if (success) {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-sm text-center modal-box-padded">
          <div className="booking-confirmed-icon">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="booking-confirmed-title">Profile Updated!</h2>
          <p className="booking-confirmed-sub">Your account details have been securely saved.</p>
        </div>
      </div>
    );
  }

  // ─── EDIT FORM ─────────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h2 className="modal-title">
            <UserCog size={18} color="var(--primary)" />
            Edit Profile
          </h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Profile identity strip */}
          <div className="profile-card mb-6">
            <div className="profile-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div>
              <p className="profile-name">{user.name}</p>
              <p className="profile-email">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">
                Full Name <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Your full name"
                value={name}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }}
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Email Address <span className="required">*</span>
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }}
              />
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">New Password <span className="text-muted font-normal">(optional)</span></label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-input pr-11"
                  placeholder="Leave blank to keep current password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle-btn"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <p className="form-error">{errors.password}</p>}
              <p className="form-hint">Minimum 8 characters if changing password.</p>
            </div>

            <div className="modal-footer modal-footer-bare">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
