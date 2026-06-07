import React, { useState, useEffect, useRef } from "react";
import { TIME_SLOTS, isSlotWithinBookingRange, getMaxDurationForStartTime, getFullTimeSlotString, isSlotInPast } from "../data/mockData";
import { api } from "../config";
import { Copy, CheckCircle2, Upload } from "lucide-react";

interface BookingModalProps {
  userName: string;
  userEmail: string;
  userId: string;
  onClose: () => void;
  onConfirmed: (booking: {
    date: string;
    timeSlot: string;
    accessCode: string;
    id: string;
    courtNumber: number;
  }) => void;
}

// Keypad component showing which digits are "active" (entered)
function IoTKeypad({ code }: { code: string }) {
  const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];
  const activeDigits = code.split("");
  return (
    <div className="iot-keypad-section">
      <p className="iot-keypad-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-icon icon-mr-sm">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        3×4 Matrix Keypad
      </p>
      <div className="iot-keypad">
        {keys.map((k) => (
          <div
            key={k}
            className={`keypad-key ${k === "*" || k === "#" ? (k === "*" ? "star" : "hash") : ""} ${activeDigits.includes(k) ? "active" : ""}`}
          >
            {k === "*" ? "✱" : k === "#" ? "#" : k}
          </div>
        ))}
      </div>
      <div className="iot-status">
        <div className="iot-status-dot unlocked"></div>
        <span className="text-xs text-success">Gate Unlocked during time slot</span>
      </div>
    </div>
  );
}

