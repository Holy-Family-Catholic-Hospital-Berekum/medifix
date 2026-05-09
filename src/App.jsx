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

import Pending from "../Staff/Pending";
import StaffOverdue from "../Staff/staffOverdue";

import DemoHome from "../demoHome";

import SignUp from "../signUp/signUp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignUp />} />

      <Route path="/adminHome" element={<AdminHome />} />
      <Route path="/estateHome" element={<EstateHome />} />
      <Route path="/Home" element={<StaffHome />} />
      <Route path="/workerHome" element={<WorkerHome />} />

      <Route path="/adminAssigned" element={<AdminAssigned />} />
      <Route path="/adminCompleted" element={<AdminCompleted />} />
      <Route path="/adminOverdue" element={<AdminOverdue />} />

      <Route path="/estateAssigned" element={<EstateAssigned />} />
      <Route path="/estateCompleted" element={<EstateCompleted />} />
      <Route path="/estateOverdue" element={<EstateOverdue />} />

      <Route path="/workerCompleted" element={<WorkerCompleted />} />
      <Route path="/workerOverdue" element={<WorkerOverdue />} />

      <Route path="/Pending" element={<Pending />} />
      <Route path="/staffOverdue" element={<StaffOverdue />} />
      <Route path="/History" element={<History />} />
    </Routes>
  );
}
