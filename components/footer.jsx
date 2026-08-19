import logo from "../images/icon.png";

export default function Footer({ page }) {
  return (
    <footer
      className={`relative overflow-hidden ${
        !page && "mt-[400px]"
      } bg-[#40499F] text-white pt-10 pb-24`}
    >
      {/* Decorative glow */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#FF8825]/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-blue-300/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        {/* Main footer content */}
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <div
            className="
              w-14 h-14
              flex items-center justify-center
              rounded-2xl
              bg-[#FF8825]
              shadow-[0_8px_25px_rgba(255,136,37,0.3)]
              mb-4
            "
          >
            <img
              src={logo}
              alt="PHIX-HFCH Logo"
              className="w-10 h-10 object-contain"
            />
          </div>

          {/* Brand */}
          <h1 className="text-2xl font-black tracking-wider">
            PHIX<span className="text-[#FF8825]">-HFCH</span>
          </h1>

          <p className="mt-2 text-blue-200 text-sm">Maintenance made simple.</p>
        </div>

        {/* Divider */}
        <div className="my-8 h-px bg-white/10" />

        {/* Bottom section */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center">
          <small className="text-blue-200">
            © {new Date().getFullYear()} PHIX-HFCH. All rights reserved.
          </small>

          <small className="text-blue-200">
            Developed with <span className="text-[#FF8825]">♥</span> by{" "}
            <a
              href="https://azumah-ernest.vercel.app/"
              className="
                text-white
                font-semibold
                border-b border-[#FF8825]
                hover:text-[#FF8825]
                transition-colors duration-300
              "
              target="_blank"
              rel="noopener noreferrer"
            >
              Eng. Azumah Ernest
            </a>
          </small>
        </div>
      </div>
    </footer>
  );
}
