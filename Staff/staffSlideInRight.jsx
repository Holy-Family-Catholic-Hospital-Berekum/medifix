import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router";
import { signOut } from "firebase/auth";
import { auth } from "../src/firebase";

export default function StaffSlideInRight({ sidePopup }) {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (sidePopup) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      // ✅ Play slide-out before unmounting
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [sidePopup]);

  if (!visible) return null;

  const navClass = ({ isActive }) =>
    `cursor-pointer transition bg-orange-300 w-full text-center py-1 shadow-lg max-w-80 rounded-full border border-orange-500 ${
      isActive
        ? "text-green-800"
        : "text-[#111827] hover:text-blue-200 hover:bg-orange-400  "
    }`;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <>
      <div
        className={`fixed md:pt-10 top-0 flex flex-col gap-10 items-center justify-center right-0 w-full md:max-w-[500px] h-screen md:top-[12%] md:h-[80%] md:right-5 md:rounded-xl bg-[#FF8825] z-50 shadow-xl overflow-y-auto ${
          closing ? "slide-out-right" : "slide-in-right"
        }`}
      >
        {
          <NavLink to="/Pending" className={navClass}>
            Pending
          </NavLink>
        }
        <NavLink to="/History" className={navClass}>
          Completed
        </NavLink>

        <small
          className="text-red-700 bg-orange-400 px-4 rounded border hover:bg-red-500   cursor-pointer hover:text-red-800 transition"
          onClick={handleLogout}
        >
          Logout
        </small>
      </div>
    </>
  );
}
