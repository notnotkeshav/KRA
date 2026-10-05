import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>KRA Management</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function HydrateFallback() {
  return (
    <div role="status" className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
      <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      Loading KRA Management…
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let details = "An unexpected error occurred. Reloading the page usually helps.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : "Error";
    details = error.status === 404 ? "The page you requested does not exist." : error.statusText || details;
  } else if (error instanceof Error && error.name === "DatabaseError") {
    title = "Local database problem";
    details = error.message;
  }
  if (import.meta.env.DEV) console.error("[kra] route error", error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mb-6 text-sm text-slate-600">{details}</p>
        <a href="/" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Go to Dashboard
        </a>
      </div>
    </main>
  );
}
