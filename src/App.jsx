import { Routes, Route } from "react-router";

import SignUp from "../signUp/signUp";
import ProtectedRoute from "./protectedRoute";

import History from "../Staff/History";
import StaffHome from "../Staff/staffHome";
import Pending from "../Staff/Pending";

import EstateHome from "../Estate-manager/estateHome";
import EstateAssigned from "../Estate-manager/estateAssigned";
import EstateCompleted from "../Estate-manager/estateCompleted";
import Dashboard from "../components/Dashboard";
import Rejected from "../Estate-manager/estateRejected";
import EstateInProgress from "../Estate-manager/estateInProgress";

import AdminHome from "../Admin/adminHome";
import AdminInProgress from "../Admin/adminInProgress";
import AdminCompleted from "../Admin/adminCompleted";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";
import WorkerInProgress from "../Worker/workerInProgress";
import ProcurementHome from "../Procurement/procurementHome";
import ProcurementCompleted from "../Procurement/procurementCompleted";

const user = JSON.parse(localStorage.getItem("user"))?.data;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignUp />} />

      <Route
        path="/ah"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/manager"
        element={
          <ProtectedRoute allowedRoles={["manager"]}>
            <Dashboard homeRedirect="/manager" dashboardRedirect="/manager" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/eh"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ph"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <ProcurementHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pc"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <ProcurementCompleted />
          </ProtectedRoute>
        }
      />

      <Route
        path="/pd"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <Dashboard homeRedirect="/ph" dashboardRedirect="/pd" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/Home"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <StaffHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wh"
        element={
          <ProtectedRoute allowedRoles={["worker"]}>
            <WorkerHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/aip"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminInProgress />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ac"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCompleted />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ad"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Dashboard homeRedirect="/ah" dashboardRedirect="/ad" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/ea"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateAssigned />
          </ProtectedRoute>
        }
      />
      <Route
        path="/er"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <Rejected />
          </ProtectedRoute>
        }
      />
      <Route
        path="/eip"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateInProgress />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ec"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ed"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <Dashboard homeRedirect="/eh" dashboardRedirect="/ed" />
          </ProtectedRoute>
        }
      />

      <Route
        path="/wc"
        element={
          <ProtectedRoute allowedRoles={["worker"]}>
            <WorkerCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wa"
        element={
          <ProtectedRoute allowedRoles={["worker"]}>
            <WorkerInProgress />
          </ProtectedRoute>
        }
      />

      <Route
        path="/Pending"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <Pending />
          </ProtectedRoute>
        }
      />

      <Route
        path="/History"
        element={
          <ProtectedRoute allowedRoles={["staff"]}>
            <History />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
