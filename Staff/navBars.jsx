import { useState } from "react";
import ReportForm from "./reportForm";
import { useNavigate, NavLink } from "react-router";
import logo from "../images/icon.png";
export default function NavBars() {
  const [formPopup, setFormPopup] = useState(false);
  const navigate = useNavigate();

  const handleClose = () => {
    setTimeout(() => setFormPopup(false), 300);
  };

  const navClass = ({ isActive }) =>
    `
      relative
      flex
      items-center
      gap-2
      cursor-pointer
      whitespace-nowrap
      text-sm
      font-bold
      tracking-wide
      transition-all
      duration-300
      ${isActive ? "text-[#FF8825]" : "text-blue-100 hover:text-[#FF8825]"}
    `;

  return (
    <>
      {formPopup && <ReportForm formPopup={formPopup} onClose={handleClose} />}

      {/* ─────────────────────────────────────────────
          MOBILE TOP BAR
      ───────────────────────────────────────────── */}

      <nav
        className="
          md:hidden
          fixed
          top-0
          left-0
          right-0
          z-[100]

          flex
          items-center
          justify-between

          px-4
          py-3

          bg-[#40499F]/95
          backdrop-blur-xl

          border-b
          border-white/10

          shadow-[0_4px_20px_rgba(0,0,0,0.15)]
        "
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div
            className="
              flex
              items-center
              justify-center
              w-9
              h-9
              rounded-xl
              bg-[#FF8825]
              shadow-[0_4px_12px_rgba(255,136,37,0.3)]
            "
          >
            <img
              src={logo}
              alt="PHIX Logo"
              className="w-7 h-7 object-contain"
            />
          </div>

          <div>
            <h1 className="font-black text-white text-lg leading-none tracking-wide">
              PHIX
            </h1>

            <p className="text-[8px] text-blue-100/60 tracking-[0.2em] uppercase">
              Maintenance
            </p>
          </div>
        </div>

        {/* Report button */}
        <button
          onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
          className="
            flex
            items-center
            gap-1.5

            bg-[#FF8825]
            text-white

            text-xs
            font-black
            tracking-wide

            px-4
            py-2

            rounded-xl

            shadow-[0_4px_14px_rgba(255,136,37,0.3)]

            hover:bg-orange-500
            hover:shadow-[0_5px_18px_rgba(255,136,37,0.4)]

            active:scale-95

            transition-all
            duration-200
          "
        >
          <span className="text-sm">{formPopup ? "×" : "+"}</span>

          {formPopup ? "Close" : "Report"}
        </button>
      </nav>

      {/* ─────────────────────────────────────────────
    MOBILE BOTTOM NAVIGATION
───────────────────────────────────────────── */}

      <nav
        className="
    md:hidden
    fixed
    bottom-0
    left-0
    right-0
    z-[100]

    flex
    items-center
    justify-center

    h-16
    border    
    bg-white

    border-t
    border-gray-200

    shadow-[0_-4px_20px_rgba(0,0,0,0.10)]
  "
      >
        <NavLink
          to="/Home"
          end
          className={({ isActive }) => `
      relative
      flex
      flex-col
      items-center
      justify-center
      gap-0.5

      w-24
      h-full

      text-xs
      font-bold
      tracking-wide

      transition-all
      duration-300

      ${isActive ? "text-[#FF8825]" : "text-gray-500 hover:text-[#FF8825]"}
    `}
        >
          {({ isActive }) => (
            <>
              {/* Home Icon */}
              <span
                className={`
            text-xl
            leading-none
            transition-transform
            duration-300
            ${isActive ? "scale-110" : ""}
          `}
              >
                ⌂
              </span>

              <span>Home</span>

              {/* Active indicator */}
              <span
                className={`
            absolute
            bottom-0
            left-1/2
            -translate-x-1/2

            h-1
            rounded-t-full

            bg-[#FF8825]

            transition-all
            duration-300

            ${isActive ? "w-10 opacity-100" : "w-0 opacity-0"}
          `}
              />
            </>
          )}
        </NavLink>
      </nav>

      {/* ─────────────────────────────────────────────
          DESKTOP NAVBAR
      ───────────────────────────────────────────── */}

      <nav
        className="
          hidden
          md:flex

          fixed
          top-0
          left-0
          right-0
          z-[100]

          items-center
          justify-between

          px-8
          lg:px-12

          py-3

          bg-[#40499F]/95
          backdrop-blur-xl

          border-b
          border-white/10

          shadow-[0_4px_24px_rgba(0,0,0,0.12)]
        "
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="
              flex
              items-center
              justify-center
              w-10
              h-10
              rounded-xl
              bg-[#FF8825]
              shadow-[0_4px_14px_rgba(255,136,37,0.3)]
            "
          >
            <img
              src={logo}
              alt="PHIX Logo"
              className="w-8 h-8 object-contain"
            />
          </div>

          <div>
            <h1 className="font-black text-white text-xl leading-none tracking-wider">
              PHIX
            </h1>

            <p className="text-[9px] text-blue-100/60 tracking-[0.22em] uppercase">
              Maintenance
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-10">
          <NavLink to="/Home" end className={navClass}>
            {({ isActive }) => (
              <>
                <span className="text-base">⌂</span>

                <span>Home</span>

                <span
                  className={`
                    absolute
                    -bottom-3
                    left-0
                    h-0.5
                    rounded-full
                    bg-[#FF8825]

                    transition-all
                    duration-300

                    ${isActive ? "w-full opacity-100" : "w-0 opacity-0"}
                  `}
                />
              </>
            )}
          </NavLink>

          {/* Report */}
          <button
            onClick={() => (formPopup ? handleClose() : setFormPopup(true))}
            className="
              flex
              items-center
              gap-2

              bg-[#FF8825]
              text-white

              text-sm
              font-black
              tracking-wide

              px-5
              py-2

              rounded-xl

              shadow-[0_4px_14px_rgba(255,136,37,0.25)]

              hover:bg-orange-500
              hover:shadow-[0_5px_20px_rgba(255,136,37,0.35)]

              active:scale-95

              transition-all
              duration-200
              cursor-pointer
            "
          >
            <span className="text-base">{formPopup ? "×" : "+"}</span>

            {formPopup ? "Close" : "New Report"}
          </button>
        </div>
      </nav>
    </>
  );
}
