import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { PostJobEditableInputShell } from "@agency-portal/components/outlet/post-job-shift-ui";
import {
	isOtherSpecialEvent,
	type ShiftEventKind,
} from "@agency-portal/lib/outlet-demo";
import { cn } from "@agency-portal/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ImagePlus,
	Pencil,
	Plus,
	Sparkles,
	Trash2,
	ZoomIn,
} from "lucide-react";
import { useRef, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { useAuth } from "@/lib/auth-context";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	createShiftTemplate,
	fetchShiftTemplates,
	removeShiftTemplate,
	type SaveShiftTemplateInput,
	type ShiftTemplate,
	updateShiftTemplate,
} from "@/services/shift-template";

/**
 * The step BEFORE the Post Job form (owner's flow): a YouTube-style gallery of
 * the venue's event cards, Normal and Special kept apart, each with its cover
 * picture, plus Blank. Picking a card pre-fills the composer; the pencil opens
 * the editor; new cards (and their pictures) are the venue's own to make.
 */
export function EventTemplatePicker({
	onPick,
	onBlank,
}: {
	onPick: (template: ShiftTemplate) => void;
	onBlank: () => void;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<
		ShiftTemplate | { newKind: ShiftEventKind } | null
	>(null);
	// Owner's ask: tabs to see one kind at a time. "all" keeps both rows.
	const [kindTab, setKindTab] = useState<"all" | "normal" | "special">("all");

	const templatesQuery = useQuery({
		queryKey: ["outlet", "shift-templates"],
		queryFn: () => fetchShiftTemplates(logout),
		staleTime: 60_000,
	});
	const templates = templatesQuery.data ?? [];
	const normal = templates.filter((tpl) => tpl.eventKind === "normal");
	const special = templates.filter((tpl) => tpl.eventKind === "special");

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["outlet", "shift-templates"] });

	return (
		<div className="iz-event-picker">
			<div className="iz-event-picker__head">
				<p className="iz-event-picker__title">{t.postJob.chooseAnEvent}</p>
				<button type="button" className="iz-chip" onClick={onBlank}>
					{t.postJob.blankStartFresh}
				</button>
			</div>

			<div className="iz-event-picker__tabs">
				{(["all", "normal", "special"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						className={cn(
							"iz-post-job-event-type-pill",
							kindTab === tab && "is-active",
						)}
						onClick={() => setKindTab(tab)}
					>
						{tab === "all"
							? t.postJob.allEvents
							: tab === "normal"
								? t.postJob.normalEvent
								: t.postJob.specialEvent}
					</button>
				))}
			</div>

			{templatesQuery.isLoading ? (
				<p className="iz-tiny iz-muted">{t.postJob.loadingTemplates}</p>
			) : (
				<>
					{kindTab !== "special" && (
						<TemplateRow
							label={t.postJob.normalEvent}
							templates={normal}
							onPick={onPick}
							onEdit={setEditing}
							onNew={() => setEditing({ newKind: "normal" })}
						/>
					)}
					{kindTab !== "normal" && (
						<TemplateRow
							label={t.postJob.specialEvent}
							templates={special}
							onPick={onPick}
							onEdit={setEditing}
							onNew={() => setEditing({ newKind: "special" })}
						/>
					)}
				</>
			)}

			{editing && (
				<TemplateEditorSheet
					template={"id" in editing ? editing : null}
					newKind={"newKind" in editing ? editing.newKind : undefined}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						invalidate();
					}}
				/>
			)}
		</div>
	);
}

