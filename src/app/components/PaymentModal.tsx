import React, { useState, useEffect, useRef } from "react";
import { api } from "../config";
import { toast } from "sonner";
import { CheckCircle2, Upload, CreditCard, Banknote } from "lucide-react";

interface PaymentModalProps {
  bookingId: string;
  courtNumber: number;
  date: string;
  timeSlot: string;
  duration: number;
  isAdmin?: boolean;
  onSuccess: (paymentStatus: "pending" | "approved") => void;
  onSkip?: () => void;
}

export function PaymentModal({
  bookingId,
  courtNumber,
  date,
  timeSlot,
  duration,
  isAdmin = false,
  onSuccess,
  onSkip,
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<"qr" | "cash">(isAdmin ? "cash" : "qr");
  const [pricePerHour, setPricePerHour] = useState<number>(8);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bankDetails, setBankDetails] = useState({ bankName: "", accountHolderName: "", accountNumber: "" });

  const totalAmount = pricePerHour * duration;

  // Fetch court pricing
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const res = await fetch(api("/api/court-pricing"));
        if (res.ok) {
          const data: { court_number: number; price_per_hour: string }[] = await res.json();
          const courtPrice = data.find((p) => p.court_number === courtNumber);
          if (courtPrice) setPricePerHour(Number(courtPrice.price_per_hour));
        }
      } catch {
        // Keep default RM 8
      }
    };
    fetchPricing();
  }, [courtNumber]);

  // Fetch bank details
  useEffect(() => {
    const fetchBankDetails = async () => {
      try {
        const res = await fetch(api("/api/payment-settings"));
        if (res.ok) {
          const data = await res.json();
          setBankDetails({
            bankName: data.bankName || "",
            accountHolderName: data.accountHolderName || "",
            accountNumber: data.accountNumber || "",
          });
        }
      } catch {
        // Keep empty
      }
    };
    fetchBankDetails();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(f.type)) {
      setError("Upload JPG, PNG, WEBP, or PDF files only");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB");
      return;
    }
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setError(null);

    if (paymentMethod === "qr" && !file) {
      setError("Please upload your payment proof screenshot.");
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const token = sessionStorage.getItem("token");
      const formData = new FormData();
      formData.append("paymentMethod", paymentMethod);
      if (paymentMethod === "qr" && file) {
        formData.append("proof", file);
      }

      const res = await fetch(api(`/api/bookings/${bookingId}/payment`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Payment submission failed");
      }

      const data = await res.json();
      const status: "pending" | "approved" = data.paymentStatus || "pending";

      if (status === "approved") {
        toast.success("Cash payment recorded. Access code is now active!");
      } else {
        toast.success("Payment proof submitted! Awaiting admin approval.");
      }
      onSuccess(status);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        setError("Upload timed out. Please check your connection and try again.");
      } else {
        setError(err.message || "Failed to submit payment. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Price Breakdown */}
      <div className="price-breakdown">
        <div className="price-breakdown-row">
          <span>Court {courtNumber}</span>
          <span>{date}</span>
        </div>
        <div className="price-breakdown-row">
          <span>Time Slot</span>
          <span>{timeSlot}</span>
        </div>
        <div className="price-breakdown-row">
          <span>Duration</span>
          <span>{duration} Hour{duration !== 1 ? "s" : ""}</span>
        </div>
        <div className="price-breakdown-row">
          <span>Rate</span>
          <span>RM {pricePerHour.toFixed(2)} / hour</span>
        </div>
        <div className="price-breakdown-total">
          <span>Total Amount</span>
          <span>RM {totalAmount.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Method Selection */}
      {isAdmin && (
        <div className="form-group">
          <label className="form-label">Payment Method</label>
          <div className="payment-method-tabs">
            <button
              type="button"
              className={`payment-method-tab${paymentMethod === "qr" ? " active" : ""}`}
              onClick={() => setPaymentMethod("qr")}
            >
              <CreditCard size={18} />
              QR Payment
            </button>
            <button
              type="button"
              className={`payment-method-tab${paymentMethod === "cash" ? " active" : ""}`}
              onClick={() => setPaymentMethod("cash")}
            >
              <Banknote size={18} />
              Cash
            </button>
          </div>
        </div>
      )}

      {/* QR Payment Section */}
      {paymentMethod === "qr" && (
        <>
          <div className="payment-card">
            <div className="payment-card-header">
              <span className="payment-card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                DuitNow QR Code
              </span>
              <span className="qr-sub-label">Scan to pay</span>
            </div>
            <div className="payment-card-body">
              <div className="qr-display-box">
                <img src="/images/duitnowqr.jpg" alt="DuitNow QR Code" />
                <div>
                  <p className="qr-display-label">Pickleball Court Booking</p>
                  <p className="qr-display-sub">Scan with your banking app</p>
                  <p className="qr-amount-label">
                    Amount: <strong className="amount-strong">RM {totalAmount.toFixed(2)}</strong>
                  </p>
                  {(bankDetails.bankName || bankDetails.accountHolderName || bankDetails.accountNumber) && (
                    <div className="qr-bank-details">
                      {bankDetails.bankName && (
                        <div className="qr-bank-row">
                          <span className="qr-bank-label">Bank</span>
                          <span className="qr-bank-value">{bankDetails.bankName}</span>
                        </div>
                      )}
                      {bankDetails.accountHolderName && (
                        <div className="qr-bank-row">
                          <span className="qr-bank-label">Account Holder</span>
                          <span className="qr-bank-value">{bankDetails.accountHolderName}</span>
                        </div>
                      )}
                      {bankDetails.accountNumber && (
                        <div className="qr-bank-row">
                          <span className="qr-bank-label">Account No.</span>
                          <span className="qr-bank-value">{bankDetails.accountNumber}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Proof Upload */}
          <div className="form-group">
            <label className="form-label">
              Upload Payment Screenshot <span className="required">*</span>
            </label>
            <div className="upload-zone">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                title="Upload payment proof"
              />
              <div className="upload-zone-icon">
                <Upload size={18} />
              </div>
              <p className="upload-zone-label">Click or drag to upload</p>
              <p className="upload-zone-hint">JPG, PNG, WEBP or PDF · Max 5 MB</p>
            </div>
            {preview && (
              <div className="upload-preview">
                <img src={preview} alt="Payment proof preview" />
                <div className="upload-preview-info">
                  <p className="upload-preview-name">{file?.name}</p>
                  <p className="upload-preview-size">
                    {file ? (file.size / 1024).toFixed(0) : 0} KB
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleRemoveFile}
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            )}
            <p className="form-hint form-hint-payment">
              Take a screenshot of your DuitNow payment confirmation and upload it here.
            </p>
          </div>
        </>
      )}

      {/* Cash Payment Section (admin only) */}
      {paymentMethod === "cash" && isAdmin && (
        <div className="alert alert-info payment-info-box">
          <CheckCircle2 size={16} />
          <div>
            Cash payment of <strong>RM {totalAmount.toFixed(2)}</strong> will be recorded as received.
            The access code will be activated immediately.
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger payment-error-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      <div className="modal-footer modal-footer-bare">
        {onSkip && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onSkip}
            disabled={loading}
            title="Pay later from My Bookings"
          >
            Pay Later
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary payment-submit-btn"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-spinner">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Submitting...
            </>
          ) : paymentMethod === "cash" ? (
            <>
              <CheckCircle2 size={15} />
              Confirm Cash Payment
            </>
          ) : (
            <>
              <Upload size={15} />
              Submit Payment Proof
            </>
          )}
        </button>
      </div>
    </div>
  );
}
