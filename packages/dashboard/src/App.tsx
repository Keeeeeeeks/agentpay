import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AgentsList from "./pages/AgentsList";
import AgentDetail from "./pages/AgentDetail";
import Approvals from "./pages/Approvals";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/agents" element={<AgentsList />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/approvals" element={<Approvals />} />
        </Route>
        <Route path="*" element={<Navigate to="/agents" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
