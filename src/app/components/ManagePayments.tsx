import React, { useState, useEffect } from "react";
import { api } from "../config";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Eye, Mail } from "lucide-react";

interface Payment {
  id: string;
  user_name: string;
  user_email: string;
  date: string;
  time_slot: string;
  court_number: number;
  duration: number;
  payment_status: "pending" | "approved" | "rejected";
  payment_method: "qr" | "cash";
  payment_proof_path: string | null;
  total_amount: number;
  payment_submitted_at: string | null;
  approved_at: string | null;
  approver_name: string | null;
  access_code_active: number;
  access_code: string | null;
}

interface EmailSimulation {
  type: "approved" | "rejected";
  email: string;
  name: string;
  accessCode?: string;
}

interface ManagePaymentsProps {
  adminId: string;
}

export function ManagePayments({ adminId }: ManagePaymentsProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [proofModal, setProofModal] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [emailSimulations, setEmailSimulations] = useState<Record<string, EmailSimulation>>({});
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      const res = await fetch(api("/api/payments"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPayments(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("Failed to load payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    const interval = setInterval(() => {
      // Don't auto-refresh while admin is typing a rejection note
      if (!rejectingId) {
        fetchPayments();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [rejectingId]);

  const handleApprove = async (bookingId: string) => {
    setActionLoading(bookingId + "_approve");
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/payments/${bookingId}/approve`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to approve");
      }
      const data = await res.json();
      setEmailSimulations(prev => ({
        ...prev,
        [bookingId]: {
          type: "approved",
          email: data.userEmail || "",
          name: data.userName || "",
          accessCode: data.accessCode,
        },
      }));
      toast.success(`Payment approved. Access code emailed to ${data.userEmail || "user"}.`);
      fetchPayments();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve payment.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (bookingId: string) => {
    setActionLoading(bookingId + "_reject");
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/payments/${bookingId}/reject`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ note: rejectNote }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to reject");
      }
      const data = await res.json();
      setEmailSimulations(prev => ({
        ...prev,
        [bookingId]: {
          type: "rejected",
          email: data.userEmail || "",
          name: data.userName || "",
        },
      }));
      toast.success(`Payment rejected. Notification emailed to ${data.userEmail || "user"}.`);
      setRejectingId(null);
      setRejectNote("");
      fetchPayments();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject payment.");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = payments.filter((p) => filter === "all" || p.payment_status === filter);

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedPaymentIds).filter(id => payments.find(p => p.id === id)?.payment_status === "pending");
    if (ids.length === 0) { toast.error("No pending payments selected."); return; }
    setBulkActionLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const results = await Promise.allSettled(ids.map(id =>
        fetch(api(`/api/payments/${id}/approve`), {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
      ));
      const succeeded = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<Response>).value.ok).length;
      toast.success(`${succeeded} payment${succeeded !== 1 ? "s" : ""} approved.`);
      setSelectedPaymentIds(new Set());
      fetchPayments();
    } catch {
      toast.error("Bulk approve failed.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedPaymentIds).filter(id => payments.find(p => p.id === id)?.payment_status === "pending");
    if (ids.length === 0) { toast.error("No pending payments selected."); return; }
    setBulkActionLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const results = await Promise.allSettled(ids.map(id =>
        fetch(api(`/api/payments/${id}/reject`), {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ note: "" }),
        })
      ));
      const succeeded = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<Response>).value.ok).length;
      toast.success(`${succeeded} payment${succeeded !== 1 ? "s" : ""} rejected.`);
      setSelectedPaymentIds(new Set());
      fetchPayments();
    } catch {
      toast.error("Bulk reject failed.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const formatDate = (dt: string | null) => {
    if (!dt) return "—";
    try {
      return new Date(dt).toLocaleString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dt;
    }
  };

  const pendingCount = payments.filter((p) => p.payment_status === "pending").length;

  const statusBadge = (status: string) => {
    if (status === "pending") return <span className="payment-badge payment-badge-pending">Pending</span>;
    if (status === "approved") return <span className="payment-badge payment-badge-approved">Approved</span>;
    if (status === "rejected") return <span className="payment-badge payment-badge-rejected">Rejected</span>;
    return null;
  };

  return (
    <div>
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-welcome">Manage Payments</h1>
        <p className="dashboard-subtitle">Review and approve payment submissions from users.</p>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid stats-grid-mb">
        {[
          { label: "Pending Review", value: payments.filter((p) => p.payment_status === "pending").length, color: "orange" },
          { label: "Approved", value: payments.filter((p) => p.payment_status === "approved").length, color: "green" },
          { label: "Rejected", value: payments.filter((p) => p.payment_status === "rejected").length, color: "red" },
          { label: "Total", value: payments.length, color: "blue" },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-card-top">
              <div>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
              <div className={`stat-card-icon ${color}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="card payment-filter-mb">
        <div className="card-body payment-filter-bar">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { setFilter(f); setSelectedPaymentIds(new Set()); }}
            >
              {f === "pending" && pendingCount > 0 ? (
                <>Pending <span className="payment-badge-count">{pendingCount}</span></>
              ) : (
                f.charAt(0).toUpperCase() + f.slice(1)
              )}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-sm ml-auto"
            onClick={fetchPayments}
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedPaymentIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">{selectedPaymentIds.size} selected</span>
          <button className="btn btn-primary btn-sm" disabled={bulkActionLoading} onClick={handleBulkApprove}>
            <CheckCircle2 size={13} /> Approve Selected
          </button>
          <button className="btn btn-danger-outline btn-sm" disabled={bulkActionLoading} onClick={handleBulkReject}>
            <XCircle size={13} /> Reject Selected
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPaymentIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="payment-table-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="loading-spinner payment-table-icon">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p>Loading payments...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="payment-table-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="payment-table-icon">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            <p>No {filter === "all" ? "" : filter + " "}payments found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="pb-table">
              <thead>
                <tr>
                  <th className="td-check">
                    <input
                      type="checkbox"
                      className="bulk-checkbox"
                      title="Select all"
                      checked={filtered.length > 0 && filtered.every(p => selectedPaymentIds.has(p.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedPaymentIds(new Set(filtered.map(p => p.id)));
                        else setSelectedPaymentIds(new Set());
                      }}
                    />
                  </th>
                  <th>User</th>
                  <th>Booking</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Proof</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr className={selectedPaymentIds.has(p.id) ? "row-selected" : ""}>
                      <td className="td-check">
                        <input
                          type="checkbox"
                          className="bulk-checkbox"
                          title="Select row"
                          checked={selectedPaymentIds.has(p.id)}
                          onChange={e => {
                            const next = new Set(selectedPaymentIds);
                            if (e.target.checked) next.add(p.id); else next.delete(p.id);
                            setSelectedPaymentIds(next);
                          }}
                        />
                      </td>
                      <td>
                        <div className="payment-cell-name">{p.user_name}</div>
                        <div className="payment-cell-sub">{p.user_email}</div>
                      </td>
                      <td>
                        <div className="payment-cell-name">Court {p.court_number}</div>
                        <div className="payment-cell-sub">{p.date}</div>
                        <div className="payment-cell-duration">{p.time_slot}</div>
                      </td>
                      <td>
                        <div className="payment-cell-amount">
                          RM {Number(p.total_amount || 0).toFixed(2)}
                        </div>
                        <div className="payment-cell-duration">
                          {p.duration}h
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-info badge-uppercase">
                          {p.payment_method || "qr"}
                        </span>
                      </td>
                      <td>{statusBadge(p.payment_status)}</td>
                      <td className="payment-cell-date">{formatDate(p.payment_submitted_at)}</td>
                      <td>
                        {p.payment_proof_path ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setProofModal(api(`/uploads/${p.payment_proof_path}`))}
                            title="View payment proof"
                          >
                            <Eye size={14} />
                            View
                          </button>
                        ) : (
                          <span className="payment-cell-muted">—</span>
                        )}
                      </td>
                      <td>
                        {p.payment_status === "pending" && (
                          <div className="table-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={actionLoading === p.id + "_approve"}
                              onClick={() => handleApprove(p.id)}
                              title="Approve payment"
                            >
                              <CheckCircle2 size={13} />
                              Approve
                            </button>
                            <button
                              className="btn btn-sm btn-danger-outline"
                              disabled={!!actionLoading}
                              onClick={() => { setRejectingId(p.id); setRejectNote(""); }}
                              title="Reject payment"
                            >
                              <XCircle size={13} />
                              Reject
                            </button>
                          </div>
                        )}
                        {p.payment_status === "approved" && (
                          <div>
                            <span className="payment-cell-approved">
                              <CheckCircle2 size={13} className="inline-icon icon-mr-xs" />
                              {formatDate(p.approved_at)}
                            </span>
                            {p.access_code && (
                              <div className="admin-access-code-display">
                                Code: <strong>{p.access_code}</strong>
                              </div>
                            )}
                          </div>
                        )}
                        {p.payment_status === "rejected" && (
                          <span className="payment-cell-rejected">
                            <XCircle size={13} className="inline-icon icon-mr-xs" />
                            Rejected
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Email Simulation Notice */}
                    {emailSimulations[p.id] && (
                      <tr>
                        <td colSpan={9} className="p-0">
                          <div className={`email-simulation-notice${emailSimulations[p.id].type === "approved" ? " approved" : " rejected"}`}>
                            <Mail size={14} />
                            {emailSimulations[p.id].type === "approved" ? (
                              <span>
                                Email sent to <strong>{emailSimulations[p.id].email}</strong> with access code
                                {emailSimulations[p.id].accessCode ? (
                                  <> — Code: <strong className="email-sim-code">{emailSimulations[p.id].accessCode}</strong></>
                                ) : null}
                              </span>
                            ) : (
                              <span>
                                Rejection email sent to <strong>{emailSimulations[p.id].email}</strong>
                              </span>
                            )}
                            <button
                              className="email-sim-dismiss"
                              onClick={() => setEmailSimulations(prev => {
                                const next = { ...prev };
                                delete next[p.id];
                                return next;
                              })}
                              title="Dismiss"
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {/* Reject confirmation row */}
                    {rejectingId === p.id && (
                      <tr>
                        <td colSpan={9} className="payment-reject-row">
                          <div className="payment-reject-row-inner">
                            <input
                              className="form-input payment-reject-input"
                              placeholder="Rejection note (optional)"
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                            />
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={actionLoading === p.id + "_reject"}
                              onClick={() => handleReject(p.id)}
                            >
                              Confirm Reject
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setRejectingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proof Viewer Modal */}
      {proofModal && (
        <div
          className="modal-overlay payment-modal-overlay"
          onClick={() => setProofModal(null)}
        >
          <div
            className="modal-box payment-proof-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                <Eye size={16} />
                Payment Proof
              </h3>
              <button className="modal-close" onClick={() => setProofModal(null)}>✕</button>
            </div>
            <div className="payment-proof-box">
              {proofModal.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={proofModal}
                  title="Payment proof PDF"
                  className="payment-proof-pdf"
                />
              ) : (
                <img
                  src={proofModal}
                  alt="Payment proof"
                  className="payment-proof-img"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const msg = document.createElement("div");
                    msg.className = "proof-error-msg";
                    msg.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg><p>Could not load image. Click "Open in New Tab" to view the file.</p>`;
                    target.parentNode?.appendChild(msg);
                  }}
                />
              )}
            </div>
            <div className="payment-proof-footer">
              <a
                href={proofModal}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open in New Tab
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => setProofModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
