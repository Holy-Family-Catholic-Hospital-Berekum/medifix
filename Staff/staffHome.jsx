import PageLayout from "./pageLayout";
import { useState, useEffect } from "react";
import electricity from "../images/electricity.jpg";
import carpentry from "../images/carpentry.jpg";
import plumbing from "../images/plumbing.jpg";
import toolsIcon from "../images/toolsIcon.png";
import worker from "../images/worker.png";
import masonery from "../images/masonery.jpg";
import ac from "../images/ac.jpg";
import refrigerator from "../images/refrigerator.jpg";
import Footer from "../components/footer";
import ReportForm from "./reportForm";
import logo from "../images/hfch-logo.png";
const ORANGE = "#FF8825";

const services = [
  {
    name: "Electrical",
    provisions: ["Repairs", "Supplies"],
    image: electricity,
    accent: "from-amber-400 to-yellow-300",
    icon: "⚡",
  },
  {
    name: "Plumbing",
    provisions: ["Repairs", "Supplies"],
    image: plumbing,
    accent: "from-blue-400 to-cyan-300",
    icon: "🔧",
  },
  {
    name: "Carpentry",
    provisions: ["Repairs", "Supplies"],
    image: carpentry,
    accent: "from-orange-400 to-amber-300",
    icon: "🪚",
  },
  {
    name: "Masonry",
    provisions: ["Repairs", "Supplies"],
    image: masonery,
    accent: "from-stone-400 to-zinc-300",
    icon: "🧱",
  },
  {
    name: "Refrigerator",
    provisions: ["Repairs"],
    image: refrigerator,
    accent: "from-sky-400 to-blue-300",
    icon: "❄️",
  },
  {
    name: "Air Conditioner",
    provisions: ["Repairs"],
    image: ac,
    accent: "from-teal-400 to-emerald-300",
    icon: "🌬️",
  },
];

const systemWorkflows = [
  { step: "01", text: "You submit a maintenance report" },
  { step: "02", text: "Report goes to administrator for approval" },
  { step: "03", text: "Estate Manager receives report upon admin approval" },
  { step: "04", text: "Estate Manager makes a materials confirmation request" },
  { step: "05", text: "Admin confirms the materials request" },
  { step: "06", text: "Procurement purchases the materials." },
  { step: "07", text: "Work is assigned to appropriate technician" },
  { step: "08", text: "Technician executes the task and updates progress" },
  { step: "09", text: "You review completed work and provide feedback" },
  { step: "10", text: "Admin, Estate Manager, and technician review feedback" },
  { step: "11", text: "Further actions are taken if necessary" },
];

const timelines = [
  {
    priority: "Emergency",
    desc: "Attended to as soon as possible",
    color: "bg-red-500",
    border: "border-red-400",
    text: "text-red-600",
    badge: "bg-red-100",
    icon: "🚨",
  },
  {
    priority: "Urgent",
    desc: "Attended to within 12 hours",
    color: "bg-orange-500",
    border: "border-orange-400",
    text: "text-orange-600",
    badge: "bg-orange-100",
    icon: "⚡",
  },
  {
    priority: "Routine",
    desc: "Attended to within 1 to 2 days",
    color: "bg-green-500",
    border: "border-green-400",
    text: "text-green-600",
    badge: "bg-green-100",
    icon: "📋",
  },
];

// ─── Birthday helpers ─────────────────────────────────────────────────────────
// birthdate stored as "YYYY-MM-DD"; only month/day need to match today.
function isBirthdayToday(birthdate) {
  if (!birthdate || typeof birthdate !== "string") return false;
  const parts = birthdate.split("-").map(Number);
  if (parts.length !== 3) return false;
  const [, month, day] = parts;
  if (!month || !day) return false;
  const today = new Date();
  return month === today.getMonth() + 1 && day === today.getDate();
}

function getFirstName(userObj) {
  return userObj?.name?.trim().split(" ")[0] || "there";
}

