import { Routes, Route } from "react-router";

import History from "../Staff/History";
import StaffHome from "../Staff/staffHome";

import EstateHome from "../Estate-manager/estateHome";

import AdminHome from "../Admin/adminHome";

import EstateAssigned from "../Estate-manager/estateAssigned";
import EstateCompleted from "../Estate-manager/estateCompleted";
import EstateOverdue from "../Estate-manager/estateOverdue";

import AdminAssigned from "../Admin/adminAssigned";
import AdminCompleted from "../Admin/adminCompleted";
import AdminOverdue from "../Admin/adminOverdue";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";
import WorkerOverdue from "../Worker/workerOverdue";

import DemoHome from "../demoHome";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkerHome />} />
      <Route path="/History" element={<History />} />

      <Route path="/adminAssigned" element={<AdminAssigned />} />
      <Route path="/adminCompleted" element={<AdminCompleted />} />
      <Route path="/adminOverdue" element={<AdminOverdue />} />

      <Route path="/estateAssigned" element={<EstateAssigned />} />
      <Route path="/estateCompleted" element={<EstateCompleted />} />
      <Route path="/estateOverdue" element={<EstateOverdue />} />

      <Route path="/workerCompleted" element={<WorkerCompleted />} />
      <Route path="/workerOverdue" element={<WorkerOverdue />} />
    </Routes>
  );
}
