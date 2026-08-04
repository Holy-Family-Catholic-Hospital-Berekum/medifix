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

import AdminHome from "../Admin/adminHome";
import AdminAssigned from "../Admin/adminAssigned";
import AdminCompleted from "../Admin/adminCompleted";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";

import ProcurementHome from "../Procurement/procurementHome";
import ProcurementCompleted from "../Procurement/procurementCompleted";

const user = JSON.parse(localStorage.getItem("user"))?.data;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignUp />} />

      <Route
        path="/adminHome"
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
        path="/estateHome"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/procurementHome"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <ProcurementHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/procurementCompleted"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <ProcurementCompleted />
          </ProtectedRoute>
        }
      />

      <Route
        path="/procurementDashboard"
        element={
          <ProtectedRoute allowedRoles={["procurement"]}>
            <Dashboard
              homeRedirect="/procurementHome"
              dashboardRedirect="/procurementDashboard"
            />
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
        path="/workerHome"
        element={
          <ProtectedRoute allowedRoles={["worker"]}>
            <WorkerHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/adminAssigned"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminAssigned />
          </ProtectedRoute>
        }
      />
      <Route
        path="/adminCompleted"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminCompleted />
          </ProtectedRoute>
        }
      />

      <Route
        path="/adminDashboard"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Dashboard
              homeRedirect="/adminHome"
              dashboardRedirect="/adminDashboard"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/estateAssigned"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateAssigned />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estateCompleted"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <EstateCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estateDashboard"
        element={
          <ProtectedRoute allowedRoles={["estate"]}>
            <Dashboard
              homeRedirect="/estateHome"
              dashboardRedirect="/estateDashboard"
            />
          </ProtectedRoute>
        }
      />

      <Route
        path="/workerCompleted"
        element={
          <ProtectedRoute allowedRoles={["worker"]}>
            <WorkerCompleted />
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
