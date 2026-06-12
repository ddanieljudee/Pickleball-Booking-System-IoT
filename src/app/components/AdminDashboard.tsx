import React, { useState, useEffect } from "react";
import { User, TIME_SLOTS, isSlotWithinBookingRange, getMaxDurationForStartTime, getFullTimeSlotString, convertBackendBooking, isSlotInPast, fmtDate } from "../data/mockData";
import { api } from "../config";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { BookingModal } from "./BookingModal";
import { GuestBookingModal } from "./GuestBookingModal";
import { EditProfileModal } from "./EditProfileModal";
import { RegisterAdminModal } from "./RegisterAdminModal";
import { DeleteAccountConfirmationModal } from "./DeleteAccountConfirmationModal";
import { ConfirmModal } from "./ConfirmModal";
import { ManagePayments } from "./ManagePayments";
import { CourtPricingSettings } from "./CourtPricingSettings";
import { PaymentModal } from "./PaymentModal";
import { Lock, Unlock, Activity, ShieldAlert, CheckCircle2, Edit2, Trash2, UserX } from "lucide-react";

interface AdminDashboardProps {
  user: User;
  navigate: (page: string) => void;
}

interface Booking {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  userId: string;
  userName: string;
  userEmail: string;
  date: string;
  time_slot: string;
  timeSlot: string;
  duration?: number;
  court_number: number;
  courtNumber: number;
  access_code: string;
  accessCode: string;
  status: string;
  bookedByAdmin?: string;
  paymentStatus?: string;
  paymentProofPath?: string;
  totalAmount?: number;
  accessCodeActive?: boolean;
}

type Section = "overview" | "bookings" | "users" | "occupancy" | "reports" | "iot" | "profile" | "my-bookings" | "payments" | "court-pricing";

// Valid section keys for validation
const VALID_SECTIONS: Section[] = ["overview", "bookings", "users", "occupancy", "reports", "iot", "profile", "my-bookings", "payments", "court-pricing"];

