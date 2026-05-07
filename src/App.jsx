import History from "../Staff/History";
import EstateHome from "../Estate-manager/estateHome";
import StaffHome from "../Staff/staffHome";
import { Routes, Route } from "react-router";
import AssignedWorks from "../Estate-manager/assignedWorks";
import CompletedWorks from "../Estate-manager/completedWorks";
import OverdueWorks from "../Estate-manager/overdueWorks";

import AdminHome from "../Admin/adminHome";
import Assigned from "../Admin/Assigned";
import Completed from "../Admin/Completed";
import Overdue from "../Admin/Overdue";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminHome />} />
      <Route path="/History" element={<History />} />
      <Route path="/assignedWorks" element={<AssignedWorks />} />
      <Route path="/completedWorks" element={<CompletedWorks />} />
      <Route path="/overdueWorks" element={<OverdueWorks />} />

      <Route path="/Assigned" element={<Assigned />} />
      <Route path="/Completed" element={<Completed />} />
      <Route path="/Overdue" element={<Overdue />} />
    </Routes>
  );
}
