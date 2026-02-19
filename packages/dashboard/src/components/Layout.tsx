import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { getAdminKey } from "../api";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!getAdminKey()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b border-border bg-surface-1/80 backdrop-blur-sm px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-bold tracking-tight">AgentPay</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