export function BookingModal({ userName, userEmail, userId, onClose, onConfirmed }: BookingModalProps) {
  // Steps: form → payment → success
  const [step, setStep] = useState<"form" | "payment" | "success">("form");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [durationStr, setDurationStr] = useState("1");
  const [selectedCourt, setSelectedCourt] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedCode, setGeneratedCode] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullTimeSlot, setFullTimeSlot] = useState("");
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "approved" | null>(null);
  // Payment state (used in step 2)
  const [pricePerHour, setPricePerHour] = useState<number>(8);
  const [paymentSettings, setPaymentSettings] = useState<{ bankName: string; accountHolderName: string; accountNumber: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = pricePerHour * parseInt(durationStr || "1");

  // Fetch payment settings once on mount
  useEffect(() => {
    fetch(api("/api/payment-settings"))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPaymentSettings(data); })
      .catch(() => {});
  }, []);

  // Fetch court pricing when court selection changes
  useEffect(() => {
    fetch(api("/api/court-pricing"))
      .then(r => r.ok ? r.json() : [])
      .then((data: { court_number: number; price_per_hour: string }[]) => {
        const found = data.find(p => p.court_number === parseInt(selectedCourt));
        if (found) setPricePerHour(Number(found.price_per_hour));
      })
      .catch(() => {});
  }, [selectedCourt]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(f.type)) { setPaymentError("Upload JPG, PNG, WEBP, or PDF files only"); return; }
    if (f.size > 5 * 1024 * 1024) { setPaymentError("File must be under 5 MB"); return; }
    setFile(f);
    setPaymentError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleRemoveFile = () => {
    setFile(null); setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Get min date (today)
  const today = new Date().toISOString().split("T")[0];

  // Fetch existing bookings for selected date+court from backend
  React.useEffect(() => {
    if (!selectedDate) { setExistingBookings([]); return; }
    const fetchBookings = async () => {
      try {
        const res = await fetch(api("/api/bookings/public"));
        if (res.ok) {
          const data = await res.json();
          setExistingBookings(Array.isArray(data) ? data : (data.data || []));
        }
      } catch { setExistingBookings([]); }
    };
    fetchBookings();
  }, [selectedDate]);

  // Check if a slot falls within ANY existing booking for conflict detection
  const isSlotBooked = (slotValue: string, checkDuration = 1) => {
    const dateStr = selectedDate
      ? new Date(selectedDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";

    const candidateStart = TIME_SLOTS.indexOf(slotValue);
    if (candidateStart === -1) return true;
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

  // FIX #3: Duration Constraint - Calculate max duration based on closing time (10 PM)
  const getAvailableDurations = (): number[] => {
    if (!selectedSlot) return [];
    
    const maxDuration = getMaxDurationForStartTime(selectedSlot);
    const durations: number[] = [];
    
    for (let i = 1; i <= maxDuration; i++) {
      // Check if this duration would cause a booking conflict
      if (!isSlotBooked(selectedSlot, i)) {
        durations.push(i);
      }
    }
    
    return durations.length > 0 ? durations : [1]; // Always allow at least 1 hour
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!selectedDate) errs.date = "Please select a date";
    if (!selectedSlot) errs.slot = "Please select a time slot";
    else if (isSlotInPast(selectedDate, selectedSlot)) errs.slot = "Cannot book a time slot that has already passed";
    return errs;
  };

  // Step 1 → Step 2
  const handleProceed = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      const duration = parseInt(durationStr);
      setFullTimeSlot(getFullTimeSlotString(selectedSlot, duration));
      setStep("payment");
    }
  };

  // Step 2 → Step 3: create booking + submit payment proof
  const handleConfirmAndPay = async () => {
    setPaymentError(null);
    if (!file) { setPaymentError("Please upload your DuitNow payment screenshot."); return; }

    setLoading(true);
    const dateDisplay = new Date(selectedDate).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
    const duration = parseInt(durationStr);

    try {
      const token = sessionStorage.getItem("token");
      const headers = token ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
                             : { "Content-Type": "application/json" };

      // 1. Create booking
      const bookingRes = await fetch(api("/api/bookings"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId, userName, userEmail,
          date: dateDisplay,
          timeSlot: fullTimeSlot,
          duration,
          courtNumber: parseInt(selectedCourt),
        }),
      });

      if (!bookingRes.ok) {
        const errData = await bookingRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create booking");
      }

      const bookingData = await bookingRes.json();
      const newBookingId = bookingData.booking?.id || bookingData.id || "";
      setBookingId(newBookingId);
  setGeneratedCode("");

      // 2. Submit payment proof
      const formData = new FormData();
      formData.append("paymentMethod", "qr");
      formData.append("proof", file);

      const paymentRes = await fetch(api(`/api/bookings/${newBookingId}/payment`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!paymentRes.ok) {
        const pErr = await paymentRes.json().catch(() => ({}));
        throw new Error(pErr.error || "Booking created but payment upload failed");
      }

      setPaymentStatus("pending");
      setStep("success");
    } catch (err: any) {
      setPaymentError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  };


  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && step !== "success") onClose(); }}>
      <div className="modal-box">
        {/* Header */}
        <div className="modal-header">
          <h3 className="modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {step === "success" ? "Booking Received" : "Book a Court"}
          </h3>
          {step === "form" && (
            <button className="modal-close" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Stepper */}
        {step !== "success" && (
          <div className="booking-stepper">
            <div className={`booking-stepper-step ${step === "form" ? "active" : "done"}`}>
              <div className="booking-stepper-dot">
                {step !== "form" ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg> : "1"}
              </div>
              <span>Select Slot</span>
            </div>
            <div className="booking-stepper-line" />
            <div className={`booking-stepper-step ${step === "payment" ? "active" : step === "success" ? "done" : ""}`}>
              <div className="booking-stepper-dot">2</div>
              <span>Payment</span>
            </div>
            <div className="booking-stepper-line" />
            <div className={`booking-stepper-step ${step === "success" ? "active" : ""}`}>
              <div className="booking-stepper-dot">3</div>
              <span>Confirmation</span>
            </div>
          </div>
        )}

        <div className="modal-body">
          {/* STEP 1: SELECT SLOT */}
          {step === "form" && (
            <form onSubmit={handleProceed}>
              {/* Court Selection */}
              <div className="form-group">
                <label className="form-label">Select Court</label>
                <div className="court-select-row">
                  {["1", "2"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedCourt(c)}
                      className={`court-select-btn ${selectedCourt === c ? "active" : ""}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="block-icon">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="12" y1="3" x2="12" y2="21" />
                      </svg>
                      Court {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">
                  Select Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  title="Select date"
                  min={today}
                  value={selectedDate}
                  onChange={(e) => { setSelectedDate(e.target.value); setErrors(p => ({ ...p, date: "" })); }}
                />
                {errors.date && <p className="form-error">{errors.date}</p>}
              </div>

              {/* Duration Segment */}
              <div className="form-group booking-form-row">
                <div className="flex-1">
                  <label className="form-label">
                    Select Time Slot <span className="required">*</span>
                  </label>
                  <select
                    className="form-select"
                    title="Select time slot"
                    value={selectedSlot}
                    onChange={(e) => { setSelectedSlot(e.target.value); setErrors(p => ({ ...p, slot: "" })); }}
                  >
                    <option value="">-- Choose start time --</option>
                    {TIME_SLOTS.map((slot) => {
                      const booked = isSlotBooked(slot, parseInt(durationStr));
                      const past = isSlotInPast(selectedDate, slot);
                      const unavailable = booked || past;
                      return (
                        <option key={slot} value={slot} disabled={unavailable}>
                          {slot.split(/[-–]/)[0].trim()} {past ? "(Past)" : booked ? "(Unavailable)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {errors.slot && <p className="form-error">{errors.slot}</p>}
                </div>

                <div className="flex-1">
                  <label className="form-label">Duration</label>
                  <select
                    className="form-select"
                    title="Duration"
                    value={durationStr}
                    onChange={(e) => setDurationStr(e.target.value)}
                    disabled={!selectedSlot}
                  >
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

              <div className="form-group">
                <p className="form-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-icon icon-mr-sm">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
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
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  Continue to Payment
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: PAYMENT */}
          {step === "payment" && (
            <div>
              {/* Booking summary */}
              <div className="booking-summary-box">
                <h4 className="booking-summary-title">Booking Summary</h4>
                {[
                  { label: "Name", value: userName },
                  { label: "Court", value: `Court ${selectedCourt}` },
                  { label: "Date", value: formatDateDisplay(selectedDate) },
                  { label: "Time Slot", value: fullTimeSlot },
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
                {!file ? (
                  <div className="upload-drop-area" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={28} className="upload-drop-icon" />
                    <p className="upload-drop-text">Click to select file</p>
                    <p className="upload-drop-hint">JPG, PNG or PDF — max 5 MB</p>
                  </div>
                ) : (
                  <div className="upload-preview-box">
                    {preview && file.type.startsWith("image/") && (
                      <img src={preview} alt="Preview" className="upload-preview-thumb" />
                    )}
                    <div className="upload-preview-info">
                      <p className="upload-preview-name">{file.name}</p>
                      <p className="upload-preview-size">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button type="button" className="upload-preview-remove" onClick={handleRemoveFile}>✕</button>
                  </div>
                )}
                <input type="file" accept="image/*,.pdf" ref={fileInputRef} className="sr-only" title="Upload payment proof" aria-label="Upload payment proof" onChange={handleFileChange} />
              </div>

              {paymentError && (
                <div className="alert alert-error payment-error-box">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {paymentError}
                </div>
              )}

              <div className="modal-footer modal-footer-bare">
                <button className="btn btn-ghost" onClick={() => setStep("form")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
                <button className="btn btn-primary payment-submit-btn" onClick={handleConfirmAndPay} disabled={loading || !file}>
                  {loading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="loading-spinner">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Submit Payment Proof
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS */}
          {step === "success" && (
            <div>
              {/* Compact success header */}
              <div className="booking-success-header mb-3">
                <div className="booking-success-header-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
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
                  <p className="approval-pending-sub">Admin will review your proof and activate your access code. Confirmation will be emailed to <strong>{userEmail}</strong>.</p>
                </div>
              </div>

              {/* Compact booking summary */}
              <div className="booking-summary-pending mb-3">
                <div className="booking-summary-pending-header">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  Booking Summary
                </div>
                <div className="booking-summary-pending-body">
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Booking ID</span><span className="booking-summary-row-value">{bookingId}</span></div>
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Court</span><span className="booking-summary-row-value">Court {selectedCourt}</span></div>
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Date</span><span className="booking-summary-row-value">{formatDateDisplay(selectedDate)}</span></div>
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Time</span><span className="booking-summary-row-value">{fullTimeSlot}</span></div>
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Amount Paid</span><span className="booking-summary-row-value">RM {totalAmount.toFixed(2)}</span></div>
                  <div className="booking-summary-row"><span className="booking-summary-row-label">Access Code</span><span className="booking-summary-row-value"><span className="payment-badge payment-badge-pending">Pending Approval</span></span></div>
                </div>
              </div>

              <div className="next-steps-box mb-3">
                <p className="next-steps-title">What Happens Next?</p>
                <div className="next-steps-list">
                  <div className="next-step-item">
                    <div className="next-step-num">1</div>
                    <p>Admin reviews your payment proof (usually within a few hours)</p>
                  </div>
                  <div className="next-step-item">
                    <div className="next-step-num">2</div>
                    <p>4-digit access code emailed to <strong>{userEmail}</strong> once approved</p>
                  </div>
                  <div className="next-step-item">
                    <div className="next-step-num">3</div>
                    <p>Enter the code at the gate keypad during your reserved time slot</p>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={() => {
                  onConfirmed({
                    date: formatDateDisplay(selectedDate),
                    timeSlot: fullTimeSlot,
                    accessCode: "",
                    id: bookingId,
                    courtNumber: parseInt(selectedCourt),
                  });
                  onClose();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Done
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
