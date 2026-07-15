import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Settings, User as UserIcon } from "lucide-react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/(admin)/profile")({
	component: ProfilePage,
	head: () => ({
		meta: [{ title: "Profile — Innocenz Admin" }],
	}),
});

function ProfilePage() {
	const { user, isLoading, isError, error } = useCurrentUser();
	const roleLabel = user?.roles?.[0] ?? "Admin";

	return (
		<PageShell>
			<PageHeader
				icon={UserIcon}
				title="Profile"
				description="Your signed-in admin account details."
				actions={
					<Button asChild variant="outline">
						<Link to="/settings">
							<Settings className="h-4 w-4" />
							Platform settings
						</Link>
					</Button>
				}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<CardTitle>Account</CardTitle>
					<CardDescription>
						Identity used for this admin session.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading profile…
						</div>
					) : isError ? (
						<p className="text-sm text-destructive">{getErrorMessage(error)}</p>
					) : (
						<div className="flex flex-col gap-6 sm:flex-row sm:items-start">
							<Avatar className="h-16 w-16">
								<AvatarImage
									src={`https://api.dicebear.com/9.x/glass/svg?seed=${user?.displayName}`}
									alt={user?.displayName ?? ""}
								/>
								<AvatarFallback>
									{user?.displayName?.charAt(0) ?? (
										<UserIcon className="h-6 w-6" />
									)}
								</AvatarFallback>
							</Avatar>
							<dl className="grid flex-1 gap-4 sm:grid-cols-2">
								<div>
									<dt className="text-xs text-muted-foreground">
										Display name
									</dt>
									<dd className="mt-1 text-sm font-medium">
										{user?.displayName || "—"}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">Email</dt>
									<dd className="mt-1 text-sm font-medium">
										{user?.email || "—"}
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">Role</dt>
									<dd className="mt-1">
										<Badge variant="outline" className="capitalize">
											{roleLabel}
										</Badge>
									</dd>
								</div>
								<div>
									<dt className="text-xs text-muted-foreground">User ID</dt>
									<dd className="mt-1 font-mono text-xs text-muted-foreground">
										{user?.id || "—"}
									</dd>
								</div>
							</dl>
						</div>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