function BirthdayBanner({ name, onDismiss }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed top-0 inset-x-0 z-[120] flex justify-center px-4 pt-4 pointer-events-none">
      <div
        className={`pointer-events-auto relative max-w-md w-full rounded-2xl overflow-hidden shadow-2xl border border-white/30 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 text-white px-5 py-4 flex items-center gap-3 transition-all duration-500 ${
          entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
        }`}
      >
        <span className="text-3xl animate-bounce">🎉</span>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm md:text-base leading-tight">
            Happy Birthday, {name}! 🎂
          </p>
          <p className="text-xs md:text-sm text-white/85 mt-0.5">
            Wishing you a fantastic day — from all of us here.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/80 hover:text-white text-lg font-bold px-1 flex-shrink-0"
          aria-label="Dismiss birthday message"
        >
          ✕
        </button>
        <span className="absolute -top-2 left-8 text-base animate-pulse pointer-events-none">
          ✨
        </span>
        <span className="absolute -bottom-2 right-12 text-base animate-pulse [animation-delay:0.3s] pointer-events-none">
          🎈
        </span>
      </div>
    </div>
  );
}

// ─── Birthday confetti ─────────────────────────────────────────────────────
// Falls from just under the navbar for as long as it's mounted. StaffHome
// unmounts it after 10s via a timeout, independent of the banner's dismiss
// state, so refreshing on your birthday always re-triggers it.
const CONFETTI_COLORS = [
  "#f43f5e",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
];

function BirthdayConfetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 3 + Math.random() * 2.5,
      width: 6 + Math.random() * 6,
      height: 10 + Math.random() * 8,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      drift: (Math.random() - 0.5) * 200,
    })),
  );

  return (
    <div className="fixed top-20 md:top-24 inset-x-0 bottom-0 z-[90] overflow-hidden pointer-events-none">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export default function StaffHome() {
  const [sidePopup, setSidePopup] = useState(false);
  const [showBirthdayBanner, setShowBirthdayBanner] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  // Show the birthday banner once per day on the user's actual birthday.
  // Dismissal is stored in localStorage so it won't reappear on the same day.
  useEffect(() => {
    if (!user?.birthdate || !isBirthdayToday(user.birthdate)) return;
    const todayKey = new Date().toISOString().split("T")[0];
    const dismissKey = `birthdayDismissed:${user.ID || user.email}:${todayKey}`;
    if (localStorage.getItem(dismissKey)) return;
    setShowBirthdayBanner(true);
  }, []);

  // Confetti runs for exactly 10s from mount/refresh, regardless of
  // whether the banner has been dismissed for the day — so it replays
  // every time the page opens/refreshes on the birthday.
  useEffect(() => {
    if (!user?.birthdate || !isBirthdayToday(user.birthdate)) return;
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 10000);
    return () => clearTimeout(t);
  }, []);

  const dismissBirthdayBanner = () => {
    setShowBirthdayBanner(false);
    const todayKey = new Date().toISOString().split("T")[0];
    const dismissKey = `birthdayDismissed:${user?.ID || user?.email}:${todayKey}`;
    localStorage.setItem(dismissKey, "1");
  };

  const pageContent = (
    <main className="bg-white pt-20 md:pt-24 pb-20 min-h-screen">
      <span
        className="material-symbols-outlined md:hidden z-50 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 text-white shadow-lg"
        style={{ backgroundColor: ORANGE }}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>

      {/* ── Hero banner ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden mb-16">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${ORANGE} 0, ${ORANGE} 1px, transparent 0, transparent 50%)`,
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative text-center py-12 px-6 ">
          <div className="flex flex-col justify-center items-center">
            <img src={logo} alt="logo" className="w-30 " />
            <h1 className="md:text-4xl text-3xl  font-black text-gray-900 leading-tight mb-3">
              Holy Family Catholic Hospital, Berekum
            </h1>
          </div>

          <span
            className="inline-block text-xs font-black tracking-[.25em] uppercase px-4 py-1.5 rounded-full mb-4 text-white"
            style={{ backgroundColor: ORANGE }}
          >
            Maintenance Department
          </span>
          <h1 className="text-2xl  font-black text-gray-900 leading-tight mb-3">
            What can we <span style={{ color: ORANGE }}>phix</span> for you?
          </h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Click on the Report button at the top right corner to submit a
            report.
          </p>
        </div>
      </section>

      {/* ── Services ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-12 mb-20">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-3xl font-black text-gray-900">Our Services</h2>
          <div className="flex-1 h-0.5 bg-gray-100 rounded" />
          <span
            className="text-sm font-bold px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: ORANGE }}
          >
            {services.length} available
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {services.map((service) => (
            <div
              key={service.name}
              className="group relative bg-white rounded-2xl border-2 border-gray-100 hover:border-orange-300 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-default select-none"
            >
              <div
                className={`h-1.5 w-full bg-gradient-to-r ${service.accent}`}
              />

              <div className="p-4">
                <div className="text-3xl mb-3">{service.icon}</div>

                <h3 className="font-black text-gray-900 text-sm leading-tight mb-2">
                  {service.name}
                </h3>

                <div className="flex flex-col gap-1">
                  {service.provisions.map((p) => (
                    <span
                      key={p}
                      className="text-xs text-gray-500 flex items-center gap-1"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: ORANGE }}
                      />
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden h-0 group-hover:h-28 transition-all duration-500">
                <img
                  src={service.image}
                  alt={service.name}
                  className="w-full h-28 object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow ──────────────────────────────────────────────── */}
      <section className="px-4 md:px-12 mb-20">
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)`,
          }}
        >
          <div className="px-8 pt-10 pb-6 flex items-center gap-4">
            <div>
              <h2 className="text-3xl font-black text-white">
                System Workflow
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                How your report moves through the system
              </p>
            </div>
            <div className="ml-auto hidden lg:block">
              <img src={worker} alt="worker" className="w-40 opacity-80" />
            </div>
          </div>

          <div className="px-8 pb-10 grid md:grid-cols-2 gap-3">
            {systemWorkflows.map((w) => (
              <div
                key={w.step}
                className="flex items-center gap-4 bg-white/5 hover:bg-white/10 transition rounded-xl px-4 py-3 group"
              >
                <span
                  className="text-xs font-black w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
                  style={{ backgroundColor: ORANGE }}
                >
                  {w.step}
                </span>
                <p className="text-sm text-gray-300 group-hover:text-white transition">
                  {w.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Report Timelines ──────────────────────────────────────── */}
      <section className="px-4 md:px-12 mb-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-3xl font-black text-gray-900">
            Report Timelines
          </h2>
          <div className="flex-1 h-0.5 bg-gray-100 rounded" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {timelines.map((t) => (
            <div
              key={t.priority}
              className={`relative rounded-2xl border-2 ${t.border} overflow-hidden bg-white shadow-sm hover:shadow-lg transition-all duration-300`}
            >
              <div className={`${t.color} px-6 py-4 flex items-center gap-3`}>
                <span className="text-2xl">{t.icon}</span>
                <h3 className="font-black text-white text-xl">{t.priority}</h3>
              </div>
              <div className="px-6 py-5">
                <p className="text-gray-700 font-medium">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Important Notice ──────────────────────────────────────── */}
      <section className="px-4 md:px-12 mb-16">
        <div
          className="rounded-2xl p-6 md:p-8 flex gap-4 items-start border-l-8"
          style={{
            backgroundColor: "#fff8f0",
            borderLeftColor: ORANGE,
          }}
        >
          <span className="text-3xl flex-shrink-0">⚠️</span>
          <div>
            <h3 className="font-black text-gray-900 text-lg mb-2">
              Important Notice
            </h3>
            <p className="text-gray-700 leading-relaxed">
              The urgency of a report depends on the actual intensity of the
              issue. Merely setting a priority as <strong>emergency</strong> or{" "}
              <strong>urgent</strong> does not automatically make it one.
              Reports are assessed independently.
            </p>
          </div>
        </div>
      </section>

      {/* ── Working Hours ─────────────────────────────────────────── */}
      <section className="px-4 md:px-12">
        <div className="rounded-2xl overflow-hidden border-2 border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 px-8 py-5 bg-gray-900">
            <span className="text-2xl">🕐</span>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                Working Hours
              </p>
              <p className="text-white font-black text-xl">Monday – Friday</p>
            </div>
            <div className="ml-auto">
              <span
                className="text-sm font-black px-4 py-2 rounded-full text-white"
                style={{ backgroundColor: ORANGE }}
              >
                8:00 AM – 4:00 PM
              </span>
            </div>
          </div>
          <div className="bg-gray-50 px-8 py-4">
            <p className="text-gray-500 text-sm">
              Reports submitted outside working hours will be processed the next
              working day except emergency or urgent reports
            </p>
          </div>
        </div>
      </section>
    </main>
  );

  return (
    <>
      {showBirthdayBanner && (
        <BirthdayBanner
          name={getFirstName(user)}
          onDismiss={dismissBirthdayBanner}
        />
      )}
      {showConfetti && <BirthdayConfetti />}
      <PageLayout content={pageContent} sidePopup={sidePopup} page="Home" />
    </>
  );
}
