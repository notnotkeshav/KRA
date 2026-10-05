import { Link } from "react-router";
import { PageHeader, EmptyState } from "~/components/common/ui";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState title="That page does not exist" description="Check the address or head back to the dashboard.">
        <Link to="/" className="text-sm font-medium text-indigo-600 hover:underline">Go to Dashboard</Link>
      </EmptyState>
    </>
  );
}