function TemplateRow({
	label,
	templates,
	onPick,
	onEdit,
	onNew,
}: {
	label: string;
	templates: ShiftTemplate[];
	onPick: (template: ShiftTemplate) => void;
	onEdit: (template: ShiftTemplate) => void;
	onNew: () => void;
}) {
	const { t } = usePortalLocale();
	const canWriteTemplates = useOutletCan()("postJob");
	return (
		<section className="iz-event-picker__section">
			<p className="iz-event-picker__kind">{label}</p>
			<div className="iz-event-picker__row">
				{templates.map((tpl) => (
					<TemplateCard
						key={tpl.id}
						template={tpl}
						onPick={onPick}
						onEdit={onEdit}
					/>
				))}
				{/*
				  * ⚠️ THIS FILE HAD NO PERMISSION CHECK ANYWHERE. Creating, editing and
				  * deleting an event template all write `/shift-template`, which the
				  * server gates on `booking:create` — so the outlet DIRECTOR, who holds
				  * `booking:read` alone, was shown all three and collected a 403 from
				  * each. `postJob` is that same grant on the portal side.
				  */}
				{canWriteTemplates && (
				<button
					type="button"
					className="iz-event-card iz-event-card--new"
					onClick={onNew}
				>
					<span className="iz-event-card__new-icon">
						<Plus className="h-5 w-5" aria-hidden />
					</span>
					{t.postJob.newTemplate}
				</button>
				)}
			</div>
		</section>
	);
}

function TemplateCard({
	template,
	onPick,
	onEdit,
}: {
	template: ShiftTemplate;
	onPick: (template: ShiftTemplate) => void;
	onEdit: (template: ShiftTemplate) => void;
}) {
	const { t } = usePortalLocale();
	const canWriteTemplates = useOutletCan()("postJob");
	const cover = apiAssetUrl(template.coverImage);
	return (
		<div className="iz-event-card">
			<button
				type="button"
				className="iz-event-card__pick"
				onClick={() => onPick(template)}
			>
				{cover ? (
					<img
						className="iz-event-card__img"
						src={cover}
						alt=""
						loading="lazy"
					/>
				) : (
					<span className="iz-event-card__placeholder" aria-hidden>
						<Sparkles className="h-5 w-5" />
					</span>
				)}
				<span className="iz-event-card__name">{template.name}</span>
			</button>
			{/* Same grant as "+ New template" — see the note there. */}
			{canWriteTemplates && (
				<button
					type="button"
					className="iz-event-card__edit"
					aria-label={fill(t.outletPanels.editNamed, { name: template.name })}
					onClick={() => onEdit(template)}
				>
					<Pencil className="h-3 w-3" aria-hidden />
				</button>
			)}
		</div>
	);
}

