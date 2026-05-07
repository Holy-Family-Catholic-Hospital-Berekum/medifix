import { Routes, Route } from "react-router";

import History from "../Staff/History";
import StaffHome from "../Staff/staffHome";

import EstateHome from "../Estate-manager/estateHome";
import AssignedWorks from "../Estate-manager/assignedWorks";
import CompletedWorks from "../Estate-manager/completedWorks";
import OverdueWorks from "../Estate-manager/overdueWorks";

import AdminHome from "../Admin/adminHome";
import Assigned from "../Admin/Assigned";
import Completed from "../Admin/Completed";
import Overdue from "../Admin/Overdue";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";
import WorkerOverdue from "../Worker/workerOverdue";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkerHome />} />
      <Route path="/History" element={<History />} />
      <Route path="/assignedWorks" element={<AssignedWorks />} />
      <Route path="/completedWorks" element={<CompletedWorks />} />
      <Route path="/overdueWorks" element={<OverdueWorks />} />

      <Route path="/Assigned" element={<Assigned />} />
      <Route path="/Completed" element={<Completed />} />
      <Route path="/Overdue" element={<Overdue />} />

      <Route path="/workerCompleted" element={<WorkerCompleted />} />
      <Route path="/workerOverdue" element={<WorkerOverdue />} />
    </Routes>
  );
}
