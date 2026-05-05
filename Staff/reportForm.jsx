import { useState, useEffect } from "react";

export default function ReportForm({ formPopup, onClose }) {
  const [closing, setClosing] = useState(false);

  // ✅ When formPopup goes false, play slide-down before hiding
  useEffect(() => {
    if (!formPopup) {
      setClosing(true);
      const t = setTimeout(() => setClosing(false), 300);
      return () => clearTimeout(t);
    }
  }, [formPopup]);

  if (!formPopup && !closing) return null;

  return (
    <div className="z-50 fixed inset-0 flex items-end justify-center bg-black/40">
      <form
        className={`bg-red-300 w-full h-full overflow-y-auto pt-24 flex flex-col items-center gap-4 rounded-t-2xl ${
          closing ? "slide-down" : "slide-up"
        }`}
      >
        <div className="w-full max-w-[300px] md:max-w-[600px] pt-5 md:pt-10">
          <label htmlFor="category" className="text-lg">
            Category
          </label>
          <select
            name="category"
            id="category"
            className="px-2 w-full border border-red-400 rounded py-2 cursor-pointer"
          >
            <option value="Plumbing">Plumbing</option>
            <option value="Electricity">Electricity</option>
            <option value="Carpentry">Carpentry</option>
            <option value="Masonery">Masonery</option>
            <option value="Masonery">Refrigerator</option>
            <option value="Masonery">Air-conditioner</option>
          </select>
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="priority" className="text-lg">
            Priority Level
          </label>
          <select
            name="priority"
            id="priority"
            className="px-2 w-full border border-red-400 rounded py-2 cursor-pointer"
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="description" className="text-lg">
            Description
          </label>
          <textarea
            name="description"
            id="description"
            className="bg-gray-300 w-full p-2 rounded"
          />
        </div>

        <div className="w-full max-w-[300px] md:max-w-[600px]">
          <label htmlFor="location" className="text-lg">
            Location
          </label>
          <input
            type="text"
            id="location"
            className="bg-gray-300 w-full p-2 rounded"
          />
        </div>

        <button className="bg-red-400 w-full max-w-[200px] rounded py-2 text-lg hover:shadow shadow-white cursor-pointer mt-10 transition">
          Submit
        </button>
      </form>
    </div>
  );
}
