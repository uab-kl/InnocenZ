import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Loader2, Settings, User as UserIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	updateMyDisplayName,
	uploadMyProfileImage,
} from "@/lib/auth/profile-api";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { profileQueryKey } from "@/lib/auth/use-profile";
import { getErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/admin/profile")({
	component: ProfilePage,
	head: () => ({
		meta: [{ title: "Profile — Innocenz Admin" }],
	}),
});

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

function ProfilePage() {
	const queryClient = useQueryClient();
	const { user, isLoading, isError, error } = useCurrentUser();
	const fileInputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [displayName, setDisplayName] = useState("");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [imageBust, setImageBust] = useState(0);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (user?.displayName) setDisplayName(user.displayName);
	}, [user?.displayName]);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const roleLabel = user?.roles?.[0] ?? "Admin";
	const savedImageUrl = apiAssetUrl(user?.profileImage);
	const avatarSrc =
		previewUrl ??
		(savedImageUrl
			? `${savedImageUrl}${savedImageUrl.includes("?") ? "&" : "?"}t=${imageBust}`
			: undefined);

	const nameDirty = displayName.trim() !== (user?.displayName ?? "").trim();
	const dirty = nameDirty || Boolean(pendingFile);
	const canSave =
		Boolean(user?.id) && dirty && displayName.trim().length >= 2 && !saving;

	function onPickFile(file: File | undefined) {
		if (!file) return;
		if (!ACCEPTED_TYPES.split(",").includes(file.type)) {
			toast.error("Only JPG, PNG, and WebP images are allowed");
			return;
		}
		if (file.size > MAX_BYTES) {
			toast.error("Image must be 5 MB or smaller");
			return;
		}
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPendingFile(file);
		setPreviewUrl(URL.createObjectURL(file));
	}

	async function handleSave() {
		if (!user?.id || !canSave) return;
		const nextName = displayName.trim();
		setSaving(true);
		try {
			if (pendingFile) {
				await uploadMyProfileImage(user.id, pendingFile);
				setPendingFile(null);
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
					setPreviewUrl(null);
				}
				setImageBust(Date.now());
			}
			if (nextName !== user.displayName.trim()) {
				await updateMyDisplayName(user.id, nextName);
			}
			await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			toast.success("Profile saved");
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<PageShell>
			<PageHeader
				icon={UserIcon}
				title="Profile"
				description="Your signed-in admin account details."
				actions={
					<Button asChild variant="outline">
						<Link to="/admin/settings">
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
						Update your display name and profile picture. Changes are saved to
						your account.
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
						<div className="space-y-6">
							<div className="flex flex-col gap-6 sm:flex-row sm:items-start">
								<div className="flex flex-col items-center gap-3">
									<div className="relative">
										<Avatar className="h-24 w-24 ring-2 ring-(--lavender-soft)/40">
											<AvatarImage
												src={avatarSrc}
												alt={displayName || "Profile"}
											/>
											<AvatarFallback className="text-2xl">
												{displayName.trim().charAt(0).toUpperCase() || (
													<UserIcon className="h-8 w-8" />
												)}
											</AvatarFallback>
										</Avatar>
										<Button
											type="button"
											size="icon"
											variant="secondary"
											className="absolute -right-1 -bottom-1 h-9 w-9 rounded-full shadow-md"
											disabled={saving}
											onClick={() => fileInputRef.current?.click()}
											aria-label="Upload profile picture"
										>
											<Camera className="h-4 w-4" />
										</Button>
									</div>
									<input
										id={fileInputId}
										ref={fileInputRef}
										type="file"
										accept={ACCEPTED_TYPES}
										className="sr-only"
										onChange={(e) => {
											onPickFile(e.target.files?.[0]);
											e.target.value = "";
										}}
									/>
									<p className="max-w-[12rem] text-center text-xs text-muted-foreground">
										JPG, PNG or WebP · max 5 MB
									</p>
								</div>

								<div className="grid flex-1 gap-4 sm:grid-cols-2">
									<div className="space-y-2 sm:col-span-1">
										<Label htmlFor="admin-display-name">Display name</Label>
										<Input
											id="admin-display-name"
											value={displayName}
											onChange={(e) => setDisplayName(e.target.value)}
											placeholder="Your display name"
											maxLength={100}
											disabled={saving}
											className="max-w-xs"
										/>
									</div>
									<div>
										<dt className="text-sm text-muted-foreground">Email</dt>
										<dd className="mt-1 text-base font-medium">
											{user?.email || "—"}
										</dd>
									</div>
									<div>
										<dt className="text-sm text-muted-foreground">Role</dt>
										<dd className="mt-1">
											<Badge variant="outline" className="capitalize">
												{roleLabel}
											</Badge>
										</dd>
									</div>
									<div className="sm:col-span-2">
										<dt className="text-sm text-muted-foreground">User ID</dt>
										<dd className="mt-1 font-mono text-sm text-muted-foreground">
											{user?.id || "—"}
										</dd>
									</div>
								</div>
							</div>

							<div className="flex flex-wrap justify-end gap-2 border-t border-(--lavender-soft)/25 pt-4">
								<Button
									type="button"
									variant="outline"
									disabled={saving || !dirty}
									onClick={() => {
										setDisplayName(user?.displayName ?? "");
										setPendingFile(null);
										if (previewUrl) {
											URL.revokeObjectURL(previewUrl);
											setPreviewUrl(null);
										}
									}}
								>
									Reset
								</Button>
								<Button type="button" disabled={!canSave} onClick={handleSave}>
									{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
									Save changes
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
