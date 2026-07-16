import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/layout/admin-layout";
import { AdminNotFoundPage } from "@/components/layout/admin-not-found";
import { ensureAuthenticated } from "@/lib/auth/guards";
import { notFoundHead } from "@/routes/not-found";

export const Route = createFileRoute("/admin")({
	beforeLoad: () => {
		ensureAuthenticated();
	},
	notFoundComponent: AdminNotFoundPage,
	head: ({ matches }) => {
		const isNotFound = matches.some((match) => match.status === "notFound");
		return isNotFound ? notFoundHead() : {};
	},
	component: AdminRoot,
});

function AdminRoot() {
	return <AdminLayout />;
}
