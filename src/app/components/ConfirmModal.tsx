import React from "react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "warning",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const iconColor =
    variant === "danger" ? "var(--danger)" : variant === "warning" ? "var(--warning)" : "var(--primary)";

  const confirmBtnClass =
    variant === "danger" ? "btn btn-danger" : "btn btn-primary";

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box modal-box-sm">
        <div className="modal-header">
          <h3 className="modal-title modal-title-flex">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {title}
          </h3>
          <button onClick={onCancel} className="modal-close-raw" disabled={loading}>✕</button>
        </div>
        <div className="modal-body-padded">
          <p className="text-sm text-muted confirm-modal-message">{message}</p>
        </div>
        <div className="modal-footer-flat">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
          <button className={confirmBtnClass} onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg>
                Processing...
              </>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
