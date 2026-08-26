import { PR_LANGUAGE_OPTIONS } from "@agency-portal/lib/pr-demo";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { languageLabel } from "@/lib/portal-i18n/language-label";

const PRESET_SET = new Set<string>(PR_LANGUAGE_OPTIONS);

function formatLanguageLabel(raw: string): string {
	const trimmed = raw.trim().replace(/\s+/g, " ");
	if (!trimmed) return "";
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function ProfileLanguagePicker({
	value,
	onChange,
	hint,
}: {
	value: string[];
	onChange: (langs: string[]) => void;
	hint?: string;
}) {
	const { t } = usePortalLocale();
	const hintLabel = hint ?? t.managePr.tapToSelectLanguages;
	const [otherInput, setOtherInput] = useState("");

	const customLangs = useMemo(
		() => value.filter((lang) => !PRESET_SET.has(lang)),
		[value],
	);

	const toggle = (lang: string) => {
		const has = value.includes(lang);
		onChange(has ? value.filter((l) => l !== lang) : [...value, lang]);
	};

	const addOther = () => {
		const label = formatLanguageLabel(otherInput);
		if (!label) return;
		const exists = value.some((l) => l.toLowerCase() === label.toLowerCase());
		if (exists) {
			setOtherInput("");
			return;
		}
		onChange([...value, label]);
		setOtherInput("");
	};

	return (
		<>
			{hintLabel ? <p className="iz-tiny iz-muted2 mb-2">{hintLabel}</p> : null}
			<div className="flex flex-wrap gap-1.5">
				{PR_LANGUAGE_OPTIONS.map((lang) => {
					const on = value.includes(lang);
					return (
						<button
							key={lang}
							type="button"
							className={`iz-lang-pick${on ? " on" : ""}`}
							onClick={() => toggle(lang)}
						>
							{languageLabel(lang, t)}
						</button>
					);
				})}
				{customLangs.map((lang) => (
					<button
						key={lang}
						type="button"
						className="iz-lang-pick on"
						onClick={() => toggle(lang)}
					>
						{lang}
					</button>
				))}
			</div>
			<div className="mt-2.5 flex flex-col gap-2">
				<input
					type="text"
					value={otherInput}
					maxLength={32}
					placeholder={t.izUi.otherLanguage}
					className="w-full rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-3 py-2.5 text-xs text-[var(--iz-txt)] outline-none placeholder:text-[var(--iz-muted)] focus:border-[var(--iz-gold-d)]"
					onChange={(e) => setOtherInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addOther();
						}
					}}
				/>
				<button
					type="button"
					className="iz-btn iz-btn-soft w-full !py-2.5 !text-xs"
					onClick={addOther}
				>
					<Plus className="h-3.5 w-3.5" /> {t.izUi.add}
				</button>
			</div>
		</>
	);
}
