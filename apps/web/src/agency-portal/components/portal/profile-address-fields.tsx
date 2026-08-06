import {
	type OrgAddress,
} from "@agency-portal/lib/org-address";
import {
	ProfileSettingsField,
	type ProfileFieldMode,
} from "@agency-portal/components/portal/profile-settings-ui";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DEFAULT_COUNTRY_CODE,
	listCities,
	listStates,
} from "@/lib/geo/country-state-city";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, MapPin, Search } from "lucide-react";
import { useState } from "react";

/**
 * Address block matching signup: line1/line2/postcode text, Malaysia-locked
 * country, searchable state + city cascading selects.
 */
export function ProfileAddressFields({
	value,
	onChange,
	mode,
}: {
	value: OrgAddress;
	onChange: (patch: Partial<OrgAddress>) => void;
	mode: ProfileFieldMode;
}) {
	const states = listStates(DEFAULT_COUNTRY_CODE);
	const cities = listCities(DEFAULT_COUNTRY_CODE, value.stateCode);
	const stateLabel =
		states.find((s) => s.isoCode === value.stateCode)?.name ||
		value.state ||
		"";

	return (
		<>
			<ProfileSettingsField
				icon={MapPin}
				label="Address line 1"
				value={value.addressLine1}
				onChange={(v) => onChange({ addressLine1: v })}
				mode={mode}
				placeholder="Street address, building, unit"
			/>
			<ProfileSettingsField
				icon={MapPin}
				label="Address line 2"
				value={value.addressLine2}
				onChange={(v) => onChange({ addressLine2: v })}
				mode={mode}
				placeholder="Floor, suite, landmark"
			/>
			<div className="grid gap-0 sm:grid-cols-2">
				{mode === "edit" && cities.length > 0 ? (
					<ProfileGeoSelect
						label="City"
						placeholder="Select city"
						value={value.city}
						disabled={!value.stateCode}
						options={cities.map((c) => ({
							value: c.name,
							label: c.name,
						}))}
						onChange={(city) => onChange({ city })}
					/>
				) : (
					<ProfileSettingsField
						icon={MapPin}
						label="City"
						value={value.city}
						onChange={(v) => onChange({ city: v })}
						mode={mode}
						placeholder={
							mode === "edit" && !value.stateCode
								? "Select state first"
								: "Select city"
						}
					/>
				)}
				<ProfileSettingsField
					icon={MapPin}
					label="Postcode"
					value={value.postcode}
					onChange={(v) => onChange({ postcode: v })}
					mode={mode}
					placeholder="e.g. 50450"
				/>
			</div>
			<div className="grid gap-0 sm:grid-cols-2">
				<div
					className={`iz-profile-field${mode === "edit" ? " iz-profile-field--edit" : ""}${mode === "locked" ? " iz-profile-field--locked" : ""}`}
				>
					<div className="iz-profile-field__label">
						<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
						<span>Country</span>
					</div>
					{mode === "edit" ? (
						<>
							<p className="iz-profile-field__value">Malaysia</p>
							<p className="iz-profile-field__hint">
								We currently support Malaysia only.
							</p>
						</>
					) : (
						<p className="iz-profile-field__value">
							{value.country.trim() || "Malaysia"}
						</p>
					)}
				</div>
				{mode === "edit" ? (
					<ProfileGeoSelect
						label="State"
						placeholder="Select state"
						value={value.stateCode}
						options={states.map((s) => ({
							value: s.isoCode,
							label: s.name,
						}))}
						onChange={(stateCode) =>
							onChange({
								stateCode,
								state:
									states.find((s) => s.isoCode === stateCode)?.name ?? "",
								city: "",
							})
						}
					/>
				) : (
					<ProfileSettingsField
						icon={MapPin}
						label="State"
						value={stateLabel}
						mode={mode}
					/>
				)}
			</div>
		</>
	);
}

function ProfileGeoSelect({
	label,
	placeholder,
	value,
	options,
	disabled,
	onChange,
}: {
	label: string;
	placeholder: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	disabled?: boolean;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const selectedLabel =
		options.find((option) => option.value === value)?.label ?? "";
	const needle = query.trim().toLowerCase();
	const filtered = needle
		? options.filter(
				(option) =>
					option.label.toLowerCase().includes(needle) ||
					option.value.toLowerCase().includes(needle),
			)
		: options;

	const pick = (next: string) => {
		onChange(next);
		setOpen(false);
		setQuery("");
	};

	return (
		<div className="iz-profile-field iz-profile-field--edit">
			<div className="iz-profile-field__label">
				<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
				<span>{label}</span>
			</div>
			<Popover
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setQuery("");
				}}
			>
				<PopoverTrigger asChild>
					<button
						type="button"
						role="combobox"
						aria-expanded={open}
						disabled={disabled}
						className={cn(
							"iz-profile-field__input flex w-full items-center justify-between text-left",
							!selectedLabel && "iz-muted",
							disabled && "opacity-50",
						)}
					>
						<span className="truncate">
							{selectedLabel || placeholder}
						</span>
						<ChevronsUpDown
							className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50"
							aria-hidden
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[var(--radix-popover-trigger-width)] border-[var(--iz-line)] bg-[var(--iz-panel)] p-0"
					align="start"
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<div className="border-b border-[var(--iz-line)] p-2">
						<div className="relative">
							<Search
								className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 iz-muted"
								aria-hidden
							/>
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search…"
								className="h-9 border-[var(--iz-line)] bg-[var(--iz-bg2)] pl-7"
								aria-label="Search"
							/>
						</div>
					</div>
					<ul className="max-h-72 overflow-y-auto p-1">
						<li>
							<button
								type="button"
								onClick={() => pick("")}
								className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-[var(--iz-bg2)]"
							>
								<Check
									className={cn(
										"h-4 w-4 shrink-0",
										value ? "opacity-0" : "opacity-100",
									)}
								/>
								<span className="truncate">{placeholder}</span>
							</button>
						</li>
						{filtered.map((option) => (
							<li key={option.value}>
								<button
									type="button"
									onClick={() => pick(option.value)}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-[var(--iz-bg2)]"
								>
									<Check
										className={cn(
											"h-4 w-4 shrink-0",
											value === option.value
												? "opacity-100"
												: "opacity-0",
										)}
									/>
									<span className="truncate">{option.label}</span>
								</button>
							</li>
						))}
						{filtered.length === 0 ? (
							<li className="iz-muted px-2 py-6 text-center text-sm">
								No results found.
							</li>
						) : null}
					</ul>
				</PopoverContent>
			</Popover>
		</div>
	);
}
