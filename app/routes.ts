import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/dashboard.tsx", { id: "index" }),
    route("dashboard", "routes/dashboard.tsx", { id: "dashboard" }),

    // One module serves all three monthly URLs; the loader fills in missing params and redirects.
    route("monthly", "routes/monthly.tsx", { id: "monthly" }),
    route("monthly/:year/:month", "routes/monthly.tsx", { id: "monthly-month" }),
    route("monthly/:year/:month/:employeeId", "routes/monthly.tsx", { id: "monthly-employee" }),

    route("quarterly", "routes/quarterly.tsx", { id: "quarterly" }),
    route("quarterly/:year/:quarter", "routes/quarterly.tsx", { id: "quarterly-detail" }),

    route("employees", "routes/employees.tsx"),
    route("employees/:employeeId", "routes/employee-detail.tsx"),
    route("kra-config", "routes/kra-config.tsx"),
    route("export", "routes/export.tsx"),
    route("settings", "routes/settings.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
