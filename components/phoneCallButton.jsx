// Reusable "call" button. Deliberately does NOT print the phone number as
// visible text — instead it shows the person's name, then a pulsing,
// unmistakably-tappable phone icon right after it. The number itself only
// ever lives in the tel: href and the aria-label, so screen readers and the
// dialer still get it, it's just not sitting in the UI as raw digits.
export default function PhoneCallButton({
  phoneNumber,
  label,
  size = "md", // "sm" | "md" | "lg"
  nameClassName = "font-semibold text-sm md:text-base",
}) {
  if (!phoneNumber) return null;

  const sizes = {
    sm: { btn: "w-9 h-9", icon: "w-3.5 h-3.5" },
    md: { btn: "w-11 h-11", icon: "w-4.5 h-4.5" },
    lg: { btn: "w-13 h-13", icon: "w-5 h-5" },
  };
  const { btn, icon } = sizes[size] || sizes.md;

  return (
    <span className="inline-flex items-center gap-3">
      {/* name — shown first, plain text, no "Call" prefix */}
      {label && <span className={nameClassName}>{label}</span>}

      {/* icon-only tap target: pulsing ring + solid circle, always green */}
      <a
        href={`tel:${phoneNumber}`}
        aria-label={
          label ? `Call ${label} at ${phoneNumber}` : `Call ${phoneNumber}`
        }
        className={`relative flex items-center justify-center ${btn} shrink-0 select-none group`}
      >
        <span className="absolute inset-0 rounded-full bg-green-400 opacity-60 animate-ping" />
        <span
          className={`relative flex items-center justify-center w-full h-full rounded-full
                      bg-green-500 text-white shadow-md shadow-green-500/40
                      transition-all duration-150
                      group-hover:bg-green-600 group-active:scale-90`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={icon}
            aria-hidden="true"
          >
            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.4 21 3 13.6 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z" />
          </svg>
        </span>
      </a>
    </span>
  );
}
