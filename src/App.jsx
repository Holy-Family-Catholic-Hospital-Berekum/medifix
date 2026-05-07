import History from "../Staff/History";
import EstateHome from "../Estate-manager/estateHome";
import StaffHome from "../Staff/staffHome";
import { Routes, Route } from "react-router";
import AssignedWorks from "../Estate-manager/assignedWorks";
import CompletedWorks from "../Estate-manager/completedWorks";
import AdminHome from "../Admin/adminHome";
import OverdueWorks from "../Estate-manager/overdueWorks";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminHome />} />
      <Route path="/History" element={<History />} />
      <Route path="/assignedWorks" element={<AssignedWorks />} />
      <Route path="/completedWorks" element={<CompletedWorks />} />

      <Route path="/newReports" element={<newReports />} />
      <Route path="/overdueWorks" element={<OverdueWorks />} />
    </Routes>
  );
}
