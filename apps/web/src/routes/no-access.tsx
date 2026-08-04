import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/lib/auth/use-auth-actions";

export const noAccessTitle = "No Access | Innocenz";

export const noAccessHead = () => ({
	meta: [{ title: noAccessTitle }],
});

export function NoAccessPage() {
	const { logout } = useAuthActions();

	return (
		<div className="fixed inset-0 z-50 flex min-h-svh w-full items-center justify-center bg-background px-6">
			<div className="flex w-full max-w-xl flex-col items-center text-center">
				<div className="mb-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/15">
					<ShieldAlert className="h-9 w-9 text-destructive" strokeWidth={1.5} />
				</div>

				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					You cannot access this web portal
				</h1>

				<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
					Your account role does not have a web portal on InnocenZ yet. Please
					contact support if you believe this is a mistake.
				</p>

				<Button
					size="lg"
					className="mt-8 h-11 gap-2.5 px-8 text-white dark:text-[#1a1726]"
					onClick={() => logout()}
				>
					Back to login
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/no-access")({
	head: noAccessHead,
	component: NoAccessPage,
});
