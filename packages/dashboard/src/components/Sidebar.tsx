import { NavLink, useNavigate } from "react-router-dom";

function SidebarLink({ to, children, icon }: { to: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-accent-muted text-accent border border-accent/10"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-3 border border-transparent"
        }`
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("agentpay_admin_key");
    navigate("/login");
    onClose();
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border bg-surface-1 transition-transform duration-300 lg:relative lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 animate-pulse-glow">
            <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-text-primary">AgentPay</h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-tertiary">Admin Console</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Management</p>
          <SidebarLink
            to="/agents"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            }
          >
            Agents
          </SidebarLink>
          <SidebarLink
            to="/approvals"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            }
          >
            Approvals
          </SidebarLink>
        </nav>

        <div className="border-t border-border px-3 py-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-tertiary hover:text-danger hover:bg-danger-muted transition-all duration-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
