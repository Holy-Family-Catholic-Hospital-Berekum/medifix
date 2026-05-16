import { Routes, Route } from "react-router";

import History from "../Staff/History";
import StaffHome from "../Staff/staffHome";

import EstateHome from "../Estate-manager/estateHome";

import AdminHome from "../Admin/adminHome";

import EstateAssigned from "../Estate-manager/estateAssigned";
import EstateCompleted from "../Estate-manager/estateCompleted";

import AdminAssigned from "../Admin/adminAssigned";
import AdminCompleted from "../Admin/adminCompleted";
import Dashboard from "../components/Dashboard";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";

import Pending from "../Staff/Pending";

import SignUp from "../signUp/signUp";

import ProtectedRoute from "./protectedRoute";
import Manager from "../ItManager/manager";

export default function App() {
  // Read inside the component so it's always fresh on each render
  const user = JSON.parse(localStorage.getItem("user"))?.data;

  const dashboardNavBarColor = () => {
    if (user?.role === "admin") return "bg-green-300";
    if (user?.role === "estate") return "bg-yellow-300";
    if (user?.role === "manager") return "bg-blue-300";
    return "bg-gray-300";
  };

  const dashboardHomeRedirect = () => {
    if (user?.role === "admin") return "/adminHome";
    if (user?.role === "estate") return "/estateHome";
    if (user?.role === "manager") return "/manager";
    return "/";
  };

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
            <Manager />
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
        path="/Dashboard"
        element={
          <ProtectedRoute allowedRoles={["admin", "estate", "manager"]}>
            <Dashboard
              navBarColor={dashboardNavBarColor()}
              homeRedirect={dashboardHomeRedirect()}
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
