import { NavLink, useNavigate } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";

export default function NavBar({ navBarColor, logoBGColor, homeRedirect }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive
        ? "text-red-400 md:flex justify-center md:w-full"
        : "text-[#111827] hover:text-red-400 md:flex justify-center md:w-full"
    }`;

  return (
    <nav
      className={`flex justify-between items-center gap-2 ${navBarColor} shadow pl-4 md:pl-0 py-6 pr-4 w-full z-100 fixed top-0 bottom-auto`}
    >
      <h1
        className={`font-bold ${logoBGColor} md:h-full md:w-full md:max-w-[20%] md:absolute md:flex items-center justify-center`}
      >
        PHIX-HFCH
      </h1>

      <NavLink to={`${homeRedirect}`} end className={navClass}>
        Home
      </NavLink>

      <small
        onClick={handleLogout}
        className="text-[#111827] hover:text-red-400 cursor-pointer transition"
      >
        Logout
      </small>
    </nav>
  );
}