export function AdminDashboard({ user, navigate }: AdminDashboardProps) {
  // Restore admin section from localStorage on mount, default to overview
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const savedSection = localStorage.getItem("adminSection") as Section;
    return (savedSection && VALID_SECTIONS.includes(savedSection)) ? savedSection : "overview";
  });
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsSubTab, setBookingsSubTab] = useState<"all" | "payments">("all");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [showAdminProfile, setShowAdminProfile] = useState(false);
  const [showRegisterAdminModal, setShowRegisterAdminModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserValues, setEditUserValues] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editValues, setEditValues] = useState<{ date: string; timeSlot: string; status: string }>({ date: "", timeSlot: "", status: "" });
  const [selectedCourt, setSelectedCourt] = useState(1);
  const [chartType, setChartType] = useState<"daily" | "weekly">("daily");
  const [occupancyDate, setOccupancyDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [gateStatus, setGateStatus] = useState<{ [key: number]: "locked" | "unlocked" }>({ 1: "locked", 2: "locked" });
  const [gateLoading, setGateLoading] = useState(false);
  const [occupancyStatus, setOccupancyStatus] = useState<{ [key: number]: boolean }>({ 1: false, 2: false });

  // Report stats from backend
  const [weeklyStats, setWeeklyStats] = useState<{ day: string; bookings: number }[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<{ week: string; bookings: number }[]>([]);
  const [statsSummary, setStatsSummary] = useState<{ totalThisWeek: number; dailyAvg: number; peakDay: string; utilization: string }>({ totalThisWeek: 0, dailyAvg: 0, peakDay: "-", utilization: "0%" });

  // Confirm modal state
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; variant: "danger" | "warning" | "info"; onConfirm: () => void } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Sidebar collapsed state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("adminSidebarCollapsed") === "true");

  // Multi-select state for bulk operations
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // My Bookings edit state
  const [myEditBooking, setMyEditBooking] = useState<any | null>(null);
  const [myEditValues, setMyEditValues] = useState({ date: "", timeSlot: "", duration: 1, courtNumber: 1 });
  const [myEditError, setMyEditError] = useState<string | null>(null);
  const [myEditLoading, setMyEditLoading] = useState(false);

  // My Bookings payment / proof state
  const [proofViewUrl, setProofViewUrl] = useState<string | null>(null);
  const [paymentUploadBooking, setPaymentUploadBooking] = useState<any | null>(null);
  const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

  // Action dropdown open state (single for entire dashboard)
  const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openActionDropdown) return;
    const handler = () => setOpenActionDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openActionDropdown]);

  // Fetch bookings from backend - extracted for reuse
  const fetchBookings = async () => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        setBookings([]);
        return;
      }

      const res = await fetch(api("/api/bookings"), {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        // Handle both array and paginated response formats
        let bookingsArray = Array.isArray(data) ? data : (data.data || []);
        // Convert snake_case from API to camelCase and standardize field names for frontend
        bookingsArray = bookingsArray.map((b: any) => {
          const converted = convertBackendBooking(b);
          // Ensure all expected fields are present for table display and filtering
          return {
            ...converted,
            id: converted.id,
            user_id: b.user_id,
            userId: converted.userId,
            userName: converted.userName,
            user_name: b.user_name,
            userEmail: converted.userEmail,
            user_email: b.user_email,
            date: converted.date,
            time_slot: b.time_slot,
            timeSlot: converted.timeSlot,
            access_code: b.access_code,
            accessCode: converted.accessCode,
            court_number: b.court_number,
            courtNumber: converted.courtNumber,
            status: converted.status,
            duration: converted.duration,
            createdAt: converted.createdAt,
            bookedByAdmin: b.booked_by || converted.bookedByAdmin || undefined,
            booked_by: b.booked_by || undefined
          };
        });
        setBookings(bookingsArray);
      }
    } catch (err) {
      console.error("Error fetching bookings:", err);
      setBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  };

  // Fetch bookings on component mount
  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, []);

  // Dynamic page title
  useEffect(() => {
    const titles: Partial<Record<Section, string>> = {
      overview: "Overview — Pickleball Pro Admin",
      bookings: "Manage Bookings — Pickleball Pro Admin",
      users: "Manage Users — Pickleball Pro Admin",
      occupancy: "Court Occupancy — Pickleball Pro Admin",
      reports: "View Reports — Pickleball Pro Admin",
      iot: "IoT Gate Control — Pickleball Pro Admin",
      "court-pricing": "Court Pricing — Pickleball Pro Admin",
      "my-bookings": "My Bookings — Pickleball Pro Admin",
      profile: "My Profile — Pickleball Pro Admin",
    };
    document.title = titles[activeSection] ?? "Pickleball Pro Admin";
    return () => { document.title = "Pickleball Pro"; };
  }, [activeSection]);

  // Fetch users from backend
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(api("/api/users"), {
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        
        if (res.ok) {
          const data = await res.json();
          // Handle both array and paginated response formats
          const usersArray = Array.isArray(data) ? data : (data.data || []);
          setUsers(usersArray.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            password: "",
            role: u.role,
            phone: u.phone,
            createdAt: u.created_at || u.createdAt || ""
          })));
        }
      } catch (err) {
        console.error("Error fetching users:", err);
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  // Fetch booking stats for reports
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(api("/api/stats/bookings"), {
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          setWeeklyStats(data.daily || []);
          setMonthlyStats(data.weekly || []);
          if (data.summary) setStatsSummary(data.summary);
        }
      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };
    fetchStats();
  }, []);

  // Poll for live IoT occupancy every 3 seconds
  useEffect(() => {
    const fetchOccupancy = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(api("/api/iot/occupancy"), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const rawOccupancy = data.occupancy || data;
          setOccupancyStatus({ ...rawOccupancy, 2: false });
        }
      } catch (err) {
        // Keep last known state — don't fabricate random data
      }
    };

    fetchOccupancy(); // Initial fetch
    const interval = setInterval(fetchOccupancy, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredBookings = bookings.filter(b =>
    (b.userName || b.user_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.date || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.accessCode || b.access_code || "").includes(searchQuery)
  );

  const handleDelete = async (id: string) => {
    setConfirmAction({
      title: "Delete Booking",
      message: "Are you sure you want to permanently delete this booking? This cannot be undone.",
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const token = sessionStorage.getItem("token");
          const headers: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};
          const res = await fetch(api(`/api/bookings/${id}`), {
            method: "DELETE",
            headers
          });
          if (!res.ok) throw new Error("Failed to delete booking");
          
          setBookings(prev => prev.filter(b => b.id !== id));
          toast.success("Booking deleted successfully. The time slot is now available.");
        } catch (err) {
          console.error("Booking deletion error:", err);
          toast.error("Failed to delete booking. Please try again.");
        }
      }
    });
  };

  const handleBulkDeleteBookings = () => {
    const ids = Array.from(selectedBookingIds);
    if (ids.length === 0) return;
    setConfirmAction({
      title: `Delete ${ids.length} Booking${ids.length > 1 ? "s" : ""}`,
      message: `Permanently delete ${ids.length} selected booking${ids.length > 1 ? "s" : ""}? This cannot be undone.`,
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const token = sessionStorage.getItem("token");
          const res = await fetch(api("/api/bookings/bulk-delete"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token && { "Authorization": `Bearer ${token}` }) },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) throw new Error("Failed");
          setBookings(prev => prev.filter(b => !selectedBookingIds.has(b.id)));
          setSelectedBookingIds(new Set());
          toast.success(`${ids.length} booking${ids.length > 1 ? "s" : ""} deleted successfully.`);
        } catch {
          toast.error("Failed to delete bookings. Please try again.");
        }
      },
    });
  };

  const handleBulkDeleteUsers = () => {
    const ids = Array.from(selectedUserIds).filter(id => users.find(u => u.id === id)?.role !== "admin");
    if (ids.length === 0) { toast.error("No eligible users selected (admin accounts cannot be deleted)."); return; }
    setConfirmAction({
      title: `Delete ${ids.length} User${ids.length > 1 ? "s" : ""}`,
      message: `Permanently delete ${ids.length} selected user${ids.length > 1 ? "s" : ""} and all their bookings? This cannot be undone.`,
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const token = sessionStorage.getItem("token");
          const res = await fetch(api("/api/users/bulk-delete"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token && { "Authorization": `Bearer ${token}` }) },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) throw new Error("Failed");
          const data = await res.json();
          setUsers(prev => prev.filter(u => !ids.includes(u.id)));
          setBookings(prev => prev.filter(b => !ids.includes(b.user_id)));
          setSelectedUserIds(new Set());
          toast.success(`${data.count} user${data.count > 1 ? "s" : ""} deleted successfully.`);
        } catch {
          toast.error("Failed to delete users. Please try again.");
        }
      },
    });
  };

  const handleEdit = (booking: Booking) => {
    setEditBooking(booking);
    setEditValues({ date: booking.date, timeSlot: booking.timeSlot, status: booking.status });
  };

  const handleSaveEdit = async () => {
    if (!editBooking) return;
    try {
      const res = await fetch(api(`/api/bookings/${editBooking.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editValues.date,
          timeSlot: editValues.timeSlot,
          status: editValues.status
        })
      });

      if (!res.ok) throw new Error("Failed to edit booking");

      updateLocalBookings();
      toast.success("Booking updated successfully.");
    } catch (err) {
      console.error("Booking edit error:", err);
      toast.error("Failed to edit booking. Please try again.");
    }
  };

  const updateLocalBookings = () => {
    if (!editBooking) return;
    const updated = bookings.map(b =>
      b.id === editBooking.id
        ? { ...b, date: editValues.date, timeSlot: editValues.timeSlot, status: editValues.status as Booking["status"] }
        : b
    );
    setBookings(updated);
    setEditBooking(null);
  };

  const handleAdminBook = () => {
    setTimeout(() => fetchBookings(), 500);
  };

  // ── My Bookings: edit helpers ──
  const openMyEditModal = (b: any) => {
    setMyEditBooking(b);
    let dateVal = "";
    try {
      const d = new Date(b.date);
      if (!isNaN(d.getTime())) dateVal = d.toISOString().split("T")[0];
    } catch { /* keep empty */ }
    setMyEditValues({
      date: dateVal,
      timeSlot: b.timeSlot || b.time_slot || TIME_SLOTS[0],
      duration: b.duration || 1,
      courtNumber: b.courtNumber || b.court_number || 1,
    });
    setMyEditError(null);
  };

  const isMyEditSlotBooked = (slot: string, checkDuration: number): boolean => {
    if (!myEditValues.date || !myEditBooking) return false;
    const dateStr = new Date(myEditValues.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const candidateStart = TIME_SLOTS.indexOf(slot);
    if (candidateStart === -1) return false;
    if (candidateStart + checkDuration > TIME_SLOTS.length) return true;
    for (let i = candidateStart; i < candidateStart + checkDuration; i++) {
      const currentSlot = TIME_SLOTS[i];
      const conflict = bookings.find(b2 => {
        if (b2.id === myEditBooking.id) return false;
        if (b2.date !== dateStr) return false;
        if ((b2.courtNumber || b2.court_number) !== myEditValues.courtNumber) return false;
        if (b2.status === "cancelled") return false;
        return isSlotWithinBookingRange(currentSlot, b2.timeSlot || b2.time_slot);
      });
      if (conflict) return true;
    }
    return false;
  };

  const handleMyEditSave = async () => {
    if (!myEditBooking) return;
    if (!myEditValues.date || !myEditValues.timeSlot) { setMyEditError("Please fill in all fields."); return; }

    // Prevent past date/time
    const now = new Date();
    const selDate = new Date(myEditValues.date + "T00:00:00");
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (selDate < todayDate) { setMyEditError("Cannot book a past date."); return; }
    if (selDate.getTime() === todayDate.getTime()) {
      const startHour = parseInt(myEditValues.timeSlot.match(/(\d+):00/)?.[1] || "0");
      const isPM = /PM/i.test(myEditValues.timeSlot);
      const hour24 = isPM && startHour !== 12 ? startHour + 12 : (!isPM && startHour === 12 ? 0 : startHour);
      const endHour24 = hour24 + 1; // Each slot is 1 hour
      if (endHour24 <= now.getHours()) { setMyEditError("Cannot book a time slot that has already passed."); return; }
    }

    if (isMyEditSlotBooked(myEditValues.timeSlot, myEditValues.duration)) {
      setMyEditError("Selected time slot conflicts with an existing booking."); return;
    }

    setMyEditLoading(true);
    setMyEditError(null);

    try {
      const token = sessionStorage.getItem("token");
      const displayDate = new Date(myEditValues.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const fullTimeSlot = getFullTimeSlotString(myEditValues.timeSlot, myEditValues.duration);

      const res = await fetch(api(`/api/bookings/${myEditBooking.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        },
        body: JSON.stringify({
          date: displayDate,
          timeSlot: fullTimeSlot,
          duration: myEditValues.duration,
          courtNumber: myEditValues.courtNumber,
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update booking");
      }

      setMyEditBooking(null);
      await fetchBookings();
      toast.success("Booking updated successfully.");
    } catch (err: any) {
      setMyEditError(err.message || "Failed to update booking.");
    } finally {
      setMyEditLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    if (target.role === "admin") { toast.error("Cannot delete Admin accounts."); return; }

    setConfirmAction({
      title: "Delete User",
      message: `Delete user "${target.name}"? All their bookings will be permanently deleted and cannot be recovered.`,
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const token = sessionStorage.getItem("token");
          const headers: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};
          const res = await fetch(api(`/api/users/${userId}`), { 
            method: "DELETE",
            headers
          });
          if (!res.ok) throw new Error("Backend error");
          
          const data = await res.json();
          toast.success(`User deleted successfully. ${data.details?.bookingsDeleted || 0} bookings were removed.`);
        } catch (err) {
          console.warn("Backend error:", err);
          toast.error("Failed to delete user. Please try again.");
          return;
        }

        setUsers(users.filter(u => u.id !== userId));
        setBookings(bookings.filter(b => b.userId !== userId));
      }
    });
  };

  const handleEditUser = (u: User) => {
    setEditingUser(u);
    setEditUserValues({ name: u.name, email: u.email });
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    const payload: Record<string, string> = {};
    if (editUserValues.name) payload.name = editUserValues.name;
    if (editUserValues.email) payload.email = editUserValues.email;
    if (Object.keys(payload).length === 0) { setEditingUser(null); return; }
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api(`/api/users/${editingUser.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save user changes");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save user changes. Please try again.");
      return;
    }
    setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } as User : u));
    setEditingUser(null);
    toast.success("User updated successfully.");
  };

  const roleBadge = (role: string) => {
    if (role === "admin") return <span className="badge badge-admin">Admin</span>;
    if (role === "user") return <span className="badge badge-success">User</span>;
    return <span className="badge badge-muted">Guest</span>;
  };

  // Fetch gate status from backend for both courts
  const fetchGateStatus = async () => {
    try {
      const token = sessionStorage.getItem("token");
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const [res1, res2] = await Promise.all([
        fetch(api("/api/iot/gate/status?court=1"), { headers }),
        fetch(api("/api/iot/gate/status?court=2"), { headers })
      ]);
      if (res1.ok) {
        const data = await res1.json();
        setGateStatus(prev => ({ ...prev, 1: data.gate.locked ? "locked" : "unlocked" }));
      }
      if (res2.ok) {
        const data = await res2.json();
        setGateStatus(prev => ({ ...prev, 2: data.gate.locked ? "locked" : "unlocked" }));
      }
    } catch { /* silent — polling will retry */ }
  };

  // Poll gate status every 1.5 seconds to stay in sync with ESP32 keypad events
  useEffect(() => {
    fetchGateStatus();
    const interval = setInterval(fetchGateStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const toggleGate = async (courtNum: number) => {
    const action = gateStatus[courtNum] === "locked" ? "unlock" : "lock";
    setGateLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(api("/api/iot/gate/control"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "Authorization": `Bearer ${token}` })
        },
        body: JSON.stringify({ action, courtNumber: courtNum })
      });
      if (res.ok) {
        const data = await res.json();
        setGateStatus(prev => ({ ...prev, [courtNum]: data.gate.locked ? "locked" : "unlocked" }));
        toast.success(`Court ${courtNum} gate ${action}ed`);
      } else {
        const err = await res.json();
        toast.error(err.error || `Failed to ${action} gate`);
      }
    } catch {
      toast.error("Cannot reach server");
    } finally {
      setGateLoading(false);
    }
  };

  const occupancyDateDisplay = new Date(occupancyDate).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
  const courtBookings = bookings.filter(b =>
    b.courtNumber === selectedCourt &&
    b.status !== "cancelled" &&
    b.date === occupancyDateDisplay
  );
  const bookedSlots = courtBookings.map(b => b.timeSlot);
  
  // FIX #3: Calculate total slot occupancy by summing durations instead of counting bookings
  const totalSlotOccupancy = courtBookings.reduce((acc, b) => {
    // If duration is stored, use it; otherwise default to 1
    const hours = b.duration || 1;
    return acc + hours;
  }, 0);

  const bookingStatusBadge = (b: Booking) => {
    if (b.status === "completed") return <span className="badge badge-muted">Completed</span>;
    if (b.status === "cancelled") return <span className="badge badge-danger">Cancelled</span>;
    if (b.paymentStatus === "approved") return <span className="badge badge-success">Confirmed</span>;
    if (b.paymentStatus === "rejected") return <span className="badge badge-danger">Payment Rejected</span>;
    if (b.paymentStatus === "pending" && b.paymentProofPath) return <span className="badge badge-warning">Pending Approval</span>;
    return <span className="badge badge-warning">Awaiting Payment</span>;
  };

  const sidebarItems: { key: Section; label: string; icon: React.ReactElement }[] = [
    {
      key: "overview", label: "Overview",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
    },
    {
      key: "bookings", label: "Manage Bookings",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
    },
    {
      key: "users", label: "Manage Users",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      key: "occupancy", label: "Court Occupancy",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
    },
    {
      key: "reports", label: "View Reports",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
    },
    {
      key: "iot", label: "IoT Gate Control",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
    },
    {
      key: "court-pricing", label: "Court Pricing",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    },
    {
      key: "my-bookings", label: "My Bookings",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><polyline points="9 16 12 13 15 16" /></svg>
    },
    {
      key: "profile", label: "My Profile",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    },
  ];

  return (
    <div className="page-bg">
      {/* Navbar */}
      <nav className="pb-navbar">
        <div className="pb-navbar-brand">
          <div className="pb-navbar-brand-icon">PB</div>
          <div className="pb-navbar-brand-text">
            <span className="pb-navbar-brand-name">Pickleball Pro</span>
            <span className="pb-navbar-brand-sub">Admin</span>
          </div>
        </div>
        <div className="pb-navbar-actions">
          <div className="pb-navbar-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {user.name}
            <span className="pb-navbar-badge admin">Admin</span>
          </div>
          <button className="btn-logout btn" onClick={() => setShowLogoutConfirm(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </nav>

      <div className={`dashboard-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        {/* Sidebar */}
        <aside className="dashboard-sidebar">
          <div className="sidebar-section-label">Management</div>
          {sidebarItems.slice(0, 3).map(({ key, label, icon }) => (
            <button
              key={key}
              className={`sidebar-btn ${activeSection === key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(key);
                localStorage.setItem("adminSection", key);
                if (key === "bookings") setBookingsSubTab("all");
              }}
            >
              {icon}
              {label}
            </button>
          ))}
          <div className="sidebar-section-label mt-4">System</div>
          {sidebarItems.slice(3, 7).map(({ key, label, icon }) => (
            <button
              key={key}
              className={`sidebar-btn ${activeSection === key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(key);
                localStorage.setItem("adminSection", key);
                if (key === "bookings") setBookingsSubTab("all");
              }}
            >
              {icon}
              {label}
            </button>
          ))}
          <div className="sidebar-section-label mt-4">My Account</div>
          {sidebarItems.slice(7).map(({ key, label, icon }) => (
            <button
              key={key}
              className={`sidebar-btn ${activeSection === key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(key);
                localStorage.setItem("adminSection", key);
                if (key === "bookings") setBookingsSubTab("all");
              }}
            >
              {icon}
              {label}
            </button>
          ))}
          <div className="sidebar-section-label mt-5">Quick Actions</div>
          <button className="sidebar-btn" onClick={() => setShowGuestModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
            </svg>
            Manual Booking
          </button>
          <button className="sidebar-btn" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Booking
          </button>
        </aside>

        {/* Main Content */}
        <main className="dashboard-main">
          <button
            className="sidebar-toggle"
            onClick={() => {
              setSidebarCollapsed(prev => {
                const next = !prev;
                localStorage.setItem("adminSidebarCollapsed", String(next));
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

          {/* OVERVIEW */}
          {activeSection === "overview" && (
            <>
              <div className="dashboard-header dash-animate">
                <h1 className="dashboard-welcome">Welcome back, Admin</h1>
                <p className="dashboard-subtitle">Here's an overview of your court booking system.</p>
              </div>

              {/* Stats Grid */}
              <div className="stats-grid stats-grid-4 dash-animate delay-1">
                {[
                  { label: "Total Bookings", value: loadingBookings ? "—" : bookings.length, color: "green", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
                  { label: "Confirmed", value: loadingBookings ? "—" : bookings.filter(b => b.status === "confirmed").length, color: "blue", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> },
                  { label: "Completed", value: loadingBookings ? "—" : bookings.filter(b => b.status === "completed").length, color: "gray", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
                  { label: "Courts Active", value: 2, color: "green", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" /></svg> },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} className="stat-card">
                    <div className="stat-card-top">
                      <div>
                        <div className="stat-value">{value}</div>
                        <div className="stat-label">{label}</div>
                      </div>
                      <div className={`stat-card-icon ${color}`}>{icon}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Court Status & Gate Status Quick View */}
              <div className="content-grid content-grid-2 mb-6">
                {[1, 2].map(courtNum => (
                  <div key={courtNum} className="card">
                    <div className="card-header dashboard-header-flex">
                      <h3 className="card-title">
                        <Activity size={16} className="inline-icon text-primary" />
                        Court {courtNum}
                      </h3>
                      {courtNum === 1 ? (
                        occupancyStatus[1] ? (
                          <span className="badge badge-danger badge-flex">
                            <ShieldAlert size={12} /> Occupied (Live Movement)
                          </span>
                        ) : (
                          <span className="badge badge-success badge-flex">
                            <CheckCircle2 size={12} /> Available
                          </span>
                        )
                      ) : (
                        <span className="badge badge-success badge-flex">
                          <CheckCircle2 size={12} /> Available
                        </span>
                      )}
                    </div>
                    <div className="card-body card-body-center">
                      <div className={`gate-icon-circle ${gateStatus[courtNum] === "locked" ? "locked" : "unlocked"}`}>
                        {gateStatus[courtNum] === "locked" ? (
                          <Lock size={28} />
                        ) : (
                          <Unlock size={28} />
                        )}
                      </div>
                      <p className="font-semibold mb-2">
                        {gateStatus[courtNum] === "locked"
                          ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gate-inline-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Locked</>
                          : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gate-inline-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>Unlocked</>}
                      </p>
                      <p className="td-sub mb-4">
                        {gateStatus[courtNum] === "locked" ? "Gate is secured" : "Gate is open"}
                      </p>
                      <button
                        className={`btn btn-sm ${gateStatus[courtNum] === "locked" ? "btn-outline" : "btn-danger-outline"}`}
                        onClick={() => toggleGate(courtNum)}
                        disabled={gateLoading}
                      >
                        {gateLoading ? "Sending..." : gateStatus[courtNum] === "locked" ? "Manual Unlock" : "Lock Gate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Bookings */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Recent Bookings
                  </h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveSection("bookings")}>View All</button>
                </div>
                <div className="table-wrapper table-wrapper-flat">
                  <table className="pb-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>User</th>
                        <th>Date</th>
                        <th>Time Slot</th>
                        <th>Court</th>
                        <th>Created By</th>
                        <th>Access Code</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.slice(0, 5).map((b) => (
                        <tr key={b.id}>
                          <td className="td-id">{b.id}</td>
                          <td>
                            <div className="td-name">{b.userName}</div>
                            <div className="td-sub">{b.userEmail}</div>
                          </td>
                          <td>{fmtDate(b.date)}</td>
                          <td>{b.timeSlot}</td>
                          <td className="td-nowrap">Court {b.courtNumber}</td>
                          <td className={`td-nowrap ${b.bookedByAdmin ? "td-created-admin" : !b.user_id ? "td-created-guest" : "td-created-user"}`}>
                            {b.bookedByAdmin ? <span>Admin: {b.bookedByAdmin}</span> : !b.user_id ? "Guest" : "User"}
                          </td>
                          <td>
                            <span className="access-code-badge">
                              {b.accessCode}
                            </span>
                          </td>
                          <td>{bookingStatusBadge(b)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* MANAGE BOOKINGS */}
          {activeSection === "bookings" && (
            <>
              <div className="dashboard-header">
                <div className="dashboard-header-flex">
                  <div>
                    <h1 className="dashboard-welcome">Manage Bookings &amp; Payments</h1>
                    <p className="dashboard-subtitle">View, edit, delete reservations and review payment submissions.</p>
                  </div>
                  {bookingsSubTab === "all" && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Booking
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-tab switcher */}
              <div className="payment-filter-mb">
                <div className="payment-filter-bar">
                  <button
                    className={`btn btn-sm ${bookingsSubTab === "all" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBookingsSubTab("all")}
                  >
                    All Bookings
                  </button>
                  <button
                    className={`btn btn-sm ${bookingsSubTab === "payments" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBookingsSubTab("payments")}
                  >
                    Manage Payments
                  </button>
                </div>
              </div>

              {bookingsSubTab === "payments" ? (
                <ManagePayments adminId={user.id} />
              ) : (<>
              {/* Search */}
              <div className="search-wrapper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="form-input search-input"
                  placeholder="Search by user, booking ID, date, or access code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Bulk action bar */}
              {selectedBookingIds.size > 0 && (
                <div className="bulk-action-bar">
                  <span className="bulk-action-count">{selectedBookingIds.size} selected</span>
                  <button className="btn btn-danger btn-sm" onClick={handleBulkDeleteBookings}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    Delete Selected ({selectedBookingIds.size})
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedBookingIds(new Set())}>Clear</button>
                </div>
              )}

              <div className="card">
                <div className="table-wrapper table-wrapper-flat">
                  <table className="pb-table">
                    <thead>
                      <tr>
                        <th className="td-check">
                          <input
                            type="checkbox"
                            className="bulk-checkbox"
                            title="Select all"
                            checked={filteredBookings.length > 0 && filteredBookings.every(b => selectedBookingIds.has(b.id))}
                            onChange={e => {
                              if (e.target.checked) setSelectedBookingIds(new Set(filteredBookings.map(b => b.id)));
                              else setSelectedBookingIds(new Set());
                            }}
                          />
                        </th>
                        <th>Booking ID</th>
                        <th>User Name</th>
                        <th>Date</th>
                        <th>Time Slot</th>
                        <th>Duration</th>
                        <th>Court</th>
                        <th>Created By</th>
                        <th>Access Code</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="td-empty">
                            No bookings found matching your search.
                          </td>
                        </tr>
                      ) : (
                        filteredBookings.map((b) => (
                          <tr key={b.id} className={selectedBookingIds.has(b.id) ? "row-selected" : ""}>
                            <td className="td-check">
                              <input
                                type="checkbox"
                                className="bulk-checkbox"
                                title="Select row"
                                checked={selectedBookingIds.has(b.id)}
                                onChange={e => {
                                  const next = new Set(selectedBookingIds);
                                  if (e.target.checked) next.add(b.id); else next.delete(b.id);
                                  setSelectedBookingIds(next);
                                }}
                              />
                            </td>
                            <td className="td-id">{b.id}</td>
                            <td>
                              <div className="td-name">{b.userName}</div>
                              <div className="td-sub">{b.userEmail}</div>
                            </td>
                            <td className="td-nowrap">{fmtDate(b.date)}</td>
                            <td className="td-nowrap">{b.timeSlot}</td>
                            <td className="td-center">{b.duration || 1}h</td>
                            <td className="td-nowrap">Court {b.courtNumber}</td>
                            <td className={`td-nowrap ${b.bookedByAdmin ? "td-created-admin" : !b.user_id ? "td-created-guest" : "td-created-user"}`}>
                              {b.bookedByAdmin ? (
                                <span className="td-admin-inline">
                                  Admin: {b.bookedByAdmin}
                                </span>
                              ) : !b.user_id ? (
                                <span>Guest</span>
                              ) : (
                                <span>User</span>
                              )}
                            </td>
                            <td>
                              <span className="access-code-badge">
                                {b.accessCode}
                              </span>
                            </td>
                            <td>{bookingStatusBadge(b)}</td>
                            <td>
                              <div className="action-menu-wrap" onClick={e => e.stopPropagation()}>
                                <button
                                  className="action-menu-btn"
                                  title="Actions"
                                  onClick={() => setOpenActionDropdown(openActionDropdown === b.id ? null : b.id)}
                                >⋮</button>
                                {openActionDropdown === b.id && (
                                  <div className="action-menu-dropdown">
                                    <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); handleEdit(b); }}>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                      Edit
                                    </button>
                                    <button className="action-menu-item danger" onClick={() => { setOpenActionDropdown(null); handleDelete(b.id); }}>
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="card-footer">
                  <p className="text-sm text-muted">
                    Showing {filteredBookings.length} of {bookings.length} bookings
                  </p>
                </div>
              </div>
              </>)}
            </>
          )}

          {/* MANAGE USERS */}
          {activeSection === "users" && (
            <>
              <div className="dashboard-header">
                <div className="dashboard-header-flex">
                  <div>
                    <h1 className="dashboard-welcome">Manage Users</h1>
                    <p className="dashboard-subtitle">View and manage all registered accounts. Admin accounts cannot be edited or deleted.</p>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowRegisterAdminModal(true)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                      <line x1="19" y1="8" x2="19" y2="14"/>
                      <line x1="22" y1="11" x2="16" y2="11"/>
                    </svg>
                    Register New Admin
                  </button>
                </div>
              </div>

              <div className="search-wrapper">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="form-input search-input"
                  placeholder="Search by name, email, or role..."
                  value={userSearchQuery}
                  onChange={e => setUserSearchQuery(e.target.value)}
                />
              </div>

              {(() => {
                const filteredUsers = users.filter(u =>
                  u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                  u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                  u.role.toLowerCase().includes(userSearchQuery.toLowerCase())
                );
                const selectableUsers = filteredUsers.filter(u => u.role !== "admin");
                return (
                  <>
                    {selectedUserIds.size > 0 && (
                      <div className="bulk-action-bar">
                        <span className="bulk-action-count">{selectedUserIds.size} selected</span>
                        <button className="btn btn-danger btn-sm" onClick={handleBulkDeleteUsers}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          Delete Selected ({selectedUserIds.size})
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUserIds(new Set())}>Clear</button>
                      </div>
                    )}
                    <div className="card">
                      <div className="table-wrapper table-wrapper-flat">
                        <table className="pb-table">
                          <thead>
                            <tr>
                              <th className="td-check">
                                <input
                                  type="checkbox"
                                  className="bulk-checkbox"
                                  title="Select all non-admin users"
                                  checked={selectableUsers.length > 0 && selectableUsers.every(u => selectedUserIds.has(u.id))}
                                  onChange={e => {
                                    if (e.target.checked) setSelectedUserIds(new Set(selectableUsers.map(u => u.id)));
                                    else setSelectedUserIds(new Set());
                                  }}
                                />
                              </th>
                              <th>User ID</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                              <th>Member Since</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUsers.map(u => {
                              const isAdmin = u.role === "admin";
                              return (
                                <tr key={u.id} className={selectedUserIds.has(u.id) ? "row-selected" : ""}>
                                  <td className="td-check">
                                    <input
                                      type="checkbox"
                                      className="bulk-checkbox"
                                      disabled={isAdmin}
                                      title={isAdmin ? "Admin accounts cannot be deleted" : "Select user"}
                                      checked={selectedUserIds.has(u.id)}
                                      onChange={e => {
                                        const next = new Set(selectedUserIds);
                                        if (e.target.checked) next.add(u.id); else next.delete(u.id);
                                        setSelectedUserIds(next);
                                      }}
                                    />
                                  </td>
                                  <td className="td-id-sm">{u.id}</td>
                                  <td className="td-name">{u.name}</td>
                                  <td className="td-sub">{u.email}</td>
                                  <td>{roleBadge(u.role)}</td>
                                  <td className="text-sm">{u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}</td>
                                  <td>
                                    {isAdmin ? (
                                      <span className="text-xs text-muted">—</span>
                                    ) : (
                                      <div className="action-menu-wrap" onClick={e => e.stopPropagation()}>
                                        <button
                                          className="action-menu-btn"
                                          title="Actions"
                                          onClick={() => setOpenActionDropdown(openActionDropdown === `user-${u.id}` ? null : `user-${u.id}`)}
                                        >⋮</button>
                                        {openActionDropdown === `user-${u.id}` && (
                                          <div className="action-menu-dropdown">
                                            <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); handleEditUser(u); }}>
                                              <Edit2 size={13} /> Edit
                                            </button>
                                            <button className="action-menu-item danger" onClick={() => { setOpenActionDropdown(null); handleDeleteUser(u.id); }}>
                                              <Trash2 size={13} /> Delete
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="card-footer">
                        <p className="text-sm text-muted">
                          {users.length} account(s) total · Admin accounts are protected from deletion
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {/* MY BOOKINGS (Admin's Personal Bookings) */}
          {activeSection === "my-bookings" && (() => {
            const myBookings = bookings.filter(b => (b.user_id || b.userId) === user.id);
            const myConfirmed = myBookings.filter(b => b.status === "confirmed").length;
            const myCompleted = myBookings.filter(b => b.status === "completed").length;
            const myCancelled = myBookings.filter(b => b.status === "cancelled").length;
            return (
              <>
                <div className="dashboard-header">
                  <div className="dashboard-header-flex">
                    <div>
                      <h1 className="dashboard-welcome">My Bookings</h1>
                      <p className="dashboard-subtitle">Your personal court reservations and booking history.</p>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      New Booking
                    </button>
                  </div>
                </div>

                <div className="stats-grid stats-grid-4">
                  {[
                    { label: "Total", value: myBookings.length, colorClass: "text-primary" },
                    { label: "Confirmed", value: myConfirmed, colorClass: "text-success" },
                    { label: "Completed", value: myCompleted, colorClass: "text-info" },
                    { label: "Cancelled", value: myCancelled, colorClass: "text-danger" },
                  ].map(({ label, value, colorClass }) => (
                    <div key={label} className="stat-card">
                      <div className="stat-card-top">
                        <div>
                          <div className={`stat-value ${colorClass}`}>{value}</div>
                          <div className="stat-label">{label}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {myBookings.length === 0 ? (
                  <div className="card">
                    <div className="td-empty card-body-center">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      <p className="loading-text mb-4">You have no personal bookings yet.</p>
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
                          {myBookings.map((b) => {
                            const isConfirmed = b.status === "confirmed";
                            const needsInitialPay = isConfirmed && b.paymentStatus === "pending" && !b.paymentProofPath;
                            const canReupload = isConfirmed && (b.paymentStatus === "rejected" || (b.paymentStatus === "pending" && !!b.paymentProofPath));
                            const hasProof = !!b.paymentProofPath;
                            return (
                              <tr key={b.id}>
                                <td className="td-id">{b.id}</td>
                                <td className="td-nowrap">{fmtDate(b.date)}</td>
                                <td className="td-nowrap">{b.timeSlot || b.time_slot}</td>
                                <td>Court {b.courtNumber || b.court_number}</td>
                                <td>
                                  {b.accessCodeActive
                                    ? revealedCodes.has(b.id)
                                      ? <span className="access-code-badge">{b.accessCode || b.access_code}</span>
                                      : <button className="access-code-reveal-btn" onClick={() => setRevealedCodes(prev => { const s = new Set(prev); s.add(b.id); return s; })}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                          Tap to reveal
                                        </button>
                                    : b.paymentStatus === "rejected"
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
                                        onClick={() => setOpenActionDropdown(openActionDropdown === `my-${b.id}` ? null : `my-${b.id}`)}
                                      >⋮</button>
                                      {openActionDropdown === `my-${b.id}` && (
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
                                          <button className="action-menu-item" onClick={() => { setOpenActionDropdown(null); openMyEditModal(b); }}>
                                            <Edit2 size={13} /> Edit
                                          </button>
                                          <button className="action-menu-item danger" onClick={() => { setOpenActionDropdown(null); handleDelete(b.id); }}>
                                            <Trash2 size={13} /> Cancel
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
                      <p className="text-sm text-muted">Showing {myBookings.length} booking{myBookings.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* MY PROFILE */}
          {activeSection === "profile" && (
            <>
              <div className="dashboard-header">
                <h1 className="dashboard-welcome">My Profile</h1>
                <p className="dashboard-subtitle">View and update your administrator account details.</p>
              </div>

              <div className="profile-container profile-container-wide">
                <div className="card mb-5">
                  <div className="card-header">
                    <h3 className="card-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Admin Account
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAdminProfile(true)}>
                      <Edit2 size={14} className="icon-mr-sm" />Edit Profile
                    </button>
                  </div>
                  <div className="card-body profile-two-col">
                    <div className="profile-col-left">
                      <div className="profile-avatar profile-avatar-lg">{user.name.charAt(0).toUpperCase()}</div>
                      <p className="profile-name">{user.name}</p>
                      <span className="badge badge-admin profile-badge-offset">Administrator</span>
                    </div>
                    <div className="profile-col-right">
                    {[
                      { label: "Full Name", value: user.name, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                      { label: "Email Address", value: user.email, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
                      { label: "Role", value: "Admin", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
                      { label: "Member Since", value: (user.createdAt || (user as any).created_at) ? new Date(user.createdAt || (user as any).created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "N/A", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
                      { label: "User ID", value: user.id, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="profile-row">
                        <span className="profile-label">
                          <span>{icon}</span>{label}
                        </span>
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
                    <p className="danger-card-text">Once you delete your account, there is no going back. All your data and associated bookings will be permanently removed.</p>
                    <button className="btn btn-danger w-full" onClick={() => setShowDeleteAccountModal(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-mr"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                      Delete My Account
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* COURT OCCUPANCY */}
          {activeSection === "occupancy" && (
            <>
              <div className="dashboard-header">
                <h1 className="dashboard-welcome">Court Occupancy</h1>
                <p className="dashboard-subtitle">Visual overview of time slot availability for each court.</p>
              </div>

              <div className="occupancy-controls">
                {/* Date Picker */}
                <div className="form-group form-group-inline">
                  <label className="form-label form-label-inline">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-icon">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Date:
                  </label>
                  <input
                    type="date"
                    className="form-input form-input-date"
                    title="Select date"
                    value={occupancyDate}
                    onChange={e => setOccupancyDate(e.target.value)}
                  />
                </div>
                <div className="court-tabs">
                  {[1, 2].map(n => (
                    <button key={n} className={`court-tab ${selectedCourt === n ? "active" : ""}`} onClick={() => setSelectedCourt(n)}>
                      Court {n}
                    </button>
                  ))}
                </div>
                <div className="occupancy-legend">
                  <span className="legend-item">
                    <span className="legend-dot success"></span>
                    Available
                  </span>
                  <span className="legend-item">
                    <span className="legend-dot danger"></span>
                    Booked
                  </span>
                </div>
              </div>

              <div className="card mb-5">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="12" y1="3" x2="12" y2="21" />
                    </svg>
                    Court {selectedCourt} — {occupancyDateDisplay}
                  </h3>
                  <span className="badge badge-info">
                    {TIME_SLOTS.length - bookedSlots.length} slots available
                  </span>
                </div>
                <div className="card-body">
                  <div className="occupancy-grid">
                    {TIME_SLOTS.map((slot) => {
                      // Check if this slot falls within ANY booking's time range
                      const booking = courtBookings.find(b => isSlotWithinBookingRange(slot, b.timeSlot));
                      const booked = !!booking;
                      
                      return (
                        <div key={slot} className={`occupancy-slot ${booked ? "booked" : "available"}`}>
                          <div className="occupancy-slot-time">{slot}</div>
                          <div className="occupancy-slot-status">
                            <span className="occupancy-dot"></span>
                            {booked ? (
                              <span title={`Booked by: ${booking?.userName}`}>
                                {booking?.userName.split(" ")[0] || "Booked"}
                              </span>
                            ) : (
                              "Available"
                            )}
                          </div>
                          {booked && booking && (
                            <div className="occupancy-code-hint">
                              Code: {booking.accessCode}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="content-grid content-grid-2">
                <div className="card">
                  <div className="card-body card-body-center">
                    <div className="stat-big-value danger">
                      {totalSlotOccupancy}
                    </div>
                    <div className="stat-big-label">Booked Hours</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body card-body-center">
                    <div className="stat-big-value success">
                      {TIME_SLOTS.length - bookedSlots.length}
                    </div>
                    <div className="stat-big-label">Available Slots</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* REPORTS */}
          {activeSection === "reports" && (
            <>
              <div className="dashboard-header">
                <h1 className="dashboard-welcome">Booking Reports</h1>
                <p className="dashboard-subtitle">Visual analytics showing booking trends and court usage.</p>
              </div>

              <div className="report-tabs">
                <button
                  className={`court-tab ${chartType === "daily" ? "active" : ""}`}
                  onClick={() => setChartType("daily")}
                >
                  Daily (This Week)
                </button>
                <button
                  className={`court-tab ${chartType === "weekly" ? "active" : ""}`}
                  onClick={() => setChartType("weekly")}
                >
                  Weekly (This Month)
                </button>
              </div>

              <div className="content-grid content-grid-1 mb-5">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      {chartType === "daily" ? "Bookings Per Day (This Week)" : "Bookings Per Week (This Month)"}
                    </h3>
                    <span className="badge badge-success">
                      Total: {(chartType === "daily" ? weeklyStats : monthlyStats).reduce((s, d) => s + d.bookings, 0)} bookings
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="chart-container">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartType === "daily" ? weeklyStats : monthlyStats}
                          margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis
                            dataKey={chartType === "daily" ? "day" : "week"}
                            tick={{ fontSize: 13, fill: "#6B8080" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: "#6B8080" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ borderRadius: "8px", border: "1px solid var(--border-light)", boxShadow: "var(--shadow-md)" }}
                            cursor={{ fill: "rgba(45,106,79,0.06)" }}
                            formatter={(value) => [`${value} bookings`, "Bookings"]}
                          />
                          <Bar dataKey="bookings" radius={[5, 5, 0, 0]} maxBarSize={48}>
                            {(chartType === "daily" ? weeklyStats : monthlyStats).map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.bookings === Math.max(...(chartType === "daily" ? weeklyStats : monthlyStats).map(d => d.bookings)) ? "var(--primary-dark)" : "var(--primary-light)"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-legend">
                      <div className="chart-legend-item">
                        <div className="chart-legend-dot chart-legend-dot primary-light"></div>
                        Bookings
                      </div>
                      <div className="chart-legend-item">
                        <div className="chart-legend-dot chart-legend-dot primary-dark"></div>
                        Peak Day
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="stats-grid stats-grid-4">
                {[
                  { label: "This Week", value: statsSummary.totalThisWeek, sub: "Total bookings" },
                  { label: "Daily Avg", value: statsSummary.dailyAvg, sub: "Bookings per day" },
                  { label: "Peak Day", value: statsSummary.peakDay, sub: "Highest traffic" },
                  { label: "Utilization", value: statsSummary.utilization, sub: "Court usage rate" },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="card">
                    <div className="card-body card-body-center">
                      <div className="report-stat-value">{value}</div>
                      <div className="report-stat-label">{label}</div>
                      <div className="report-stat-sub">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PAYMENTS — redirected to bookings with payments sub-tab */}
          {activeSection === "payments" && (() => {
            setTimeout(() => { setActiveSection("bookings"); setBookingsSubTab("payments"); }, 0);
            return null;
          })()}

          {/* COURT PRICING */}
          {activeSection === "court-pricing" && <CourtPricingSettings />}

          {/* IoT GATE CONTROL */}
          {activeSection === "iot" && (
            <>
              <div className="dashboard-header">
                <h1 className="dashboard-welcome">IoT Gate Control</h1>
                <p className="dashboard-subtitle">Monitor and control court gates via ESP32.</p>
              </div>

              {/* Court Gate Controls — side by side */}
              <div className="content-grid content-grid-2 mb-6">
                {[1, 2].map((courtNum) => (
                <div key={courtNum} className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Court {courtNum}
                    </h3>
                    <span className={`badge ${gateStatus[courtNum] === "locked" ? "badge-muted" : "badge-success"}`}>
                      {gateStatus[courtNum] === "locked"
                        ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gate-inline-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Locked</>
                        : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gate-inline-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>Unlocked</>}
                    </span>
                  </div>
                  <div className="card-body">
                    {/* Gate Status */}
                    <div className={`gate-status-box ${gateStatus[courtNum] === "locked" ? "locked" : "unlocked"}`}>
                      <div className={`gate-status-icon ${gateStatus[courtNum] === "locked" ? "locked" : "unlocked"}`}>
                        {gateStatus[courtNum] === "locked" ? <Lock size={28} /> : <Unlock size={28} />}
                      </div>
                      <p className={`gate-status-label ${gateStatus[courtNum] === "locked" ? "locked" : "unlocked"}`}>
                        Gate is {gateStatus[courtNum] === "locked" ? "LOCKED" : "UNLOCKED"}
                      </p>
                      <p className="gate-status-hint">
                        {gateStatus[courtNum] === "locked"
                          ? "Entry requires valid access code"
                          : "Gate manually opened by admin"}
                      </p>
                    </div>

                    {/* Motion / Occupancy Status */}
                    <div className="iot-motion-status mb-4">
                      {courtNum === 1 ? (
                        <div className={`iot-motion-indicator ${occupancyStatus[1] ? "occupied (Live Movement)" : "available"}`}>
                          <span className="iot-motion-dot"></span>
                          <span className="iot-motion-text">
                            {occupancyStatus[1] ? "Occupied (Live Movement)" : "Available"}
                          </span>
                        </div>
                      ) : (
                        <div className="iot-motion-indicator available">
                          <span className="iot-motion-dot"></span>
                          <span className="iot-motion-text">Available</span>
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="gate-controls">
                      <button
                        className={`btn btn-sm ${gateStatus[courtNum] === "locked" ? "btn-primary" : "btn-ghost"}`}
                        onClick={() => toggleGate(courtNum)}
                        disabled={gateStatus[courtNum] === "unlocked" || gateLoading}
                      >
                        <Unlock size={13} />
                        {gateLoading ? "Sending..." : "Unlock Gate"}
                      </button>
                      <button
                        className={`btn btn-sm ${gateStatus[courtNum] === "unlocked" ? "btn-danger" : "btn-ghost"}`}
                        onClick={() => toggleGate(courtNum)}
                        disabled={gateStatus[courtNum] === "locked" || gateLoading}
                      >
                        <Lock size={13} />
                        {gateLoading ? "Sending..." : "Lock Gate"}
                      </button>
                    </div>

                    {/* Keypad Visual */}
                    <div className="iot-keypad-compact">
                      <p className="keypad-label">Keypad Input</p>
                      <div className="keypad-grid">
                        {["1","2","3","4","5","6","7","8","9","*","0","#"].map((k) => (
                          <div key={k} className="keypad-key">
                            {k}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                ))}
              </div>

              {/* ESP32 Hardware Info — shared card */}
              <div className="card mb-6">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                      <line x1="12" y1="20" x2="12.01" y2="20" />
                    </svg>
                    ESP32 Hardware Configuration
                  </h3>
                  <span className="badge badge-success">
                    <span className="active-dot"></span>
                    Connected
                  </span>
                </div>
                <div className="card-body">
                  <div className="iot-info-grid iot-info-grid-3">
                    <div className="iot-info-item">
                      <span className="iot-info-label">Controller</span>
                      <span className="iot-info-value">ESP32 Dev Module</span>
                    </div>
                    <div className="iot-info-item">
                      <span className="iot-info-label">Servo Motor</span>
                      <span className="iot-info-value">SG90 (GPIO 18)</span>
                    </div>
                    <div className="iot-info-item">
                      <span className="iot-info-label">PIR Sensor</span>
                      <span className="iot-info-value">HC-SR501 (GPIO 4)</span>
                    </div>
                    <div className="iot-info-item">
                      <span className="iot-info-label">Keypad</span>
                      <span className="iot-info-value">3×4 Matrix</span>
                    </div>
                    <div className="iot-info-item">
                      <span className="iot-info-label">Keypad Pins</span>
                      <span className="iot-info-value">R: 13,12,14,27 / C: 26,25,33</span>
                    </div>
                    <div className="iot-info-item">
                      <span className="iot-info-label">Poll Interval</span>
                      <span className="iot-info-value">2 seconds</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Access Codes */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    Active Access Codes
                  </h3>
                </div>
                <div className="table-wrapper table-wrapper-flat">
                  <table className="pb-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>User</th>
                        <th>Court</th>
                        <th>Time Slot</th>
                        <th>Access Code</th>
                        <th>Code Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.filter(b => b.status === "confirmed").map(b => (
                        <tr key={b.id}>
                          <td className="td-id">{b.id}</td>
                          <td>{b.userName}</td>
                          <td>Court {b.courtNumber}</td>
                          <td>{b.timeSlot}</td>
                          <td>
                            <span className="access-code-badge-lg">
                              {b.accessCode}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-success">
                              <span className="active-dot"></span>
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* Edit Modal */}
      {editBooking && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Booking — {editBooking.id}
              </h3>
              <button className="modal-close" onClick={() => setEditBooking(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="text"
                  className="form-input"
                  value={editValues.date}
                  onChange={(e) => setEditValues(p => ({ ...p, date: e.target.value }))}
                  placeholder="e.g. 10 May 2026"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Time Slot</label>
                <select
                  className="form-select"
                  title="Time Slot"
                  value={editValues.timeSlot}
                  onChange={(e) => setEditValues(p => ({ ...p, timeSlot: e.target.value }))}
                >
                  {TIME_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  title="Status"
                  value={editValues.status}
                  onChange={(e) => setEditValues(p => ({ ...p, status: e.target.value }))}
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditBooking(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <BookingModal
          userName={user.name}
          userEmail={user.email}
          userId={user.id}
          onClose={() => setShowModal(false)}
          onConfirmed={handleAdminBook}
        />
      )}

      {showGuestModal && (
        <GuestBookingModal
          adminName={user.name}
          adminId={user.id}
          onClose={() => setShowGuestModal(false)}
          onCreated={(newBooking) => {
            // Convert booking format from camelCase to match dashboard expectations
            const converted = convertBackendBooking(newBooking);
            const formattedBooking = {
              id: converted.id,
              user_id: newBooking.userId,
              userId: converted.userId,
              user_name: newBooking.userName,
              userName: converted.userName,
              user_email: newBooking.userEmail,
              userEmail: converted.userEmail,
              date: converted.date,
              time_slot: converted.timeSlot,
              timeSlot: converted.timeSlot,
              duration: converted.duration,
              access_code: newBooking.accessCode,
              accessCode: converted.accessCode,
              court_number: newBooking.courtNumber,
              courtNumber: converted.courtNumber,
              status: converted.status,
              createdAt: converted.createdAt
            };
            // Add to state immediately for responsive UI
            setBookings(prev => [formattedBooking, ...prev]);
            // Do NOT close modal here — let GuestBookingModal show its success screen
            // (with email confirmation message and access code). Modal closes via onClose.
            // Refetch from API to verify persistence in database
            setTimeout(() => fetchBookings(), 500);
          }}
        />
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-md">
            <div className="modal-header">
              <h3 className="modal-title">
                <Edit2 size={16} color="var(--primary)" className="icon-mr" />
                Edit User — {editingUser.name}
              </h3>
              <button className="modal-close" onClick={() => setEditingUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              {editingUser.role === "admin" ? (
                <div className="alert alert-danger badge-flex">
                  <UserX size={18} />
                  Admin accounts cannot be modified from this panel.
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input className="form-input" type="text" placeholder="Full Name" value={editUserValues.name}
                      onChange={e => setEditUserValues(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input className="form-input" type="email" placeholder="Email Address" value={editUserValues.email}
                      onChange={e => setEditUserValues(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSaveUserEdit}>Save Changes</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN EDIT PROFILE MODAL */}
      {showAdminProfile && (
        <EditProfileModal
          user={user}
          onClose={() => setShowAdminProfile(false)}
          onUpdate={(updatedUser) => {
            setShowAdminProfile(false);
            // Reflect updated name in the admin display
            setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
          }}
        />
      )}

      {/* REGISTER NEW ADMIN MODAL */}
      <RegisterAdminModal 
        isOpen={showRegisterAdminModal} 
        onClose={() => setShowRegisterAdminModal(false)} 
        currentAdminToken={sessionStorage.getItem("token") || ""} 
        onSuccess={() => {
          setShowRegisterAdminModal(false);
          // Refresh users list to show the new admin
          const fetchUsers = async () => {
            try {
              const token = sessionStorage.getItem("token");
              const res = await fetch(api("/api/users"), {
                headers: token ? { "Authorization": `Bearer ${token}` } : {}
              });
              if (res.ok) {
                const data = await res.json();
                setUsers(Array.isArray(data) ? data.map((u: any) => ({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  password: "",
                  role: u.role,
                  phone: u.phone,
                  createdAt: u.created_at || u.createdAt || ""
                })) : []);
              }
            } catch (err) {
              console.error("Error fetching users after admin registration:", err);
            }
          };
          fetchUsers();
        }} 
      />

      {/* DELETE ACCOUNT MODAL */}
      {showDeleteAccountModal && (
        <DeleteAccountConfirmationModal
          user={user}
          onClose={() => setShowDeleteAccountModal(false)}
          onSuccess={() => {
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");
            navigate("login");
          }}
        />
      )}

      {/* CONFIRM ACTION MODAL */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          variant={confirmAction.variant}
          confirmLabel="Delete"
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* LOGOUT CONFIRM MODAL */}
      {showLogoutConfirm && (
        <ConfirmModal
          title="Confirm Logout"
          message="Are you sure you want to log out? You will need to sign in again to access the admin dashboard."
          variant="warning"
          confirmLabel="Logout"
          onConfirm={() => { sessionStorage.removeItem("token"); sessionStorage.removeItem("user"); navigate("landing"); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* MY BOOKINGS EDIT MODAL */}
      {myEditBooking && (
        <div className="modal-overlay">
          <div className="modal-box modal-box-xl">
            <div className="modal-header">
              <h3 className="modal-title modal-title-flex">
                <Edit2 size={17} color="var(--primary)" />
                Edit Booking — {myEditBooking.id}
              </h3>
              <button onClick={() => setMyEditBooking(null)} className="modal-close-raw">✕</button>
            </div>
            <div className="modal-body-padded">
              {myEditError && (
                <div className="alert alert-danger mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <div>{myEditError}</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date <span className="required">*</span></label>
                <input type="date" className="form-input" title="Select date" value={myEditValues.date} min={new Date().toISOString().split("T")[0]} onChange={e => setMyEditValues(p => ({ ...p, date: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Time Slot <span className="required">*</span></label>
                <select className="form-select" title="Time Slot" value={myEditValues.timeSlot} onChange={e => { const s = e.target.value; const m = getMaxDurationForStartTime(s); setMyEditValues(p => ({ ...p, timeSlot: s, duration: Math.min(p.duration, m) })); }}>
                  {TIME_SLOTS.map(s => {
                    const booked = isMyEditSlotBooked(s, myEditValues.duration);
                    const past = isSlotInPast(myEditValues.date, s);
                    const unavailable = booked || past;
                    return <option key={s} value={s} disabled={unavailable}>{s.split(/[-–]/)[0].trim()} {past ? "(Past)" : booked ? "(Unavailable)" : ""}</option>;
                  })}
                </select>
              </div>

              <div className="content-grid content-grid-2">
                <div className="form-group">
                  <label className="form-label">Duration (hours)</label>
                  <select className="form-select" title="Duration" value={myEditValues.duration} onChange={e => setMyEditValues(p => ({ ...p, duration: parseInt(e.target.value) }))}>
                    {Array.from({ length: getMaxDurationForStartTime(myEditValues.timeSlot) }, (_, i) => i + 1).map(h => {
                      const booked = isMyEditSlotBooked(myEditValues.timeSlot, h);
                      return <option key={h} value={h} disabled={booked}>{h} hour{h > 1 ? "s" : ""} {booked ? "(Unavailable)" : ""}</option>;
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Court</label>
                  <select className="form-select" title="Court" value={myEditValues.courtNumber} onChange={e => setMyEditValues(p => ({ ...p, courtNumber: parseInt(e.target.value) }))}>
                    <option value={1}>Court 1</option>
                    <option value={2}>Court 2</option>
                  </select>
                </div>
              </div>

              <div className="booking-info-box">
                <p className="booking-info-label">Booking Info</p>
                <div className="booking-info-grid">
                  <span className="booking-info-key">Booking ID:</span>
                  <span className="booking-info-value">{myEditBooking.id}</span>
                  <span className="booking-info-key">Access Code:</span>
                  <span className="booking-info-code">{myEditBooking.accessCode || myEditBooking.access_code}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer-flat">
              <button className="btn btn-ghost" onClick={() => setMyEditBooking(null)} disabled={myEditLoading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleMyEditSave} disabled={myEditLoading}>
                {myEditLoading ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="loading-spinner"><path d="M21 12a9 9 0 1 1-6.218-8.182" /></svg> Saving...</>
                ) : (
                  <><CheckCircle2 size={14} /> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Upload Modal (My Bookings) ── */}
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
                courtNumber={paymentUploadBooking.courtNumber || paymentUploadBooking.court_number}
                date={paymentUploadBooking.date}
                timeSlot={paymentUploadBooking.timeSlot || paymentUploadBooking.time_slot}
                duration={paymentUploadBooking.duration || 1}
                isAdmin={false}
                onSuccess={() => {
                  setPaymentUploadBooking(null);
                  fetchBookings();
                }}
                onSkip={() => setPaymentUploadBooking(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Proof Viewer (My Bookings) ── */}
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
