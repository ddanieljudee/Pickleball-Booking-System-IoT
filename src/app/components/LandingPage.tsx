import React, { useEffect, useRef, useState } from "react";
import {
  Lock, Calendar, BarChart3, Shield, Users, Smartphone,
  ArrowRight, CheckCircle, Zap, ChevronRight, CreditCard, Star,
  Key, TrendingUp, ArrowUpRight, Menu, X
} from "lucide-react";

interface LandingPageProps {
  navigate: (page: string) => void;
}

const FEATURES = [
  {
    icon: Lock,
    title: "Smart IoT Gate Access",
    desc: "Receive unique 4-digit access codes after payment approval, then unlock gates securely with our keypad and ESP32 integration.",
  },
  {
    icon: Calendar,
    title: "Intelligent Scheduling",
    desc: "Real-time availability. Book single or multi-hour sessions with smart conflict detection.",
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    desc: "Live occupancy tracking with PIR sensors. Get insights to optimize court usage.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "JWT authentication, role-based access control, and encrypted data storage for peace of mind.",
  },
  {
    icon: Users,
    title: "Admin Dashboard",
    desc: "Comprehensive management tools for users, bookings, courts, and system settings.",
  },
  {
    icon: Smartphone,
    title: "Mobile Responsive",
    desc: "Book courts anytime, anywhere. Fully optimized for mobile, tablet, and desktop.",
  },
  {
    icon: CreditCard,
    title: "Easy Payments",
    desc: "Submit QR payment proofs or record cash walk-ins. Admins review payment and activate access codes without leaving the system.",
  },
];

const STATS = [
  { value: "500+", label: "Bookings Processed" },
  { value: "2", label: "Active Courts" },
  { value: "< 30s", label: "Avg Booking Time" },
  { value: "4.9★", label: "User Satisfaction" },
];

const BENEFITS = [
  "Instant booking confirmation with email notification",
  "Unique 4-digit access code per session via IoT gate",
  "Real-time court occupancy via PIR sensor monitoring",
  "Admin payment review with one-click approval",
  "Role-based access: Admin, User, and Guest modes",
  "Full booking history with cancellation policy",
];

const STEPS = [
  { step: "01", title: "Choose & Book", desc: "Search available courts, select your date and time, and confirm your booking in seconds." },
  { step: "02", title: "Get Access Code", desc: "Receive a unique 4-digit access code directly to your email once your payment is verified by the admin." },
  { step: "03", title: "Unlock & Play", desc: "Enter your code on the court keypad during your booking time to unlock the gate." },
];

const TESTIMONIALS = [
  {
    text: "Pickleball Pro reduced our booking conflicts by 95%. The IoT integration is seamless and our members love it.",
    author: "Sarah Chen",
    role: "Courts Manager, Coastal Pickleball Club",
  },
  {
    text: "Our players love the approval workflow and reliable gate access. No more waiting at the gate or fumbling with keys. Best decision we made.",
    author: "Mike Rodriguez",
    role: "Owner, Metropolitan Courts",
  },
  {
    text: "The admin dashboard gives us real-time insights into court usage. We optimize pricing and scheduling accordingly.",
    author: "Lisa Wang",
    role: "Operations Director, Austin Pickleball",
  },
];

