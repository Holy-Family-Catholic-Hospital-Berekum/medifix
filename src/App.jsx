import { Routes, Route } from "react-router";

import History from "../Staff/History";
import StaffHome from "../Staff/staffHome";

import EstateHome from "../Estate-manager/estateHome";

import AdminHome from "../Admin/adminHome";

import EstateAssigned from "../Estate-manager/estateAssigned";
import EstateCompleted from "../Estate-manager/estateCompleted";

import AdminAssigned from "../Admin/adminAssigned";
import AdminCompleted from "../Admin/adminCompleted";
import AdminDashboard from "../Admin/adminDashboard";

import WorkerCompleted from "../Worker/workerCompleted";
import WorkerHome from "../Worker/workerHome";

import Pending from "../Staff/Pending";

import SignUp from "../signUp/signUp";

import ProtectedRoute from "./protectedRoute";
import Manager from "../ItManager/manager";

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
        path="/manager"
        element={
          <ProtectedRoute>
            <Manager homeRedirect="/estateHome" />
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
        path="/adminDashboard"
        element={
          <AdminDashboard
            navBarColor="bg-green-300"
            homeRedirect="/adminHome"
          />
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
        path="/workerCompleted"
        element={
          <ProtectedRoute>
            <WorkerCompleted />
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
