import React, { useState, useEffect, useRef } from "react";
import { TIME_SLOTS, Booking, isSlotWithinBookingRange, getMaxDurationForStartTime, getFullTimeSlotString, isSlotInPast } from "../data/mockData";
import { api } from "../config";
import { CheckCircle2, Copy, UserPlus, Users, Upload } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface GuestBookingModalProps {
  adminName: string;
  adminId: string;
  onClose: () => void;
  onCreated: (booking: Booking) => void;
}

export function GuestBookingModal({ adminName, adminId, onClose, onCreated }: GuestBookingModalProps) {
  const [step, setStep] = useState<"form" | "payment" | "success">("form");
  const [guestType, setGuestType] = useState<"new" | "existing">("new");

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [durationStr, setDurationStr] = useState("1");
  const [selectedCourt, setSelectedCourt] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  const [existingUsers, setExistingUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Payment step state
  const [paymentMethod, setPaymentMethod] = useState<"qr" | "cash">("cash");
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [pricePerHour, setPricePerHour] = useState<number>(8);
  const [paymentSettings, setPaymentSettings] = useState<{ bankName: string; accountHolderName: string; accountNumber: string } | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payPreview, setPayPreview] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split("T")[0];

  // Fetch users and bookings from backend on mount
  useEffect(() => {
    fetch(api("/api/payment-settings"))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPaymentSettings(data); })
      .catch(() => {});
  }, []);

  // Fetch users and bookings from backend on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};

        // Fetch non-admin users
        const usersRes = await fetch(api("/api/users"), { headers });
        if (usersRes.ok) {
          const allUsers = await usersRes.json();
          setExistingUsers(allUsers.filter((u: User) => u.role !== "admin"));
        }

        // Fetch all bookings for conflict checking
        const bookingsRes = await fetch(api("/api/bookings"), { headers });
        if (bookingsRes.ok) {
          const allBookingsData = await bookingsRes.json();
          // Handle both array and paginated response formats
          const bookingsArray = Array.isArray(allBookingsData) ? allBookingsData : (allBookingsData.data || []);
          
          // Convert snake_case from API to camelCase for frontend consistency
          const convertedBookings = bookingsArray.map((b: any) => ({
            id: b.id || b.booking_id,
            userId: b.userId || b.user_id,
            userName: b.userName || b.user_name || "",
            userEmail: b.userEmail || b.user_email || "",
            date: b.date,
            timeSlot: b.timeSlot || b.time_slot || "",
            accessCode: b.accessCode || b.access_code || "",
            status: b.status || "confirmed",
            courtNumber: typeof b.courtNumber === "number" ? b.courtNumber : parseInt(b.court_number || "1"),
            createdAt: b.createdAt || b.created_at,
            // Keep original fields for backward compatibility
            ...b
          }));
          
          setBookings(convertedBookings);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        setExistingUsers([]);
        setBookings([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchData();
  }, []);

  // Fetch court pricing when court changes
  useEffect(() => {
    fetch(api("/api/court-pricing"))
      .then(r => r.ok ? r.json() : [])
      .then((data: { court_number: number; price_per_hour: string }[]) => {
        const found = data.find(p => p.court_number === parseInt(selectedCourt));
        if (found) setPricePerHour(Number(found.price_per_hour));
      })
      .catch(() => {});
  }, [selectedCourt]);

  const totalAmount = pricePerHour * parseInt(durationStr || "1");

  const handlePayFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(f.type)) { setPayError("Upload JPG, PNG, WEBP, or PDF files only"); return; }
    if (f.size > 5 * 1024 * 1024) { setPayError("File must be under 5 MB"); return; }
    setPayFile(f); setPayError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPayPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleRemovePayFile = () => {
    setPayFile(null); setPayPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // FIX #2: Multi-Hour Visibility - Check if a slot falls within ANY existing booking
  const isSlotBooked = (slotValue: string, checkDuration = 1) => {
    const dateStr = selectedDate
      ? new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const candidateStart = TIME_SLOTS.indexOf(slotValue);
    if (candidateStart === -1) return true;
    if (candidateStart + checkDuration > TIME_SLOTS.length) return true;
    const candidateEnd = candidateStart + checkDuration - 1;
    
    // Check if ANY hour in our range overlaps with existing bookings
    for (let i = candidateStart; i <= candidateEnd; i++) {
      const currentSlot = TIME_SLOTS[i];
      
      const bookedBooking = bookings.find(b => {
        if (b.date !== dateStr) return false;
        if (b.courtNumber !== parseInt(selectedCourt)) return false;
        if (b.status === "cancelled") return false;
        
        return isSlotWithinBookingRange(currentSlot, b.timeSlot);
      });
      
      if (bookedBooking) return true;
    }
    
    return false;
  };

  // FIX #3: Duration Constraint - Calculate max duration based on closing time (10 PM)
  const getAvailableDurations = (): number[] => {
    if (!selectedSlot) return [];
    
    const maxDuration = getMaxDurationForStartTime(selectedSlot);
    const durations: number[] = [];
    
    for (let i = 1; i <= maxDuration; i++) {
      if (!isSlotBooked(selectedSlot, i)) {
        durations.push(i);
      }
    }
    
    return durations.length > 0 ? durations : [1];
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (guestType === "new") {
      if (!guestName.trim()) errs.guestName = "Guest name is required";
      if (!guestEmail.trim()) errs.guestEmail = "Guest email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) errs.guestEmail = "Enter a valid email address";
    } else {
      if (!selectedUserId) errs.selectedUser = "Please choose a registered user";
    }
    if (!selectedDate) errs.date = "Please select a date";
    if (!selectedSlot) errs.slot = "Please select a time slot";
    else if (isSlotInPast(selectedDate, selectedSlot)) errs.slot = "Cannot book a time slot that has already passed";
    return errs;
  };

  // Form step submit → go to payment step
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep("payment");
  };

  // Payment step submit → create booking + record payment → success
  const handlePaymentSubmit = async () => {
    setPayError(null);
    if (paymentMethod === "qr" && !payFile) {
      setPayError("Please upload the QR payment screenshot.");
      return;
    }
    setLoading(true);

    const duration = parseInt(durationStr);
    const fullTimeSlotStr = getFullTimeSlotString(selectedSlot, duration);
    const dateDisplay = new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    let bookingUserName = guestName.trim();
    let bookingUserEmail = guestEmail.trim() || "";
    let bookingUserId: string | null = null;

    if (guestType === "existing") {
      const existing = existingUsers.find(u => u.id === selectedUserId);
      if (existing) {
        bookingUserName = existing.name;
        bookingUserEmail = existing.email;
        bookingUserId = existing.id;
      }
    }

    try {
      const token = sessionStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // 1. Create booking
      const res = await fetch(api("/api/bookings"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: bookingUserId,
          userName: bookingUserName,
          userEmail: bookingUserEmail,
          date: dateDisplay,
          timeSlot: fullTimeSlotStr,
          duration,
          courtNumber: parseInt(selectedCourt),
          bookedBy: adminName,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create booking");
      }

      const createdData = await res.json();
      const createdAccessCode = createdData.booking?.access_code || createdData.booking?.accessCode || createdData.access_code || createdData.accessCode || "";
      const newBooking: Booking = {
        id: createdData.booking?.id || createdData.id || `BK${Date.now()}`,
        userId: bookingUserId,
        userName: bookingUserName,
        userEmail: bookingUserEmail,
        date: dateDisplay,
        timeSlot: fullTimeSlotStr,
        duration,
        accessCode: createdAccessCode,
        status: "confirmed",
        courtNumber: parseInt(selectedCourt),
        createdAt: today,
        bookedByAdmin: adminName,
      };

      // 2. Record payment
      const formData = new FormData();
      formData.append("paymentMethod", paymentMethod);
      if (paymentMethod === "qr" && payFile) formData.append("proof", payFile);
      const payToken = sessionStorage.getItem("token");
      const payRes = await fetch(api(`/api/bookings/${newBooking.id}/payment`), {
        method: "POST",
        headers: payToken ? { Authorization: `Bearer ${payToken}` } : {},
        body: formData,
      });

      const paymentWasApproved = paymentMethod === "cash" && payRes.ok;
      const finalizedBooking = {
        ...newBooking,
        accessCode: paymentWasApproved ? newBooking.accessCode : "",
      };

      setGeneratedCode(paymentWasApproved ? newBooking.accessCode : "");
      setCreatedBooking(finalizedBooking);
      setPaymentApproved(paymentWasApproved);

      setStep("success");
      onCreated(finalizedBooking);
    } catch (err) {
      console.error("Booking error:", err);
      setPayError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── SUCCESS SCREEN ────────────────────────────────────────────
  if (step === "success" && createdBooking) {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-lg">
          <div className="modal-header">
            <h2 className="modal-title">
              <CheckCircle2 size={18} color="var(--success)" />
              Booking Received
            </h2>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="alert alert-success mb-3">
              <CheckCircle2 size={16} />
              <div>Booking successful for <strong>{createdBooking.userName}</strong> — recorded as Booked by Admin <strong>{adminName}</strong>.</div>
            </div>

            {paymentApproved ? (
              <div className="alert alert-success mb-3">
                <CheckCircle2 size={16} />
                <div>Cash payment recorded. Access code is now <strong>active</strong>.</div>
              </div>
            ) : (
              <div className="approval-pending-banner mb-3">
                <div className="approval-pending-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="approval-pending-text">
                  <p className="approval-pending-title">Payment Pending Approval</p>
                  <p className="approval-pending-sub">QR proof submitted. Access code will be emailed to <strong>{createdBooking.userEmail}</strong> after you approve in Manage Payments.</p>
                </div>
              </div>
            )}

            <div className={`access-code-card${!paymentApproved ? " access-code-pending" : ""} mb-4`}>
              <p className="access-code-label">4-Digit IoT Gate Access Code</p>
              {!paymentApproved ? (
                <div className="access-code-pending-notice">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <div>
                    <p className="access-code-pending-title">Not Available Yet</p>
                    <p className="access-code-pending-sub">Code will be sent to <strong>{createdBooking.userEmail}</strong> once you approve the payment.</p>
                  </div>
                </div>
              ) : (
                <div className="access-code-digits">
                  {generatedCode.split("").map((d, i) => (
                    <div key={i} className="access-code-digit">{d}</div>
                  ))}
                </div>
              )}
              <div className="access-code-details">
                <div className="access-code-detail-row">
                  <span>{guestType === "existing" ? "User Name" : "Guest Name"}</span><span>{createdBooking.userName}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>{guestType === "existing" ? "User Email" : "Guest Email"}</span><span>{createdBooking.userEmail}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Court</span><span>Court {createdBooking.courtNumber}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Date</span><span>{createdBooking.date}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Time</span><span>{createdBooking.timeSlot}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Duration</span><span>{createdBooking.duration} Hour{createdBooking.duration !== 1 ? "s" : ""}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Amount</span><span>RM {totalAmount.toFixed(2)}</span>
                </div>
                <div className="access-code-detail-row">
                  <span>Payment</span>
                  <span>{paymentApproved ? "Cash — Approved" : "QR — Pending Approval"}</span>
                </div>
              </div>
            </div>

            <div className="guest-success-btns">
              {paymentApproved && (
                <button className="btn btn-primary btn-full" onClick={handleCopy}>
                  <Copy size={14} />
                  {copied ? "Copied!" : "Copy Code"}
                </button>
              )}
              <button className="btn btn-ghost btn-full" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PAYMENT STEP ─────────────────────────────────────────────
  if (step === "payment") {
    const dateDisplay = selectedDate
      ? new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const duration = parseInt(durationStr);
    const timeSlotDisplay = getFullTimeSlotString(selectedSlot, duration);
    const bookingUserName = guestType === "existing"
      ? existingUsers.find(u => u.id === selectedUserId)?.name || ""
      : guestName.trim();

    return (
      <div className="modal-overlay">
        <div className="modal-box modal-box-lg">
          <div className="modal-header">
            <h2 className="modal-title">Payment Details</h2>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            {/* Booking Summary */}
            <div className="booking-summary-box mb-4">
              <h4 className="booking-summary-title">Booking Summary</h4>
              {[
                { label: "Name", value: bookingUserName },
                { label: "Court", value: `Court ${selectedCourt}` },
                { label: "Date", value: dateDisplay },
                { label: "Time Slot", value: timeSlotDisplay },
                { label: "Duration", value: `${durationStr} Hour${durationStr !== "1" ? "s" : ""}` },
              ].map(({ label, value }) => (
                <div key={label} className="booking-summary-row">
                  <span className="booking-summary-label">{label}</span>
                  <span className="booking-summary-value">{value}</span>
                </div>
              ))}
              <div className="booking-summary-row booking-summary-total">
                <span className="booking-summary-label">Total Amount</span>
                <span className="booking-summary-value">RM {totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <div className="radio-group">
                <label
                  className={`radio-card ${paymentMethod === "cash" ? "selected" : ""}`}
                  onClick={() => { setPaymentMethod("cash"); setPayFile(null); setPayPreview(null); setPayError(null); }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                  Cash
                </label>
                <label
                  className={`radio-card ${paymentMethod === "qr" ? "selected" : ""}`}
                  onClick={() => setPaymentMethod("qr")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                  </svg>
                  QR (DuitNow)
                </label>
              </div>
              <p className="form-hint">
                {paymentMethod === "cash"
                  ? "Cash payment will be recorded immediately and the access code will be activated."
                  : "Upload the QR payment screenshot. Access code activates after approval."}
              </p>
            </div>

            {/* QR section — only shown when QR selected */}
            {paymentMethod === "qr" && (
              <>
                <div className="payment-qr-section">
                  <p className="payment-qr-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-icon icon-mr-xs">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    Scan DuitNow QR to Pay
                  </p>
                  <div className="payment-qr-box">
                    <img src="/images/duitnowqr.jpg" alt="DuitNow QR Code" />
                  </div>
                  <p className="payment-qr-amount">RM {totalAmount.toFixed(2)}</p>
                  {paymentSettings && (
                    <div className="qr-bank-details">
                      <span className="qr-bank-value">{paymentSettings.bankName}</span>
                      <span className="qr-bank-value">{paymentSettings.accountHolderName}</span>
                      <span className="qr-bank-value">{paymentSettings.accountNumber}</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Upload Payment Screenshot / Receipt</label>
                  {!payFile ? (
                    <div className="upload-drop-area" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={28} className="upload-drop-icon" />
                      <p className="upload-drop-text">Click to select file</p>
                      <p className="upload-drop-hint">JPG, PNG or PDF — max 5 MB</p>
                    </div>
                  ) : (
                    <div className="upload-preview-box">
                      {payPreview && payFile.type.startsWith("image/") && (
                        <img src={payPreview} alt="Preview" className="upload-preview-thumb" />
                      )}
                      <div className="upload-preview-info">
                        <p className="upload-preview-name">{payFile.name}</p>
                        <p className="upload-preview-size">{(payFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button type="button" className="upload-preview-remove" onClick={handleRemovePayFile}>✕</button>
                    </div>
                  )}
                  <input type="file" accept="image/*,.pdf" ref={fileInputRef} className="sr-only" title="Upload payment proof" aria-label="Upload payment proof" onChange={handlePayFileChange} />
                </div>
              </>
            )}

            {payError && (
              <div className="alert alert-error payment-error-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {payError}
              </div>
            )}

            <div className="modal-footer modal-footer-bare">
              <button type="button" className="btn btn-ghost" onClick={() => setStep("form")} disabled={loading}>Back</button>
              <button type="button" className="btn btn-primary payment-submit-btn" onClick={handlePaymentSubmit}
                disabled={loading || (paymentMethod === "qr" && !payFile)}>
                {loading ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Processing...</>
                ) : paymentMethod === "cash" ? (
                  <><CheckCircle2 size={14} /> Record Cash &amp; Create Booking</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Submit Payment Proof</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── BOOKING FORM ──────────────────────────────────────────────
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box-md">
        <div className="modal-header">
          <h2 className="modal-title">Manual / Guest Booking</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info mb-5">
            This booking will be recorded as <strong>Booked by Admin ({adminName})</strong>.
          </div>

          <form onSubmit={handleFormSubmit}>
            {/* Guest Type Radio Cards */}
            <div className="form-group">
              <label className="form-label">Book for</label>
              <div className="radio-group">
                <label
                  className={`radio-card ${guestType === "new" ? "selected" : ""}`}
                  onClick={() => { setGuestType("new"); setErrors({}); }}
                >
                  <UserPlus size={15} />
                  New Guest
                </label>
                <label
                  className={`radio-card ${guestType === "existing" ? "selected" : ""}`}
                  onClick={() => { setGuestType("existing"); setErrors({}); }}
                >
                  <Users size={15} />
                  Existing User
                </label>
              </div>
            </div>

            {guestType === "new" ? (
              <>
                <div className="form-group">
                  <label className="form-label">Guest Name <span className="required">*</span></label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Alex Tan"
                    value={guestName}
                    onChange={e => { setGuestName(e.target.value); setErrors(p => ({ ...p, guestName: "" })); }}
                  />
                  {errors.guestName && <p className="form-error">{errors.guestName}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Guest Email <span className="required">*</span></label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="guest@example.com"
                    value={guestEmail}
                    onChange={e => { setGuestEmail(e.target.value); setErrors(p => ({ ...p, guestEmail: "" })); }}
                  />
                  {errors.guestEmail && <p className="form-error">{errors.guestEmail}</p>}
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Select Registered User <span className="required">*</span></label>
                <select
                  className="form-select"
                  title="Select user"
                  value={selectedUserId}
                  onChange={e => { setSelectedUserId(e.target.value); setErrors(p => ({ ...p, selectedUser: "" })); }}
                >
                  <option value="">— Choose a registered user —</option>
                  {existingUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                {errors.selectedUser && <p className="form-error">{errors.selectedUser}</p>}
              </div>
            )}

            {/* Court */}
            <div className="form-group">
              <label className="form-label">Court</label>
              <div className="court-tabs mb-0">
                {["1", "2"].map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`court-tab ${selectedCourt === c ? "active" : ""}`}
                    onClick={() => setSelectedCourt(c)}
                  >
                    Court {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="form-group">
              <label className="form-label">Date <span className="required">*</span></label>
              <input
                type="date"
                className="form-input"
                title="Select date"
                min={today}
                value={selectedDate}
                onChange={e => { setSelectedDate(e.target.value); setErrors(p => ({ ...p, date: "" })); }}
              />
              {errors.date && <p className="form-error">{errors.date}</p>}
            </div>

            {/* Time + Duration */}
            <div className="booking-form-row">
              <div className="form-group mb-0">
                <label className="form-label">Start Time <span className="required">*</span></label>
                <select
                  className="form-select"
                  title="Start time"
                  value={selectedSlot}
                  onChange={e => { setSelectedSlot(e.target.value); setErrors(p => ({ ...p, slot: "" })); }}
                >
                  <option value="">— Choose —</option>
                  {TIME_SLOTS.map(slot => {
                    const booked = isSlotBooked(slot, parseInt(durationStr));
                    const past = isSlotInPast(selectedDate, slot);
                    const unavailable = booked || past;
                    return (
                      <option key={slot} value={slot} disabled={unavailable}>
                        {slot.split(/[-–]/)[0].trim()}{past ? " (Past)" : booked ? " (Taken)" : ""}
                      </option>
                    );
                  })}
                </select>
                {errors.slot && <p className="form-error">{errors.slot}</p>}
              </div>
              <div className="form-group mb-0">
                <label className="form-label">Duration</label>
                <select className="form-select" title="Duration" value={durationStr} onChange={e => setDurationStr(e.target.value)} disabled={!selectedSlot}>
                  <option value="">Select duration...</option>
                  {getAvailableDurations().map(d => (
                    <option key={d} value={d}>
                      {d} Hour{d > 1 ? "s" : ""} {d === getMaxDurationForStartTime(selectedSlot) ? "(Max)" : ""}
                    </option>
                  ))}
                </select>
                {!selectedSlot && <p className="form-hint text-muted mt-1 text-xs">Select a time slot first</p>}
              </div>
            </div>

            <p className="form-hint mt-3 mb-4">
              ℹ️ Court closes at 10:00 PM. A 4-digit IoT gate code is generated automatically.
            </p>

            <div className="modal-footer modal-footer-bare">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Continue to Payment
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
