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

import ProtectedRoute from "./protectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignUp />} />

      <Route
        path="/adminHome"
        element={
          <ProtectedRoute>
            <AdminHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estateHome"
        element={
          <ProtectedRoute>
            <EstateHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/Home"
        element={
          <ProtectedRoute>
            <StaffHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workerHome"
        element={
          <ProtectedRoute>
            <WorkerHome />
          </ProtectedRoute>
        }
      />

      <Route
        path="/adminAssigned"
        element={
          <ProtectedRoute>
            <AdminAssigned />
          </ProtectedRoute>
        }
      />
      <Route
        path="/adminCompleted"
        element={
          <ProtectedRoute>
            <AdminCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/adminOverdue"
        element={
          <ProtectedRoute>
            <AdminOverdue />
          </ProtectedRoute>
        }
      />

      <Route
        path="/estateAssigned"
        element={
          <ProtectedRoute>
            <EstateAssigned />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estateCompleted"
        element={
          <ProtectedRoute>
            <EstateCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estateOverdue"
        element={
          <ProtectedRoute>
            <EstateOverdue />
          </ProtectedRoute>
        }
      />

      <Route
        path="/workerCompleted"
        element={
          <ProtectedRoute>
            <WorkerCompleted />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workerOverdue"
        element={
          <ProtectedRoute>
            <WorkerOverdue />
          </ProtectedRoute>
        }
      />

      <Route
        path="/Pending"
        element={
          <ProtectedRoute>
            <Pending />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staffOverdue"
        element={
          <ProtectedRoute>
            <StaffOverdue />
          </ProtectedRoute>
        }
      />
      <Route
        path="/History"
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
