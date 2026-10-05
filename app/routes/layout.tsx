import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigation, useLocation } from "react-router";
import type { Route } from "./+types/layout";
import { getDB } from "~/db/indexeddb";
import { NAV_ITEMS, NavIcon } from "~/components/layout/nav";

/** Opens (and on first run migrates + seeds) the database before any page renders. */
export async function clientLoader(_args: Route.ClientLoaderArgs) {
  await getDB();
  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (import.meta.env.DEV) console.error("[kra] layout error", error);
  const message = error instanceof Error && error.name === "DatabaseError" ? error.message : "The application could not start.";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-2 text-xl font-semibold">Cannot open local database</h1>
        <p className="mb-6 text-sm text-slate-600">{message}</p>
        <button onClick={() => location.reload()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Reload
        </button>
      </div>
    </main>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-4">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          <NavIcon path={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const loading = navigation.state !== "idle";

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 flex-col bg-slate-900 lg:flex">
        <div className="flex h-14 items-center border-b border-slate-700/60 px-5 text-sm font-semibold text-white">KRA Management</div>
        <SidebarNav />
      </aside>

      {/* Mobile / tablet drawer */}
      {open && <div className="no-print fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-slate-900 transition-transform lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-700/60 px-5 text-sm font-semibold text-white">
          KRA Management
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded p-1 text-slate-400 hover:text-white">✕</button>
        </div>
        <SidebarNav onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print relative flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="text-base font-semibold text-slate-900">KRA Management</span>
          {loading && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-indigo-100" role="progressbar" aria-label="Loading">
              <div className="h-full w-1/3 bg-indigo-600" style={{ animation: "progress 1s ease-in-out infinite" }} />
            </div>
          )}
        </header>
        <main className="app-main flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className={loading ? "opacity-70 transition-opacity" : ""}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
