import React, { useState, useEffect } from "react";
import { User, Booking, convertBackendBooking, TIME_SLOTS, getMaxDurationForStartTime, isSlotWithinBookingRange, isSlotInPast, fmtDate } from "../data/mockData";
import { api } from "../config";
import { toast } from "sonner";
import { BookingModal } from "./BookingModal";
import { EditProfileModal } from "./EditProfileModal";
import { DeleteAccountConfirmationModal } from "./DeleteAccountConfirmationModal";
import { ConfirmModal } from "./ConfirmModal";
import { PaymentModal } from "./PaymentModal";

interface UserDashboardProps {
  user: User;
  navigate: (page: string, user?: User) => void;
}

type Section = "home" | "bookings" | "profile";

export function UserDashboard({ user, navigate }: UserDashboardProps) {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [showModal, setShowModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [userBookingsState, setUserBookingsState] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBooking, setNewBooking] = useState<{
    date: string; timeSlot: string; accessCode: string; id: string; courtNumber: number;
  } | null>(null);

  // Edit booking state
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editValues, setEditValues] = useState({ date: "", timeSlot: "", duration: 1, courtNumber: 1 });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [allBookings, setAllBookings] = useState<any[]>([]);

  // Cancel booking state
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("userSidebarCollapsed") === "true");

  // Payment upload modal state
  const [paymentUploadBooking, setPaymentUploadBooking] = useState<Booking | null>(null);

  // Proof viewer state
  const [proofViewUrl, setProofViewUrl] = useState<string | null>(null);

  // Access code reveal state
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  // Action dropdown menu state
  const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openActionDropdown) return;
    const handler = () => setOpenActionDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionDropdown]);

  // Dynamic page title
  useEffect(() => {
    const titles: Record<Section, string> = {
      home: "Dashboard — Pickleball Pro",
      bookings: "My Bookings — Pickleball Pro",
      profile: "My Profile — Pickleball Pro",
    };
    document.title = titles[activeSection] ?? "Pickleball Pro";
    return () => { document.title = "Pickleball Pro"; };
  }, [activeSection]);

  // ── Fetch bookings from backend ──
  const fetchBookings = async () => {
    try {
      setError(null);
      const token = sessionStorage.getItem("token");
      if (!token) { setLoadingBookings(false); return; }

      const res = await fetch(api("/api/bookings/mine"), {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expired. Please login again.");
          setTimeout(() => navigate("login"), 2000);
          return;
        }
        throw new Error(`Server error: ${res.statusText}`);
      }

      const response = await res.json();
      const bookingsArray = Array.isArray(response) ? response : (response.data || []);

      const userBookings = bookingsArray.map((b: any) => convertBackendBooking(b));

      setUserBookingsState(userBookings);
    } catch (err) {
      console.error("Error fetching bookings:", err);
      setError("Could not load bookings. Please try refreshing the page.");
      setUserBookingsState([]);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Combine fresh state + any local newBookings for quick preview
  const userBookings = [...userBookingsState];
  if (newBooking && !userBookings.some(b => b.id === newBooking.id)) {
    userBookings.unshift({
      id: newBooking.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      date: newBooking.date,
      timeSlot: newBooking.timeSlot,
      courtNumber: newBooking.courtNumber,
      accessCode: newBooking.accessCode,
      status: "confirmed",
    } as Booking);
  }

  const handleBooked = (b: { date: string; timeSlot: string; accessCode: string; id: string; courtNumber: number }) => {
    setNewBooking(b);
    setActiveSection("bookings");
    setTimeout(() => fetchBookings(), 1000);
  };

  // ── 30-Minute Cancellation Policy Check ──
  const canCancelBooking = (dateStr: string, timeSlot: string): { allowed: boolean; message: string } => {
    try {
      const startTimeStr = timeSlot.split(/[-–]/)[0].trim();
      const bookingTime = new Date(`${dateStr} ${startTimeStr}`).getTime();
      if (isNaN(bookingTime)) return { allowed: true, message: "" };

      const now = Date.now();
      const diffMins = (bookingTime - now) / 1000 / 60;

      if (diffMins < 0) {
        return { allowed: false, message: "This booking has already started or passed." };
      }
      if (diffMins < 30) {
        const minsLeft = Math.ceil(diffMins);
        return {
          allowed: false,
          message: `Cancellation not allowed — your booking starts in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}. Our policy requires at least 30 minutes notice before the booking start time.`
        };
      }
      return { allowed: true, message: "" };
    } catch {
      return { allowed: true, message: "" };
    }
  };

  // ── Cancel Booking Handler ──
  const handleCancelBooking = async () => {
    if (!cancellingBooking) return;

    const policy = canCancelBooking(cancellingBooking.date, cancellingBooking.timeSlot);
    if (!policy.allowed) { setCancelError(policy.message); return; }

    setCancelLoading(true);
    setCancelError(null);

    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/bookings/${cancellingBooking.id}`), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to cancel booking");
      }

      setUserBookingsState(prev => prev.filter(b => b.id !== cancellingBooking.id));
      setCancellingBooking(null);
      setCancelError(null);
      toast.success("Booking cancelled successfully.");
    } catch (err: any) {
      console.error("Error cancelling booking:", err);
      setCancelError(err.message || "Failed to cancel booking. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  };

  // ── Edit Booking ──
  const openEditModal = async (booking: Booking) => {
    setEditingBooking(booking);
    let dateVal = "";
    try {
      const d = new Date(booking.date);
      if (!isNaN(d.getTime())) dateVal = d.toISOString().split("T")[0];
    } catch { /* keep empty */ }
    setEditValues({
      date: dateVal,
      timeSlot: booking.timeSlot || TIME_SLOTS[0],
      duration: booking.duration || 1,
      courtNumber: booking.courtNumber || 1,
    });
    setEditError(null);

    // Fetch all bookings for conflict detection
    try {
      const res = await fetch(api("/api/bookings/public"));
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.data || []);
        setAllBookings(arr);
      }
    } catch { /* ignore */ }
  };

  const isEditSlotBooked = (slot: string, checkDuration: number): boolean => {
    if (!editValues.date || !editingBooking) return false;
    const dateStr = new Date(editValues.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const candidateStart = TIME_SLOTS.indexOf(slot);
    if (candidateStart === -1) return false;
    if (candidateStart + checkDuration > TIME_SLOTS.length) return true;
    for (let i = candidateStart; i < candidateStart + checkDuration; i++) {
      const currentSlot = TIME_SLOTS[i];
      const conflict = allBookings.find(b => {
        if (b.id === editingBooking.id) return false; // Exclude current booking
        const bDate = b.date;
        const bCourt = b.court_number || b.courtNumber;
        if (bDate !== dateStr) return false;
        if (bCourt !== editValues.courtNumber) return false;
        if (b.status === "cancelled") return false;
        return isSlotWithinBookingRange(currentSlot, b.time_slot || b.timeSlot);
      });
      if (conflict) return true;
    }
    return false;
  };

  const handleSaveEdit = async () => {
    if (!editingBooking) return;
    if (!editValues.date || !editValues.timeSlot) { setEditError("Please fill in all fields."); return; }
    if (isSlotInPast(editValues.date, editValues.timeSlot)) { setEditError("Cannot book a time slot that has already passed."); return; }

    setEditLoading(true);
    setEditError(null);

    try {
      const token = sessionStorage.getItem("token");
      const displayDate = new Date(editValues.date + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric"
      });

      const res = await fetch(api(`/api/bookings/${editingBooking.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        },
        body: JSON.stringify({
          date: displayDate,
          timeSlot: editValues.timeSlot,
          duration: editValues.duration,
          courtNumber: editValues.courtNumber,
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update booking");
      }

      setEditingBooking(null);
      await fetchBookings();
      toast.success("Booking updated successfully.");
    } catch (err: any) {
      console.error("Error updating booking:", err);
      setEditError(err.message || "Failed to update booking. Please try again.");
    } finally {
      setEditLoading(false);
    }
  };

  const bookingStatusBadge = (b: Booking) => {
    if (b.status === "completed") return <span className="badge badge-muted">Completed</span>;
    if (b.status === "cancelled") return <span className="badge badge-danger">Cancelled</span>;
    if (b.paymentStatus === "approved") return <span className="badge badge-success">Confirmed</span>;
    if (b.paymentStatus === "rejected") return (
      <div>
        <span className="badge badge-danger">Payment Rejected</span>
        {b.paymentRejectionNote && (
          <div className="rejection-note-inline">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {b.paymentRejectionNote}
          </div>
        )}
      </div>
    );
    if (b.paymentStatus === "pending" && b.paymentProofPath) return <span className="badge badge-warning">Pending Approval</span>;
    return <span className="badge badge-warning">Awaiting Payment</span>;
  };

  // ── Stats ──
  const totalBookings = userBookings.length;
  const confirmedBookings = userBookings.filter(b => b.status === "confirmed").length;
  const completedBookings = userBookings.filter(b => b.status === "completed").length;
  const cancelledBookings = userBookings.filter(b => b.status === "cancelled").length;

  return (
    <div className="page-bg">
      {/* ═══ Navbar ═══ */}
      <nav className="pb-navbar">
        <div className="pb-navbar-brand">
          <div className="pb-navbar-brand-icon">PB</div>
          <div className="pb-navbar-brand-text">
            <span className="pb-navbar-brand-name">Pickleball Pro</span>
            <span className="pb-navbar-brand-sub">Court Booking</span>
          </div>
        </div>
        <div className="pb-navbar-actions">
          <div className="pb-navbar-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            {user.name}
            <span className="pb-navbar-badge">User</span>
          </div>
          <button className="btn-logout btn" onClick={() => setShowLogoutConfirm(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </nav>

      <div className={`dashboard-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        {/* ═══ Sidebar ═══ */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-section-label">Navigation</div>
          {([
            { key: "home", label: "Dashboard", icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>) },
            { key: "bookings", label: "My Bookings", icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>) },
            { key: "profile", label: "My Profile", icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>) },
          ] as const).map(({ key, label, icon }) => (
            <div key={key} className={`sidebar-item ${activeSection === key ? "active" : ""}`} onClick={() => setActiveSection(key as Section)}>{icon}{label}</div>
          ))}
          <div className="sidebar-section-label mt-4">Quick Actions</div>
          <div className="sidebar-item" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Book a Court
          </div>
        </aside>

        {/* ═══ Main Content ═══ */}
        <main className="dashboard-main">
          <button
            className="sidebar-toggle"
            onClick={() => {
              setSidebarCollapsed(prev => {
                const next = !prev;
                localStorage.setItem("userSidebarCollapsed", String(next));
                return next;
              });
            }}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <polyline points="14 9 17 12 14 15" />
            </svg>
          </button>

          {/* ════════════ HOME ════════════ */}
          {activeSection === "home" && (
            <>
              <div className="dashboard-header dash-animate">
                <h1 className="dashboard-welcome">Welcome back, {user.name.split(" ")[0]}</h1>
                <p className="dashboard-subtitle">Here's what's happening with your court reservations.</p>
              </div>

              {error && (
                <div className="alert alert-danger mb-5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <div>{error}</div>
                </div>
              )}

              {/* Quick Stats */}
              <div className="stats-grid dash-animate delay-1">
                {[
                  { label: "Total Bookings", value: totalBookings, iconColor: "green", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
                  { label: "Confirmed", value: confirmedBookings, iconColor: "blue", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> },
                  { label: "Completed", value: completedBookings, iconColor: "gray", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
                ].map(({ label, value, iconColor, icon }) => (
                  <div key={label} className="stat-card">
                    <div className="stat-card-top">
                      <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
                      <div className={`stat-card-icon ${iconColor}`}>{icon}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Book CTA */}
              <div className="card mb-6">
                <div className="card-body quick-book-body">
                  <div>
                    <h3 className="quick-book-title">Ready to play?</h3>
                    <p className="quick-book-subtitle">Book a court, submit payment proof, and receive your IoT gate access code after approval.</p>
                  </div>
                  <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    Book a Court
                  </button>
                </div>
              </div>

              {/* Upcoming Booking */}
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const upcoming = userBookings
                  .filter(b => b.status === "confirmed" && (() => {
                    try { const d = new Date(b.date); return d >= today; } catch { return false; }
                  })())
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                if (!upcoming) return null;
                const payStatus = upcoming.paymentStatus || "pending";
                return (
                  <div className="upcoming-booking-block mb-6">
                    <div className="upcoming-booking-header">
                      <div className="upcoming-booking-header-left">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Upcoming Booking
                      </div>
                      <span className={`upcoming-booking-pay-badge ${payStatus}`}>
                        {payStatus.charAt(0).toUpperCase() + payStatus.slice(1)}
                      </span>
                    </div>
                    <div className="upcoming-booking-body">
                      <div className="upcoming-booking-main">
                        <div className="upcoming-booking-court">Court {upcoming.courtNumber}</div>
                        <div className="upcoming-booking-date">{fmtDate(upcoming.date)}</div>
                        <div className="upcoming-booking-time">{upcoming.timeSlot}</div>
                        {upcoming.duration && (
                          <div className="upcoming-booking-duration">{upcoming.duration} hour{upcoming.duration > 1 ? "s" : ""}</div>
                        )}
                      </div>
                      <div className="upcoming-booking-meta">
                        <div className="upcoming-booking-meta-row">
                          <span className="upcoming-booking-meta-label">Booking ID</span>
                          <span className="upcoming-booking-meta-value">{upcoming.id}</span>
                        </div>
                        {upcoming.totalAmount && (
                          <div className="upcoming-booking-meta-row">
                            <span className="upcoming-booking-meta-label">Amount</span>
                            <span className="upcoming-booking-meta-value">RM {Number(upcoming.totalAmount).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="upcoming-booking-meta-row">
                          <span className="upcoming-booking-meta-label">Access Code</span>
                          <span className="upcoming-booking-meta-value">
                            {upcoming.accessCodeActive && upcoming.accessCode ? (
                              revealedCodes.has(upcoming.id)
                                ? <span className="upcoming-booking-code">{upcoming.accessCode}</span>
                                : <button className="upcoming-booking-reveal-btn" onClick={() => setRevealedCodes(prev => { const s = new Set(prev); s.add(upcoming.id); return s; })}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    Tap to reveal
                                  </button>
                            ) : (
                              <span className="upcoming-booking-code-pending">Awaiting approval</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {loadingBookings && (
                <div className="card">
                  <div className="card-body loading-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg>
                    <p className="loading-text">Loading your bookings...</p>
                  </div>
                </div>
              )}

              {/* Recent Bookings Preview */}
              {userBookings.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      Recent Bookings
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setActiveSection("bookings")}>View All</button>
                  </div>
                  <div className="table-wrapper table-wrapper-flat">
                    <table className="pb-table">
                      <thead><tr><th>ID</th><th>Date</th><th>Time Slot</th><th>Court</th><th>Access Code</th><th>Status</th><th>Amount</th></tr></thead>
                      <tbody>
                        {userBookings.slice(0, 3).map((b) => (
                          <tr key={b.id}>
                            <td className="td-id">{b.id}</td>
                            <td>{fmtDate(b.date)}</td>
                            <td>{b.timeSlot}</td>
                            <td>Court {b.courtNumber}</td>
                            <td>
                              {b.accessCodeActive
                                ? <span className="access-code-badge">{b.accessCode}</span>
                                : b.paymentStatus === 'rejected'
                                  ? <span className="badge badge-danger">Unavailable</span>
                                  : <span className="badge badge-warning">Pending Approval</span>
                              }
                            </td>
                            <td>{bookingStatusBadge(b)}</td>
                            <td>{b.totalAmount ? `RM ${Number(b.totalAmount).toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════════ MY BOOKINGS ════════════ */}
          {activeSection === "bookings" && (
            <>
              <div className="dashboard-header">
                <div className="dashboard-header-flex">
                  <div>
                    <h1 className="dashboard-welcome">My Bookings</h1>
                    <p className="dashboard-subtitle">View, edit, and manage all your court reservations.</p>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    New Booking
                  </button>
                </div>
              </div>

              {/* Booking Statistics — moved from Profile page */}
              <div className="stats-grid stats-grid-4">
                {[
                  { label: "Total Bookings", value: totalBookings, colorClass: "text-primary", iconColor: "green", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
                  { label: "Confirmed", value: confirmedBookings, colorClass: "text-success", iconColor: "blue", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> },
                  { label: "Completed", value: completedBookings, colorClass: "text-info", iconColor: "gray", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
                  { label: "Cancelled", value: cancelledBookings, colorClass: "text-danger", iconColor: "red", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg> },
                ].map(({ label, value, colorClass, iconColor, icon }) => (
                  <div key={label} className="stat-card">
                    <div className="stat-card-top">
                      <div>
                        <div className={`stat-value ${colorClass}`}>{value}</div>
                        <div className="stat-label">{label}</div>
                      </div>
                      <div className={`stat-card-icon ${iconColor}`}>{icon}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cancellation Policy */}
              <div className="alert alert-info mb-5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                <div><strong>Cancellation Policy:</strong> Bookings can be cancelled up to 30 minutes before the scheduled start time. After that, cancellations are not permitted.</div>
              </div>

              {loadingBookings ? (
                <div className="card">
                  <div className="card-body loading-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg>
                    <p className="loading-text">Loading your bookings...</p>
                  </div>
                </div>
              ) : userBookings.length === 0 ? (
                <div className="card">
                  <div className="td-empty card-body-center">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <p className="loading-text mb-4">No bookings yet. Book your first court to get started!</p>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>Book a Court</button>
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="table-wrapper table-wrapper-flat">
                    <table className="pb-table">
                      <thead>
                        <tr><th>Booking ID</th><th>Date</th><th>Time Slot</th><th>Court</th><th>Access Code</th><th>Status</th><th>Amount</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {userBookings.map((b) => {
                          const isConfirmed = b.status === "confirmed";
                          const needsInitialPay = isConfirmed && b.paymentStatus === "pending" && !b.paymentProofPath;
                          const canReupload = isConfirmed && (b.paymentStatus === "rejected" || (b.paymentStatus === "pending" && !!b.paymentProofPath));
                          const hasProof = !!b.paymentProofPath;
                          return (
                            <tr key={b.id}>
                              <td className="td-id">{b.id}</td>
                              <td className="td-nowrap">{fmtDate(b.date)}</td>
                              <td className="td-nowrap">{b.timeSlot}</td>
                              <td>Court {b.courtNumber}</td>
                              <td>
                                {b.accessCodeActive
                                  ? revealedCodes.has(b.id)
                                    ? <span className="access-code-badge">{b.accessCode}</span>
                                    : <button className="access-code-reveal-btn" onClick={() => setRevealedCodes(prev => { const s = new Set(prev); s.add(b.id); return s; })}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        Tap to reveal
                                      </button>
                                  : b.paymentStatus === 'rejected'
                                    ? <span className="badge badge-danger">Unavailable</span>
                                    : <span className="badge badge-warning">Pending Approval</span>
                                }
                              </td>
                              <td>{bookingStatusBadge(b)}</td>
                              <td>{b.totalAmount ? `RM ${Number(b.totalAmount).toFixed(2)}` : "—"}</td>
                              <td>
                                {isConfirmed ? (
                                  <div className="action-menu-wrap" onClick={e => e.stopPropagation()}>
                                    <button
                                      className="action-menu-btn"
                                      title="Actions"
                                      onClick={() => setOpenActionDropdown(openActionDropdown === b.id ? null : b.id)}
                                    >⋮</button>
                                    {openActionDropdown === b.id && (
                                      <div className="action-menu-dropdown">
                                        {needsInitialPay && (
                                          <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); setPaymentUploadBooking(b); }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            Pay
                                          </button>
                                        )}
                                        {hasProof && (
                                          <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); setProofViewUrl(api(`/uploads/${b.paymentProofPath}`)); }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                            View Proof
                                          </button>
                                        )}
                                        {canReupload && (
                                          <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); setPaymentUploadBooking(b); }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            Re-upload
                                          </button>
                                        )}
                                        <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); openEditModal(b); }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                          Edit
                                        </button>
                                        <button className="action-menu-item danger" onClick={() => { setOpenActionDropdown(null); setCancellingBooking(b); setCancelError(null); }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="card-footer">
                    <p className="text-sm text-muted">Showing {userBookings.length} booking{userBookings.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ════════════ PROFILE ════════════ */}
          {activeSection === "profile" && (
            <>
              <div className="dashboard-header">
                <h1 className="dashboard-welcome">My Profile</h1>
                <p className="dashboard-subtitle">Your account information and settings.</p>
              </div>

              <div className="profile-container profile-container-wide">
                <div className="card mb-5">
                  <div className="card-header">
                    <h3 className="card-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      Account Information
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowEditProfile(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-mr-sm"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Edit Profile
                    </button>
                  </div>
                  <div className="card-body profile-two-col">
                    <div className="profile-col-left">
                      <div className="profile-avatar profile-avatar-lg">{user.name.charAt(0).toUpperCase()}</div>
                      <p className="profile-name">{user.name}</p>
                      <span className="badge badge-success profile-badge-offset">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Active Account
                      </span>
                    </div>
                    <div className="profile-col-right">
                    {[
                      { label: "Full Name", value: user.name, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                      { label: "Email Address", value: user.email, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                      { label: "Account Type", value: user.role.charAt(0).toUpperCase() + user.role.slice(1), icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
                      { label: "Member Since", value: (user.createdAt || (user as any).created_at) ? new Date(user.createdAt || (user as any).created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "N/A", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                      { label: "User ID", value: user.id, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="profile-row">
                        <span className="profile-label"><span>{icon}</span>{label}</span>
                        <span className="profile-value">{value}</span>
                      </div>
                    ))}
                    </div>{/* end profile-col-right */}
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="card danger-card">
                  <div className="card-header danger-card-header">
                    <h3 className="card-title danger-card-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      Danger Zone
                    </h3>
                  </div>
                  <div className="card-body">
                    <p className="danger-card-text">Once you delete your account, there is no going back. Please be certain before deleting your account and all associated data.</p>
                    <button className="btn btn-danger w-full" onClick={() => setShowDeleteAccountModal(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-mr"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                      Delete My Account
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* ═══════════ MODALS ═══════════ */}

      {showModal && (
        <BookingModal userName={user.name} userEmail={user.email} userId={user.id} onClose={() => setShowModal(false)} onConfirmed={handleBooked} />
      )}

      {/* Payment Upload Modal */}
      {paymentUploadBooking && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPaymentUploadBooking(null); }}>
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">Complete Payment</h3>
              <button className="modal-close" onClick={() => setPaymentUploadBooking(null)}>✕</button>
            </div>
            <div className="modal-body">
              <PaymentModal
                bookingId={paymentUploadBooking.id || ""}
                courtNumber={paymentUploadBooking.courtNumber}
                date={paymentUploadBooking.date}
                timeSlot={paymentUploadBooking.timeSlot}
                duration={paymentUploadBooking.duration || 1}
                isAdmin={false}
                onSuccess={() => {
                  setPaymentUploadBooking(null);
                  setActiveSection("bookings");
                  fetchBookings();
                }}
                onSkip={() => setPaymentUploadBooking(null)}
              />
            </div>
          </div>
        </div>
      )}

      {showEditProfile && (
        <EditProfileModal user={user} onClose={() => setShowEditProfile(false)} onUpdate={(updatedUser) => { setShowEditProfile(false); navigate("user-dashboard", updatedUser); }} />
      )}

      {showDeleteAccountModal && (
        <DeleteAccountConfirmationModal user={user} onClose={() => setShowDeleteAccountModal(false)} onSuccess={() => { sessionStorage.removeItem("token"); sessionStorage.removeItem("user"); navigate("login"); }} />
      )}

      {/* ── Edit Booking Modal ── */}
      {editingBooking && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-xl">
            <div className="modal-header">
              <h3 className="modal-title modal-title-flex">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Edit Booking — {editingBooking.id}
              </h3>
              <button onClick={() => setEditingBooking(null)} className="modal-close-raw">✕</button>
            </div>
            <div className="modal-body-padded">
              {editError && (
                <div className="alert alert-danger mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <div>{editError}</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date <span className="required">*</span></label>
                <input type="date" className="form-input" title="Select date" value={editValues.date} min={new Date().toISOString().split("T")[0]} onChange={e => setEditValues(p => ({ ...p, date: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Time Slot <span className="required">*</span></label>
                <select className="form-select" title="Time Slot" value={editValues.timeSlot} onChange={e => { const s = e.target.value; const m = getMaxDurationForStartTime(s); setEditValues(p => ({ ...p, timeSlot: s, duration: Math.min(p.duration, m) })); }}>
                  {TIME_SLOTS.map(s => {
                    const booked = isEditSlotBooked(s, editValues.duration);
                    const past = isSlotInPast(editValues.date, s);
                    const unavailable = booked || past;
                    return <option key={s} value={s} disabled={unavailable}>{s.split(/[-–]/)[0].trim()} {past ? "(Past)" : booked ? "(Unavailable)" : ""}</option>;
                  })}
                </select>
              </div>

              <div className="content-grid content-grid-2">
                <div className="form-group">
                  <label className="form-label">Duration (hours)</label>
                  <select className="form-select" title="Duration" value={editValues.duration} onChange={e => setEditValues(p => ({ ...p, duration: parseInt(e.target.value) }))}>
                    {Array.from({ length: getMaxDurationForStartTime(editValues.timeSlot) }, (_, i) => i + 1).map(h => {
                      const booked = isEditSlotBooked(editValues.timeSlot, h);
                      return <option key={h} value={h} disabled={booked}>{h} hour{h > 1 ? "s" : ""} {booked ? "(Unavailable)" : ""}</option>;
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Court</label>
                  <select className="form-select" title="Court" value={editValues.courtNumber} onChange={e => setEditValues(p => ({ ...p, courtNumber: parseInt(e.target.value) }))}>
                    <option value={1}>Court 1</option>
                    <option value={2}>Court 2</option>
                  </select>
                </div>
              </div>

              <div className="booking-info-box">
                <p className="booking-info-label">Booking Info</p>
                <div className="booking-info-grid">
                  <span className="booking-info-key">Booking ID:</span>
                  <span className="booking-info-value">{editingBooking.id}</span>
                  <span className="booking-info-key">Access Code:</span>
                  <span className="booking-info-code">{editingBooking.accessCode}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer-flat">
              <button className="btn btn-ghost" onClick={() => setEditingBooking(null)} disabled={editLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editLoading}>
                {editLoading ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg> Saving...</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Booking Confirmation Modal ── */}
      {cancellingBooking && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-lg">
            <div className="modal-header">
              <h3 className="modal-title modal-title-flex">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                Cancel Booking
              </h3>
              <button onClick={() => { setCancellingBooking(null); setCancelError(null); }} className="modal-close-raw">✕</button>
            </div>
            <div className="modal-body-padded">
              {(() => {
                const check = canCancelBooking(cancellingBooking.date, cancellingBooking.timeSlot);
                if (!check.allowed) {
                  return (
                    <div className="alert alert-danger mb-4">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="nowrap mt-1"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      <div><strong className="font-bold block mb-1">Cancellation Not Allowed</strong>{check.message}</div>
                    </div>
                  );
                }
                return null;
              })()}

              {cancelError && (
                <div className="alert alert-danger mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <div>{cancelError}</div>
                </div>
              )}

              <div className="cancel-danger-box">
                <p className="cancel-danger-title">You are about to cancel this booking:</p>
                <div className="cancel-danger-grid">
                  <span className="font-medium">Booking ID:</span><span className="mono font-semibold">{cancellingBooking.id}</span>
                  <span className="font-medium">Date:</span><span>{fmtDate(cancellingBooking.date)}</span>
                  <span className="font-medium">Time:</span><span>{cancellingBooking.timeSlot}</span>
                  <span className="font-medium">Court:</span><span>Court {cancellingBooking.courtNumber}</span>
                  <span className="font-medium">Access Code:</span><span className="mono font-bold">{cancellingBooking.accessCode}</span>
                </div>
              </div>

              <p className="cancel-warning-text">
                This action is permanent. The booking will be removed from the system and the time slot will become available for other users. Your access code will no longer work.
              </p>
            </div>
            <div className="modal-footer-flat">
              <button className="btn btn-ghost" onClick={() => { setCancellingBooking(null); setCancelError(null); }} disabled={cancelLoading}>Keep Booking</button>
              {canCancelBooking(cancellingBooking.date, cancellingBooking.timeSlot).allowed && (
                <button className="btn btn-danger" onClick={handleCancelBooking} disabled={cancelLoading}>
                  {cancelLoading ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg> Cancelling...</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg> Confirm Cancellation</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <ConfirmModal
          title="Confirm Logout"
          message="Are you sure you want to log out?"
          variant="warning"
          confirmLabel="Logout"
          onConfirm={() => { sessionStorage.removeItem("token"); sessionStorage.removeItem("user"); navigate("landing"); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* ── Payment Proof Viewer ── */}
      {proofViewUrl && (
        <div className="modal-overlay payment-modal-overlay" onClick={() => setProofViewUrl(null)}>
          <div className="modal-box payment-proof-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title modal-title-flex">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Payment Proof
              </h3>
              <button className="modal-close" onClick={() => setProofViewUrl(null)}>✕</button>
            </div>
            <div className="payment-proof-box">
              {proofViewUrl.toLowerCase().endsWith(".pdf") ? (
                <iframe src={proofViewUrl} title="Payment proof PDF" className="payment-proof-pdf" />
              ) : (
                <img
                  src={proofViewUrl}
                  alt="Payment proof"
                  className="payment-proof-img"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    const msg = document.createElement("div");
                    msg.className = "proof-error-msg";
                    msg.innerHTML = `<p>Could not load image. Click "Open in New Tab" to view the file.</p>`;
                    target.parentNode?.appendChild(msg);
                  }}
                />
              )}
            </div>
            <div className="payment-proof-footer">
              <a href={proofViewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open in New Tab
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => setProofViewUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