export function LandingPage({ navigate }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const revealRefs = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const addRevealRef = (el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) {
      revealRefs.current.push(el);
    }
  };

  return (
    <div className="lp-page">
      {/* Header */}
      <header className={`lp-header${headerScrolled ? " lp-header-scrolled" : ""}`}>
        <div className="lp-brand">
          <div className="lp-brand-icon">PB</div>
          <div>
            <h1 className="lp-brand-name">Pickleball Pro</h1>
            <p className="lp-brand-sub">Court Booking</p>
          </div>
        </div>
        <nav className="lp-nav">
          <button className="lp-nav-link" onClick={() => navigate("guest-dashboard")}>Browse Courts</button>
          <button className="lp-nav-btn-outline" onClick={() => navigate("login")}>Sign In</button>
          <button className="lp-nav-btn-primary" onClick={() => navigate("register")}>Get Started</button>
        </nav>
        <button className="lp-hamburger" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
      </header>
      {mobileMenuOpen && (
        <div className="lp-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
      <nav className={`lp-mobile-nav${mobileMenuOpen ? ' open' : ''}`}>
        <div className="lp-mobile-nav-header">
          <div className="lp-brand">
            <div className="lp-brand-icon">PB</div>
            <div>
              <h1 className="lp-brand-name">Pickleball Pro</h1>
              <p className="lp-brand-sub">Court Booking</p>
            </div>
          </div>
          <button className="lp-mobile-nav-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="lp-mobile-nav-links">
          <button className="lp-mobile-nav-link" onClick={() => { navigate("guest-dashboard"); setMobileMenuOpen(false); }}>Browse Courts</button>
          <button className="lp-mobile-nav-link" onClick={() => { navigate("login"); setMobileMenuOpen(false); }}>Sign In</button>
          <button className="lp-mobile-nav-btn-primary" onClick={() => { navigate("register"); setMobileMenuOpen(false); }}>Get Started Free</button>
        </div>
      </nav>

      {/* Hero — Split layout: text left, court image right */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-hero-split">
            {/* Left: text */}
            <div className="lp-hero-left">
              <div className="lp-hero-badge lp-hero-animate">
                <Zap size={12} />
                Smart Court Management Platform
              </div>
              <h2 className="lp-hero-title lp-hero-animate-delay-1">
                Book Courts Fast.<br />
                <span className="lp-hero-title-accent">Unlock with IoT.</span>
              </h2>
              <p className="lp-hero-subtitle lp-hero-animate-delay-2">
                Reserve courts in seconds, submit payment proof, and unlock the gate with our ESP32 keypad system after admin approval.
              </p>
              <div className="lp-hero-actions lp-hero-animate-delay-3">
                <button className="lp-btn-primary lp-btn-hero" onClick={() => navigate("register")}>
                  Get Started Free
                  <ArrowRight size={16} />
                </button>
                <button className="lp-btn-outline lp-btn-hero-outline" onClick={() => navigate("guest-dashboard")}>
                  Browse as Guest
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="lp-hero-review lp-hero-animate-delay-4">
                <div className="lp-hero-review-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                </div>
                <span className="lp-hero-review-text">5.0 &middot; Trusted by 80+ pickleball facilities</span>
              </div>
            </div>
            {/* Right: court image */}
            <div className="lp-hero-right lp-hero-animate-delay-2">
              <div className="lp-hero-img-wrap">
                <img src="/images/hero-court.jpg" alt="Pickleball court" className="lp-hero-court-img" />
                <div className="lp-hero-img-badge">
                  <div className="lp-hero-img-badge-dot" />
                  <span>Courts Available Now</span>
                </div>
              </div>
            </div>
          </div>
          {/* Stat Cards row */}
          <div className="lp-hero-stat-cards lp-hero-animate-delay-4">
            {STATS.map((s, i) => (
              <div key={i} className={`lp-hero-stat-card${
                i === 1 ? ' lp-hero-stat-card-dark' :
                i === 3 ? ' lp-hero-stat-card-lime' : ''
              }`}>
                <div className="lp-hero-stat-value">{s.value}</div>
                <div className="lp-hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="lp-features" id="features">
        <div className="lp-features-inner">
          <div className="lp-section-header scroll-reveal" ref={addRevealRef}>
            <div className="lp-section-eyebrow">Why Pickleball Pro</div>
            <h3 className="lp-section-title">Everything You Need to Manage Courts</h3>
            <p className="lp-section-subtitle">From booking to gate access — one unified platform built for modern pickleball facilities</p>
          </div>
          {/* IoT Spotlight */}
          {FEATURES.slice(0, 1).map((feature) => (
            <div key="spotlight" className="lp-feature-spotlight scroll-reveal" ref={addRevealRef}>
              <div className="lp-feature-spotlight-icon">
                <feature.icon size={28} />
              </div>
              <div className="lp-feature-spotlight-body">
                <div className="lp-feature-spotlight-eyebrow">Core Differentiator</div>
                <h4 className="lp-feature-spotlight-title">{feature.title}</h4>
                <p className="lp-feature-spotlight-desc">{feature.desc}</p>
              </div>
            </div>
          ))}
          <div className="lp-features-grid">
            {FEATURES.slice(1).map((feature, idx) => (
              <div key={idx} className={`lp-feature-card scroll-reveal delay-${idx + 1}`} ref={addRevealRef}>
                <div className="lp-feature-card-top">
                  <div className="lp-feature-icon"><feature.icon size={20} /></div>
                  <div className="lp-feature-card-arrow"><ArrowUpRight size={14} /></div>
                </div>
                <h4 className="lp-feature-title">{feature.title}</h4>
                <p className="lp-feature-desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Benefits */}
      <section className="lp-benefits" id="benefits">
        <div className="lp-benefits-inner">
          <div className="lp-benefits-left scroll-reveal" ref={addRevealRef}>
            <div className="lp-section-eyebrow">Platform Capabilities</div>
            <h3 className="lp-benefits-title">Key Benefits of Our System for Your Operations</h3>
            <p className="lp-benefits-subtitle">Our platform boosts productivity, cuts costs, and drives operational excellence for pickleball facilities of any size.</p>
            <ul className="lp-checklist">
              {BENEFITS.map((b, i) => (
                <li key={i} className="lp-checklist-item">
                  <span className="lp-checklist-icon"><CheckCircle size={16} /></span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-benefits-right scroll-reveal delay-2" ref={addRevealRef}>
            <div className="lp-benefits-visual">
              <div className="lp-bv-card lp-bv-card-main">
                <div className="lp-bv-header">
                  <span className="lp-bv-dot lp-bv-dot-green" />
                  <span className="lp-bv-label">Live Dashboard</span>
                </div>
                <div className="lp-bv-stats-row">
                  <div className="lp-bv-stat">
                    <div className="lp-bv-stat-value">12</div>
                    <div className="lp-bv-stat-label">Bookings Today</div>
                  </div>
                  <div className="lp-bv-stat">
                    <div className="lp-bv-stat-value">2</div>
                    <div className="lp-bv-stat-label">Active Courts</div>
                  </div>
                  <div className="lp-bv-stat">
                    <div className="lp-bv-stat-value">RM 300</div>
                    <div className="lp-bv-stat-label">Revenue Today</div>
                  </div>
                </div>
                <div className="lp-bv-bars">
                  {[1,2,3,4,5,6,7].map((n) => (
                    <div key={n} className="lp-bv-bar-wrap">
                      <div className="lp-bv-bar" />
                    </div>
                  ))}
                </div>
                <div className="lp-bv-bar-labels">
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                    <span key={d} className="lp-bv-bar-label">{d}</span>
                  ))}
                </div>
              </div>
              <div className="lp-bv-card lp-bv-card-badge">
                <Key size={16} />
                <div>
                  <div className="lp-bv-badge-title">Gate Unlocked</div>
                  <div className="lp-bv-badge-sub">Court 1 — Active</div>
                </div>
              </div>
              <div className="lp-bv-card lp-bv-card-pill">
                <TrendingUp size={14} />
                <span>+24% bookings this month</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="lp-steps" id="how-it-works">
        <div className="lp-steps-inner">
          <div className="lp-section-header scroll-reveal" ref={addRevealRef}>
            <div className="lp-section-eyebrow">How It Works</div>
            <h3 className="lp-section-title">Three Steps to Court Access</h3>
            <p className="lp-section-subtitle">From reservation to secure court access in three clear steps</p>
          </div>
          <div className="lp-steps-grid">
            {STEPS.map((item, idx) => (
              <React.Fragment key={idx}>
                <div className={`lp-step scroll-reveal delay-${idx + 1}`} ref={addRevealRef}>
                  <div className="lp-step-number">{item.step}</div>
                  <div>
                    <h4 className="lp-step-title">{item.title}</h4>
                    <p className="lp-step-desc">{item.desc}</p>
                  </div>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className="lp-step-connector">
                    <ChevronRight size={20} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="lp-testimonials">
        <div className="lp-testimonials-inner">
          <div className="lp-section-header scroll-reveal" ref={addRevealRef}>
            <div className="lp-section-eyebrow">Testimonials</div>
            <h3 className="lp-section-title">What Our Users Say</h3>
            <p className="lp-section-subtitle">Hear from court managers who use Pickleball Pro for their operations</p>
          </div>
          <div className="lp-testimonials-grid">
            {TESTIMONIALS.map((t, idx) => (
              <div key={idx} className={`lp-testimonial-card scroll-reveal delay-${idx + 1}`} ref={addRevealRef}>
                <div className="lp-testimonial-stars">
                  {[...Array(5)].map((_, i) => <Star key={i} size={13} fill="currentColor" />)}
                </div>
                <p className="lp-testimonial-text">&ldquo;{t.text}&rdquo;</p>
                <div className="lp-testimonial-footer">
                  <div className={`lp-testimonial-avatar lp-avatar-${idx}`}>
                    {t.author.split(" ").map(w => w[0]).join("")}
                  </div>
                  <div>
                    <div className="lp-testimonial-author">{t.author}</div>
                    <div className="lp-testimonial-role">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta">
        <div className="lp-cta-bg">
          <img src="/images/cta-bg.jpg" alt="" className="lp-cta-bg-img" />
          <div className="lp-cta-overlay" />
        </div>
        <div className="lp-cta-inner scroll-reveal" ref={addRevealRef}>
          <h3 className="lp-cta-title">Simpler Than You Think.<br />Up and Running in Minutes.</h3>
          <p className="lp-cta-subtitle">
            No IT team. No complex onboarding. Create your account, add your courts, and start accepting bookings — all within minutes.
          </p>
          <div className="lp-cta-trust">
            <div className="lp-cta-trust-item"><Zap size={14} /><span>5-minute setup</span></div>
            <div className="lp-cta-trust-item"><Shield size={14} /><span>SSL-secured data</span></div>
            <div className="lp-cta-trust-item"><Users size={14} /><span>Free support included</span></div>
          </div>
          <div className="lp-cta-actions">
            <button className="lp-cta-btn" onClick={() => navigate("register")}>
              Get Started Free
              <ArrowRight size={16} />
            </button>
            <button className="lp-cta-btn-secondary" onClick={() => navigate("guest-dashboard")}>
              Explore as Guest
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="lp-cta-note">No credit card required &middot; Used by pickleball facilities across Malaysia</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-footer-brand">
                <div className="lp-footer-brand-icon">PB</div>
                <span className="lp-footer-brand-name">Pickleball Pro</span>
              </div>
              <p className="lp-footer-desc">Smart court booking with IoT-integrated gate access for modern pickleball facilities.</p>
            </div>
            <div className="lp-footer-section">
              <h4>Product</h4>
              <ul>
                <li><button className="lp-footer-link" onClick={() => navigate("guest-dashboard")}>Browse Courts</button></li>
                <li><button className="lp-footer-link" onClick={() => navigate("register")}>Get Started</button></li>
                <li><button className="lp-footer-link" onClick={() => navigate("login")}>Sign In</button></li>
              </ul>
            </div>
            <div className="lp-footer-section">
              <h4>Features</h4>
              <ul>
                <li><button className="lp-footer-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>IoT Gate Access</button></li>
                <li><button className="lp-footer-link" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How It Works</button></li>
                <li><button className="lp-footer-link" onClick={() => document.getElementById('benefits')?.scrollIntoView({ behavior: 'smooth' })}>Platform Benefits</button></li>
              </ul>
            </div>
            <div className="lp-footer-section">
              <h4>Contact</h4>
              <ul>
                <li><span className="lp-footer-text">support@pickleballpro.com</span></li>
                <li><span className="lp-footer-text">Kota Samarahan, Sarawak, Malaysia</span></li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span className="lp-footer-copy">&copy; 2026 Pickleball Pro. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
