import React, { useState, useEffect, useRef } from "react";
import { TIME_SLOTS, isSlotWithinBookingRange, getMaxDurationForStartTime, getFullTimeSlotString, isSlotInPast } from "../data/mockData";
import { api } from "../config";
import { Copy, CheckCircle2, Upload } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

interface GuestDashboardProps {
  navigate: (page: string) => void;
}

interface Booking {
  id: string;
  date: string;
  timeSlot: string;
  accessCode: string;
  courtNumber: number;
  userName: string;
  userEmail: string;
}

export function GuestDashboard({ navigate }: GuestDashboardProps) {
  const [step, setStep] = useState<"info" | "booking" | "payment" | "success">("info");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({});
  const [booking, setBooking] = useState<Booking | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Booking form state
  const [selectedCourt, setSelectedCourt] = useState("1");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [durationStr, setDurationStr] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);

  // Payment step state
  const [pricePerHour, setPricePerHour] = useState<number>(8);
  const [paymentSettings, setPaymentSettings] = useState<{ bankName: string; accountHolderName: string; accountNumber: string } | null>(null);
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payPreview, setPayPreview] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch court pricing when court changes
  useEffect(() => {
    fetch(api("/api/payment-settings"))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPaymentSettings(data); })
      .catch(() => {});
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

  const today = new Date().toISOString().split("T")[0];

  // Fetch existing bookings for availability checking
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch(api("/api/bookings/public"));
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (data.data || []);
          setExistingBookings(arr);
        }
      } catch { /* ignore */ }
    };
    fetchBookings();
  }, [selectedDate, selectedCourt]);

  const isSlotBooked = (slot: string, checkDuration: number): boolean => {
    if (!selectedDate) return false;
    const dateStr = new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const candidateStart = TIME_SLOTS.indexOf(slot);
    if (candidateStart === -1) return false;
    if (candidateStart + checkDuration > TIME_SLOTS.length) return true;
    const candidateEnd = candidateStart + checkDuration - 1;
    for (let i = candidateStart; i <= candidateEnd; i++) {
      const currentSlot = TIME_SLOTS[i];
      const conflict = existingBookings.find(b => {
        const bDate = b.date;
        const bCourt = b.court_number || b.courtNumber;
        if (bDate !== dateStr) return false;
        if (bCourt !== parseInt(selectedCourt)) return false;
        if (b.status === "cancelled") return false;
        return isSlotWithinBookingRange(currentSlot, b.time_slot || b.timeSlot);
      });
      if (conflict) return true;
    }
    return false;
  };

  const getAvailableDurations = (): number[] => {
    if (!selectedSlot) return [];
    const maxDuration = getMaxDurationForStartTime(selectedSlot);
    const durations: number[] = [];
    for (let i = 1; i <= maxDuration; i++) {
      if (!isSlotBooked(selectedSlot, i)) durations.push(i);
    }
    return durations.length > 0 ? durations : [1];
  };

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!guestName.trim()) errs.name = "Full name is required";
    if (!guestEmail.trim()) errs.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) errs.email = "Enter a valid email address";
    setInfoErrors(errs);
    if (Object.keys(errs).length === 0) setStep("booking");
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!selectedDate) errs.date = "Please select a date";
    if (!selectedSlot) errs.slot = "Please select a time slot";
    else if (isSlotInPast(selectedDate, selectedSlot)) errs.slot = "Cannot book a time slot that has already passed";
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep("payment");
  };

  const handlePaymentSubmit = async () => {
    setPayError(null);
    if (!payFile) { setPayError("Please upload your DuitNow payment screenshot."); return; }
    setLoading(true);
    const dateDisplay = new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const duration = parseInt(durationStr);
    const fullTimeSlotStr = getFullTimeSlotString(selectedSlot, duration);

    try {
      // 1. Create booking
      const bookingRes = await fetch(api("/api/guest/bookings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: guestName.trim(),
          userEmail: guestEmail.trim(),
          date: dateDisplay,
          timeSlot: fullTimeSlotStr,
          duration,
          courtNumber: parseInt(selectedCourt),
        }),
      });

      if (!bookingRes.ok) {
        const errData = await bookingRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create booking");
      }
      const bookingData = await bookingRes.json();
      const newBookingId = bookingData.booking?.id || bookingData.id;

      // 2. Upload payment proof
      const formData = new FormData();
      formData.append("paymentMethod", "qr");
      formData.append("proof", payFile);
      const uploadController = new AbortController();
      const uploadTimeout = setTimeout(() => uploadController.abort(), 60000);
      try {
        const payRes = await fetch(api(`/api/guest/bookings/${newBookingId}/payment`), {
          method: "POST",
          body: formData,
          signal: uploadController.signal,
        });
        clearTimeout(uploadTimeout);
        if (!payRes.ok) {
          const pErr = await payRes.json().catch(() => ({}));
          // Booking was created but proof failed — still proceed to success
          console.warn("Payment proof upload failed:", pErr.error);
        }
      } catch (uploadErr: any) {
        clearTimeout(uploadTimeout);
        if (uploadErr.name === "AbortError") {
          console.warn("Payment proof upload timed out — booking still created");
        } else {
          console.warn("Payment proof upload error:", uploadErr.message);
        }
      }

      setBooking({
        id: newBookingId,
        date: dateDisplay,
        timeSlot: fullTimeSlotStr,
        accessCode: "",
        courtNumber: parseInt(selectedCourt),
        userName: guestName.trim(),
        userEmail: guestEmail.trim(),
      });
      setStep("success");
    } catch (err: any) {
      setPayError(err.message || "Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (booking) {
      navigator.clipboard.writeText(booking.accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="guest-page">
      {/* Navbar */}
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Guest User
            <span className="pb-navbar-badge guest">Guest</span>
          </div>
          <button className="btn-logout btn" onClick={() => setShowExitConfirm(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Exit
          </button>
        </div>
      </nav>

      <div className="guest-content-wrap">
        {/* Welcome */}
        <div className="guest-welcome-banner">
          <div>
            <span className="guest-session-pill">
              <span className="guest-session-dot"></span>
              Guest Session
            </span>
            <h2 className="guest-welcome-title">Reserve a Pickleball Court</h2>
            <p className="guest-welcome-desc">Book a time slot, pay digitally, and unlock the court with your unique IoT access code — no account required.</p>
            <div className="guest-welcome-chips">
              <span className="guest-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                IoT Gate Access
              </span>
              <span className="guest-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Instant Booking
              </span>
              <span className="guest-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                No Account Needed
              </span>
            </div>
          </div>
        </div>

        {/* Guest note */}
        <div className="alert alert-info mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            You're browsing as a guest. Your booking will be submitted and awaiting admin approval.{" "}
            <button className="auth-link text-base" onClick={() => navigate("register")}>
              Create an account
            </button>{" "}
            to manage all your bookings and history.
          </div>
        </div>

        {/* ══════ STEP 1: Guest Info Collection ══════ */}
        {step === "info" && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Your Details
              </h3>
            </div>
            <div className="card-body">
              <p className="text-sm text-muted mb-4">Please provide your name and email to proceed with the booking.</p>
              <form onSubmit={handleInfoSubmit}>
                <div className="form-group">
                  <label className="form-label">Full Name <span className="required">*</span></label>
                  <input
                    type="text"
                    className={`form-input ${infoErrors.name ? "error" : ""}`}
                    placeholder="Enter your full name"
                    value={guestName}
                    onChange={(e) => { setGuestName(e.target.value); setInfoErrors(p => ({ ...p, name: "" })); }}
                  />
                  {infoErrors.name && <p className="form-error">{infoErrors.name}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address <span className="required">*</span></label>
                  <input
                    type="email"
                    className={`form-input ${infoErrors.email ? "error" : ""}`}
                    placeholder="Enter your email address"
                    value={guestEmail}
                    onChange={(e) => { setGuestEmail(e.target.value); setInfoErrors(p => ({ ...p, email: "" })); }}
                  />
                  {infoErrors.email && <p className="form-error">{infoErrors.email}</p>}
                </div>
                <button type="submit" className="btn btn-primary btn-lg btn-full">
                  Continue to Booking
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ══════ STEP 2: Booking Form ══════ */}
        {step === "booking" && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Reserve a Court
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep("info")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                Back
              </button>
            </div>
            <div className="card-body">
              <div className="alert alert-info mb-4">
                Booking for: <strong>{guestName}</strong> ({guestEmail})
              </div>

              {errors.submit && (
                <div className="alert alert-danger mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <div>{errors.submit}</div>
                </div>
              )}

              <form onSubmit={handleBookingSubmit}>
                {/* Court Selection */}
                <div className="form-group">
                  <label className="form-label">Select Court</label>
                  <div className="court-select-row">
                    {["1", "2"].map((c) => (
                      <button key={c} type="button" onClick={() => setSelectedCourt(c)} className={`court-select-btn ${selectedCourt === c ? "active" : ""}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="block-icon"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                        Court {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div className="form-group">
                  <label className="form-label">Select Date <span className="required">*</span></label>
                  <input type="date" className="form-input" title="Select date" min={today} value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setErrors(p => ({ ...p, date: "" })); }} />
                  {errors.date && <p className="form-error">{errors.date}</p>}
                </div>

                {/* Time Slot + Duration */}
                <div className="form-group booking-form-row">
                  <div className="flex-1">
                    <label className="form-label">Select Time Slot <span className="required">*</span></label>
                    <select className="form-select" title="Select time slot" value={selectedSlot} onChange={(e) => { setSelectedSlot(e.target.value); setErrors(p => ({ ...p, slot: "" })); }}>
                      <option value="">-- Choose start time --</option>
                      {TIME_SLOTS.map((slot) => {
                        const booked = isSlotBooked(slot, parseInt(durationStr));
                        const past = isSlotInPast(selectedDate, slot);
                        const unavailable = booked || past;
                        return (<option key={slot} value={slot} disabled={unavailable}>{slot.split(/[-–]/)[0].trim()} {past ? "(Past)" : booked ? "(Unavailable)" : ""}</option>);
                      })}
                    </select>
                    {errors.slot && <p className="form-error">{errors.slot}</p>}
                  </div>
                  <div className="flex-1">
                    <label className="form-label">Duration</label>
                    <select className="form-select" title="Duration" value={durationStr} onChange={(e) => setDurationStr(e.target.value)} disabled={!selectedSlot}>
                      <option value="">Select duration...</option>
                      {getAvailableDurations().map(d => (<option key={d} value={d}>{d} Hour{d > 1 ? "s" : ""} {d === getMaxDurationForStartTime(selectedSlot) ? "(Max)" : ""}</option>))}
                    </select>
                    {!selectedSlot && <p className="form-hint text-muted mt-1 text-xs">Select a time slot first</p>}
                  </div>
                </div>

                <div className="form-group">
                  <p className="form-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-icon icon-mr-sm"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    Court closes at 10:00 PM. Maximum duration shown based on your start time.
                  </p>
                </div>

                {/* Live price preview */}
                {selectedSlot && durationStr && (
                  <div className="booking-price-preview">
                    <span className="booking-price-preview-label">Estimated Total</span>
                    <span className="booking-price-preview-amount">RM {(pricePerHour * parseInt(durationStr)).toFixed(2)}</span>
                    <span className="booking-price-preview-sub">RM {pricePerHour.toFixed(2)}/hr × {durationStr}hr</span>
                  </div>
                )}

                <div className="modal-footer modal-footer-bare mt-3">
                  <button type="button" className="btn btn-ghost" onClick={() => setStep("info")}>Back</button>
                  <button type="submit" className="btn btn-primary">
                    Continue to Payment
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════ STEP 3: Payment ══════ */}
        {step === "payment" && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                Payment Details
              </h3>
            </div>
            <div className="card-body">
              {/* Booking summary */}
              <div className="booking-summary-box">
                <h4 className="booking-summary-title">Booking Summary</h4>
                {[
                  { label: "Name", value: guestName },
                  { label: "Email", value: guestEmail },
                  { label: "Court", value: `Court ${selectedCourt}` },
                  { label: "Date", value: formatDateDisplay(selectedDate) },
                  { label: "Time Slot", value: getFullTimeSlotString(selectedSlot, parseInt(durationStr)) },
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

              {/* DuitNow QR */}
              <div className="payment-qr-section">
                <p className="payment-qr-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-icon icon-mr-xs">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    <rect x="14" y="14" width="3" height="3"/>
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

              {/* Upload proof */}
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

              {payError && (
                <div className="alert alert-error payment-error-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {payError}
                </div>
              )}

              <div className="modal-footer modal-footer-bare">
                <button className="btn btn-ghost" onClick={() => setStep("booking")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Back
                </button>
                <button className="btn btn-primary payment-submit-btn" onClick={handlePaymentSubmit} disabled={loading || !payFile}>
                  {loading ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Submitting...</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Submit Payment Proof</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════ STEP 4: Success / Confirmation ══════ */}
        {step === "success" && booking && (
          <div>
            {/* Compact success header */}
            <div className="booking-success-header mb-3">
              <div className="booking-success-header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <p className="booking-success-header-title">Booking Received</p>
                <p className="booking-success-header-sub">Payment proof submitted. Awaiting admin verification.</p>
              </div>
            </div>

            {/* Payment pending notice — includes email info */}
            <div className="approval-pending-banner mb-3">
              <div className="approval-pending-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="approval-pending-text">
                <p className="approval-pending-title">Payment Pending Approval</p>
                <p className="approval-pending-sub">Admin will review your proof. Your 4-digit access code will be emailed to <strong>{booking.userEmail}</strong> once approved.</p>
              </div>
            </div>

            {/* Compact booking summary */}
            <div className="booking-summary-pending mb-3">
              <div className="booking-summary-pending-header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Booking Summary
              </div>
              <div className="booking-summary-pending-body">
                <div className="booking-summary-row"><span className="booking-summary-row-label">Booking ID</span><span className="booking-summary-row-value">{booking.id}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Name</span><span className="booking-summary-row-value">{booking.userName}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Court</span><span className="booking-summary-row-value">Court {booking.courtNumber}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Date</span><span className="booking-summary-row-value">{booking.date}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Time</span><span className="booking-summary-row-value">{booking.timeSlot}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Amount Paid</span><span className="booking-summary-row-value">RM {totalAmount.toFixed(2)}</span></div>
                <div className="booking-summary-row"><span className="booking-summary-row-label">Access Code</span><span className="booking-summary-row-value"><span className="payment-badge payment-badge-pending">Pending Approval</span></span></div>
              </div>
            </div>

            {/* What Happens Next */}
            <div className="next-steps-box mb-3">
              <p className="next-steps-title">What Happens Next</p>
              <div className="next-steps-list">
                <div className="next-step-item">
                  <div className="next-step-num">1</div>
                  <p>Admin reviews your payment proof (usually within a few hours)</p>
                </div>
                <div className="next-step-item">
                  <div className="next-step-num">2</div>
                  <p>4-digit access code emailed to <strong>{booking.userEmail}</strong> once approved</p>
                </div>
                <div className="next-step-item">
                  <div className="next-step-num">3</div>
                  <p>Enter the code at the gate keypad during your reserved time slot</p>
                </div>
              </div>
            </div>

            <button className="btn btn-primary btn-full" onClick={() => {
              setStep("info");
              setBooking(null);
              setSelectedDate("");
              setSelectedSlot("");
              setDurationStr("1");
              setSelectedCourt("1");
              setGuestName("");
              setGuestEmail("");
              setPayFile(null);
              setPayPreview(null);
              setPayError(null);
            }}>Book Another Court</button>
          </div>
        )}

        {/* Sign up CTA (only shown on non-success steps) */}
        {step !== "success" && (
          <div className="guest-signup-cta">
            <div>
              <p className="guest-signup-title">Want to track all your bookings?</p>
              <p className="guest-signup-subtitle">Create a free account to manage your history and profile.</p>
            </div>
            <div className="guest-signup-btns">
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("login")}>Sign In</button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate("register")}>Register Free</button>
            </div>
          </div>
        )}
      </div>

      {showExitConfirm && (
        <ConfirmModal
          title="Exit Guest Booking"
          message="Are you sure you want to exit? Any unsaved booking progress will be lost."
          confirmLabel="Exit"
          cancelLabel="Stay"
          variant="warning"
          onConfirm={() => { sessionStorage.removeItem("token"); sessionStorage.removeItem("user"); navigate("landing"); }}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  );
}
