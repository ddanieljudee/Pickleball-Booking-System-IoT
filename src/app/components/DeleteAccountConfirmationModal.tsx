import React, { useState } from "react";
import { User } from "../data/mockData";
import { api } from "../config";
import { Trash2, AlertTriangle, CheckCircle2, Loader } from "lucide-react";

interface DeleteAccountConfirmationModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "warning" | "confirm" | "deleting" | "success";

export function DeleteAccountConfirmationModal({ user, onClose, onSuccess }: DeleteAccountConfirmationModalProps) {
  const [step, setStep] = useState<Step>("warning");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirmClick = () => {
    // Check if user typed correct confirmation text
    if (confirmText.trim().toLowerCase() !== "delete my account") {
      setError("Please type exactly 'delete my account' to confirm");
      return;
    }
    setStep("deleting");
    handleAccountDeletion();
  };

  const handleAccountDeletion = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/users/${user.id}/delete-account`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to delete account");
      }

      // Success
      setStep("success");
      setTimeout(() => {
        // Clear localStorage
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        // Redirect to login
        onSuccess();
      }, 2000);
    } catch (err) {
      console.error("Account deletion error:", err);
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setStep("confirm");
      setLoading(false);
    }
  };

  // ─── WARNING STATE (Initial) ──────────────────────────────────
  if (step === "warning") {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-sm">
          <div className="modal-header">
            <h2 className="modal-title">
              <AlertTriangle size={18} color="var(--danger)" />
              Delete Account
            </h2>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>

          <div className="modal-body">
            {/* Warning Icon */}
            <div className="text-center mb-4">
              <div className="delete-warning-icon">
                <AlertTriangle size={28} color="var(--danger)" strokeWidth={1.5} />
              </div>
            </div>

            {/* Warning Message */}
            <div className="mb-4">
              <h3 className="delete-warning-title">
                This action cannot be undone
              </h3>
              <p className="delete-warning-subtitle">
                Permanently deleting your account will:
              </p>
            </div>

            {/* Consequences List */}
            <div className="delete-consequences-box">
              {[
                "Remove your profile from our system",
                "Delete all your bookings permanently",
                "Release your reserved court time for other users",
                "Remove your login access immediately",
                "Cannot be recovered or reversed"
              ].map((item, idx) => (
                <div key={idx} className="delete-consequence-row">
                  <div className="delete-consequence-bullet">•</div>
                  <span className="delete-consequence-text">{item}</span>
                </div>
              ))}
            </div>

            {/* User Info */}
            <div className="delete-user-info">
              <p className="text-xs text-muted mb-1">Deleting account for:</p>
              <p className="font-semibold mb-0">{user.name}</p>
              <p className="text-sm text-muted">{user.email}</p>
            </div>

            {/* Action Buttons */}
            <div className="delete-actions-col">
              <button
                className="btn btn-danger w-full"
                onClick={() => {
                  setConfirmText("");
                  setError(null);
                  setStep("confirm");
                }}
              >
                <Trash2 size={16} />
                Yes, Delete My Account
              </button>
              <button
                className="btn btn-ghost w-full"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── CONFIRMATION STATE (Type to Confirm) ────────────────────
  if (step === "confirm") {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-sm">
          <div className="modal-header">
            <h2 className="modal-title">
              <AlertTriangle size={18} color="var(--danger)" />
              Confirm Deletion
            </h2>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>

          <div className="modal-body">
            <p className="delete-confirm-text">
              To confirm you want to permanently delete your account, type the following phrase exactly:
            </p>

            {/* Confirmation Text Display */}
            <div className="delete-confirm-phrase">
              delete my account
            </div>

            {/* Input Field */}
            <div className="form-group mb-4">
              <label className="form-label">Type to confirm:</label>
              <input
                type="text"
                className="form-input font-mono"
                placeholder="Type the phrase above..."
                value={confirmText}
                onChange={e => {
                  setConfirmText(e.target.value);
                  setError(null);
                }}
              />
              {error && <p className="form-error">{error}</p>}
            </div>

            {/* Action Buttons */}
            <div className="delete-actions-col">
              <button
                className="btn btn-danger w-full"
                onClick={handleConfirmClick}
                disabled={confirmText.trim().toLowerCase() !== "delete my account"}
              >
                Delete My Account Permanently
              </button>
              <button
                className="btn btn-ghost w-full"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>

            <p className="delete-footer-note">
              This action cannot be undone. Please be sure before proceeding.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── DELETING STATE (Processing) ──────────────────────────────
  if (step === "deleting") {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-sm text-center modal-box-padded">
          <div className="mb-4">
            <Loader size={32} color="var(--danger)" className="loading-spinner" />
          </div>
          <h2 className="booking-confirmed-title text-danger">
            Deleting Your Account...
          </h2>
          <p className="booking-confirmed-sub">
            Please wait while we permanently remove your account and bookings.
          </p>
          {error && (
            <div className="alert alert-danger mt-5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>{error}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── SUCCESS STATE (Completion) ───────────────────────────────
  if (step === "success") {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-sm text-center modal-box-padded">
          <div className="delete-success-icon">
            <CheckCircle2 size={32} color="var(--danger)" strokeWidth={1.5} />
          </div>
          <h2 className="booking-confirmed-title text-danger">
            Account Deleted
          </h2>
          <p className="booking-confirmed-sub">
            Your account and all associated data have been permanently removed. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return null;
}
