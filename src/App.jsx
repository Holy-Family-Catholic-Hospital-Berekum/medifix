import Home from "../Staff/Home";
import History from "../Staff/History";
import { Routes, Route } from "react-router";
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/History" element={<History />} />
    </Routes>
  );
}