/** Picture-4 layout: fields left, live card preview right, Save/Discard on top. */
function TemplateEditorSheet({
	template,
	newKind,
	onClose,
	onSaved,
}: {
	template: ShiftTemplate | null;
	/** The row whose + was pressed — a NEW card's kind is decided there. */
	newKind?: ShiftEventKind;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { t } = usePortalLocale();
	const canWriteTemplates = useOutletCan()("postJob");
	const { logout } = useAuth();
	const fileRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(template?.name ?? "");
	// The kind is NOT edited here (owner's rule): a card is born normal or
	// special by which row's + created it, and never changes lane after.
	const eventKind: ShiftEventKind = template?.eventKind ?? newKind ?? "normal";
	// data URL of a newly chosen picture; null = keep the stored one.
	const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
	const [coverFileName, setCoverFileName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [previewZoom, setPreviewZoom] = useState(false);

	const saveMut = useMutation({
		mutationFn: async () => {
			const input: SaveShiftTemplateInput = {
				name: name.trim(),
				eventKind,
				specialEventType:
					eventKind === "special"
						? (template?.specialEventType ?? "other")
						: undefined,
				customSpecialEventName:
					eventKind === "special" &&
					isOtherSpecialEvent(template?.specialEventType ?? "other")
						? name.trim() // the template name IS the event type, in the owner's words
						: undefined,
				...(coverDataUrl
					? {
							coverBase64: coverDataUrl,
							coverFileName: coverFileName ?? "cover.jpg",
						}
					: {}),
			};
			if (template) return updateShiftTemplate(template.id, input, logout);
			return createShiftTemplate({ ...input, name: name.trim() }, logout);
		},
		onSuccess: onSaved,
		onError: (err) =>
			setError(
				err instanceof Error
					? err.message
					: t.outletPanels.couldNotSaveTemplate,
			),
	});
	const removeMut = useMutation({
		mutationFn: () => {
			if (!template) return Promise.resolve();
			return removeShiftTemplate(template.id, logout);
		},
		onSuccess: onSaved,
		onError: (err) =>
			setError(
				err instanceof Error
					? err.message
					: t.outletPanels.couldNotDeleteTemplate,
			),
	});

	const preview = coverDataUrl ?? apiAssetUrl(template?.coverImage) ?? null;
	const canSave = name.trim().length > 0 && !saveMut.isPending;

	return (
		<IzSheet open onClose={onClose} variant="dialog">
			<div className="iz-event-editor">
				<div className="iz-event-editor__bar">
					<p className="iz-event-editor__title">
						{template ? t.postJob.editTemplate : t.postJob.newTemplate}
					</p>
					<span
						className={cn(
							"iz-chosen-event-bar__kind",
							eventKind === "special"
								? "iz-chosen-event-bar__kind--special"
								: "iz-chosen-event-bar__kind--normal",
						)}
					>
						{eventKind === "special"
							? t.postJob.specialEvent
							: t.postJob.normalEvent}
					</span>
					<div className="flex items-center gap-2">
						{template && canWriteTemplates && (
							<button
								type="button"
								className="iz-chip text-[var(--iz-red)]"
								aria-label={t.postJob.deleteTemplate}
								onClick={() => removeMut.mutate()}
								disabled={removeMut.isPending}
							>
								<Trash2 className="h-3 w-3" aria-hidden />
							</button>
						)}
						<button type="button" className="iz-chip" onClick={onClose}>
							{t.postJob.discard}
						</button>
						<button
							type="button"
							className="iz-chip text-[var(--iz-gold)]"
							onClick={() => saveMut.mutate()}
							disabled={!canSave}
						>
							{saveMut.isPending ? "…" : t.postJob.saveTemplate}
						</button>
					</div>
				</div>

				{error && <p className="iz-tiny text-[var(--iz-red)]">{error}</p>}

				<div className="iz-event-editor__body">
					<div className="iz-event-editor__fields">
						<label className="iz-event-editor__field">
							<span>{t.postJob.templateName}</span>
							<PostJobEditableInputShell>
								<input
									type="text"
									className="w-full bg-transparent text-sm font-semibold text-[var(--iz-txt)] outline-none placeholder:text-[var(--iz-muted2)]"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t.postJob.templateNamePlaceholder}
								/>
							</PostJobEditableInputShell>
						</label>

						<div className="iz-event-editor__field">
							<span>{t.postJob.coverPicture}</span>
							<button
								type="button"
								className="iz-chip w-max"
								onClick={() => fileRef.current?.click()}
							>
								<ImagePlus className="h-3.5 w-3.5" aria-hidden />
								{t.postJob.uploadPicture}
							</button>
							<input
								ref={fileRef}
								type="file"
								accept="image/png,image/jpeg,image/webp"
								className="hidden"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (!file) return;
									const reader = new FileReader();
									reader.onload = () => {
										setCoverDataUrl(String(reader.result));
										setCoverFileName(file.name);
									};
									reader.readAsDataURL(file);
								}}
							/>
						</div>
					</div>

					{/* Live preview — the card exactly as the gallery will draw it. */}
					<div className="iz-event-card iz-event-card--preview">
						<span className="iz-event-card__pick">
							{preview ? (
								<button
									type="button"
									className="iz-event-cover-zoom w-full"
									aria-label={t.postJob.tapToZoom}
									onClick={() => setPreviewZoom(true)}
								>
									<img className="iz-event-card__img" src={preview} alt="" />
									<span className="iz-zoom-badge" aria-hidden>
										<ZoomIn className="h-2.5 w-2.5" />
									</span>
								</button>
							) : (
								<span className="iz-event-card__placeholder">
									<Sparkles className="h-5 w-5" />
								</span>
							)}
							<span className="iz-event-card__name">
								{name.trim() || t.postJob.templateNamePlaceholder}
							</span>
						</span>
					</div>
					{previewZoom && preview && (
						<PhotoLightbox
							photo={preview}
							alt={name.trim() || t.postJob.newTemplate}
							onClose={() => setPreviewZoom(false)}
						/>
					)}
				</div>
			</div>
		</IzSheet>
	);
}
