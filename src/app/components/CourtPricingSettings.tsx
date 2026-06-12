import React, { useState, useEffect } from "react";
import { api } from "../config";
import { toast } from "sonner";

interface CourtPrice {
  court_number: number;
  price_per_hour: number;
}

interface BankDetails {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
}

export function CourtPricingSettings() {
  const [prices, setPrices] = useState<CourtPrice[]>([
    { court_number: 1, price_per_hour: 8 },
    { court_number: 2, price_per_hour: 8 },
  ]);
  const [editValues, setEditValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const [bankDetails, setBankDetails] = useState<BankDetails>({ bankName: "", accountHolderName: "", accountNumber: "" });
  const [bankLoading, setBankLoading] = useState(true);
  const [bankSaving, setBankSaving] = useState(false);

  const fetchPricing = async () => {
    try {
      const res = await fetch(api("/api/court-pricing"));
      if (res.ok) {
        const data: CourtPrice[] = await res.json();
        setPrices(data);
        const vals: Record<number, string> = {};
        data.forEach((p) => { vals[p.court_number] = String(p.price_per_hour); });
        setEditValues(vals);
      }
    } catch {
      toast.error("Failed to load pricing.");
    } finally {
      setLoading(false);
    }
  };

  const fetchBankDetails = async () => {
    try {
      const res = await fetch(api("/api/payment-settings"));
      if (res.ok) {
        const data = await res.json();
        setBankDetails({ bankName: data.bankName || "", accountHolderName: data.accountHolderName || "", accountNumber: data.accountNumber || "" });
      }
    } catch {
      toast.error("Failed to load payment settings.");
    } finally {
      setBankLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
    fetchBankDetails();
  }, []);

  const handleSaveBankDetails = async () => {
    setBankSaving(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api("/api/payment-settings"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(bankDetails),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update");
      }
      toast.success("Payment details updated successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update payment details.");
    } finally {
      setBankSaving(false);
    }
  };

  const handleSave = async (courtNumber: number) => {
    const val = parseFloat(editValues[courtNumber]);
    if (isNaN(val) || val < 0 || val > 9999) {
      toast.error("Enter a valid price between RM 0 and RM 9999.");
      return;
    }

    setSaving(courtNumber);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api("/api/court-pricing"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ courtNumber, pricePerHour: val }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update pricing");
      }

      setPrices((prev) =>
        prev.map((p) => p.court_number === courtNumber ? { ...p, price_per_hour: val } : p)
      );
      toast.success(`Court ${courtNumber} pricing updated to RM ${val.toFixed(2)}/hour`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update pricing.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="dashboard-header dash-animate">
        <h1 className="dashboard-welcome">Court Pricing</h1>
        <p className="dashboard-subtitle">Set the hourly rate for each court. Users will see this price during booking.</p>
      </div>

      {/* Info banner */}
      <div className="alert alert-info pricing-info-mb dash-animate delay-1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          The price per hour is multiplied by the booking duration to calculate the total payment amount.
          Changes apply to new bookings immediately.
        </div>
      </div>

      {loading ? (
        <div className="pricing-loading">Loading pricing...</div>
      ) : (
        <>
          {/* ── 2-column court pricing grid ── */}
          <div className="pricing-courts-grid dash-animate delay-2">
            {prices.map((p) => (
              <div key={p.court_number} className="card pricing-court-col-card">
                {/* Card header */}
                <div className="pricing-col-card-header">
                  <div className="pricing-court-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="1"/>
                      <line x1="3" y1="12" x2="21" y2="12"/>
                      <line x1="12" y1="5" x2="12" y2="8"/>
                      <line x1="12" y1="16" x2="12" y2="19"/>
                    </svg>
                  </div>
                  <div>
                    <div className="pricing-court-label">Court {p.court_number}</div>
                    <div className="pricing-court-sub">Hourly rate management</div>
                  </div>
                </div>

                <div className="card-body">
                  {/* Current rate display */}
                  <div className="pricing-current-rate-box">
                    <span className="pricing-current-rate-label">Current Rate</span>
                    <span className="pricing-current-rate-value">RM {Number(p.price_per_hour).toFixed(2)}<span className="pricing-current-rate-unit"> / hr</span></span>
                  </div>

                  {/* Edit row */}
                  <div className="form-group mb-3">
                    <label className="form-label">New Rate (RM / hour)</label>
                    <div className="pricing-input-row">
                      <span className="pricing-currency">RM</span>
                      <input
                        type="number"
                        className="pricing-input"
                        min="0"
                        max="9999"
                        step="0.50"
                        value={editValues[p.court_number] ?? String(p.price_per_hour)}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [p.court_number]: e.target.value }))
                        }
                        title={`Price per hour for Court ${p.court_number}`}
                      />
                      <span className="pricing-currency pricing-per-hr">/ hr</span>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-sm w-full"
                    disabled={
                      saving === p.court_number ||
                      editValues[p.court_number] === String(p.price_per_hour)
                    }
                    onClick={() => handleSave(p.court_number)}
                  >
                    {saving === p.court_number ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Saving…
                      </>
                    ) : "Save Rate"}
                  </button>

                  {/* Pricing examples */}
                  <div className="pricing-examples-inline">
                    <p className="pricing-examples-inline-title">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      Price breakdown
                    </p>
                    <div className="price-breakdown pricing-breakdown-flush">
                      {[1, 2, 3, 4].map((h) => (
                        <div key={h} className="price-breakdown-row">
                          <span>{h} Hour{h > 1 ? "s" : ""}</span>
                          <span className="font-semibold">RM {(Number(p.price_per_hour) * h).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Payment Account Details ── full width below ── */}
      <div className="pricing-bank-section dash-animate delay-3">
        <div className="pricing-bank-section-header">
          <div className="pricing-court-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          </div>
          <div>
            <div className="pricing-court-label">Payment Account Details</div>
            <div className="pricing-court-sub">These details appear under the DuitNow QR code when users make payments.</div>
          </div>
        </div>

        {bankLoading ? (
          <div className="pricing-loading">Loading payment settings...</div>
        ) : (
          <div className="card">
            <div className="card-body">
              <div className="pricing-bank-form-grid">
                <div className="form-group mb-0">
                  <label className="form-label">Bank Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Maybank"
                    value={bankDetails.bankName}
                    onChange={e => setBankDetails(prev => ({ ...prev, bankName: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Account Holder Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. John Doe"
                    value={bankDetails.accountHolderName}
                    onChange={e => setBankDetails(prev => ({ ...prev, accountHolderName: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">Bank Account Number</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 1234 5678 9012"
                    value={bankDetails.accountNumber}
                    onChange={e => setBankDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                    maxLength={30}
                  />
                </div>
                <div className="pricing-bank-save-cell">
                  <button
                    className="btn btn-primary btn-sm w-full"
                    disabled={bankSaving}
                    onClick={handleSaveBankDetails}
                  >
                    {bankSaving ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Saving…
                      </>
                    ) : "Save Payment Details"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
