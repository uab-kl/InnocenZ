import React, { useMemo, useState, type ReactNode } from 'react';
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../theme/theme';
import { Calendar, Check, ChevronDown } from '../../components/icons';

export function Row({ children }: { children: ReactNode }) {
	return <View style={styles.row}>{children}</View>;
}

export function Field({
	label,
	hint,
	error,
	flex,
	children,
}: {
	label: string;
	hint?: string;
	error?: string | null;
	flex?: boolean;
	children: ReactNode;
}) {
	return (
		<View style={[styles.field, flex && { flex: 1 }]}>
			<Text style={styles.fieldLabel}>{label}</Text>
			{children}
			{error ? <Text style={styles.fieldError}>{error}</Text> : null}
			{!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
		</View>
	);
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
	const disabled = props.editable === false;
	return (
		<View style={[styles.inputWrap, disabled && styles.inputWrapDisabled]}>
			<TextInput
				{...props}
				style={styles.input}
				placeholderTextColor={C.muted2}
				autoCapitalize={props.autoCapitalize ?? 'none'}
				autoCorrect={false}
			/>
		</View>
	);
}

/** Modal dropdown — clearer than an inline expand on small phone screens. */
export type PickerOption = {
	value: string;
	label: string;
	/** Flag emoji shown beside the name. */
	flag?: string;
	/** Primary title (country name). Falls back to `label`. */
	name?: string;
	/** Right-side meta, e.g. dial code `+60`. */
	meta?: string;
};

function normalizeOptions(options: Array<string | PickerOption>): PickerOption[] {
	return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export function Picker({
	value,
	options,
	onSelect,
	width,
	placeholder = 'Choose',
	title,
	searchable = false,
	displayValue,
}: {
	value: string | null;
	options: Array<string | PickerOption>;
	onSelect: (v: string) => void;
	width?: number;
	placeholder?: string;
	/** Sheet title when the dropdown opens. */
	title?: string;
	/** Show a search box (use for long lists like countries). */
	searchable?: boolean;
	/** Override the closed-field label (e.g. show `🇲🇾 +60` while value is `MY`). */
	displayValue?: string | null;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const insets = useSafeAreaInsets();
	const items = useMemo(() => normalizeOptions(options), [options]);
	const selected = items.find((o) => o.value === value);
	const shown = displayValue ?? selected?.label ?? placeholder;
	const empty = value == null || value === '';

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((o) => {
			const hay = `${o.label} ${o.name ?? ''} ${o.meta ?? ''} ${o.value}`.toLowerCase();
			return hay.includes(q);
		});
	}, [items, query]);

	const close = () => {
		setOpen(false);
		setQuery('');
	};

	return (
		<>
			<Pressable
				style={[styles.inputWrap, styles.pickerTrigger, width ? { width } : null]}
				onPress={() => setOpen(true)}
			>
				<Text
					style={[styles.pickerValue, empty && styles.pickerPlaceholder]}
					numberOfLines={1}
				>
					{shown}
				</Text>
				<ChevronDown size={16} color={C.muted2} strokeWidth={2.2} />
			</Pressable>

			<Modal visible={open} transparent animationType="fade" onRequestClose={close}>
				<Pressable style={styles.pickerBackdrop} onPress={close}>
					<Pressable
						style={[
							styles.pickerSheet,
							{ paddingBottom: 10 + Math.max(insets.bottom, 16) },
						]}
						onPress={(e) => e.stopPropagation()}
					>
						<Text style={styles.pickerSheetTitle}>{title ?? 'Select'}</Text>
						{searchable ? (
							<View style={styles.pickerSearchWrap}>
								<TextInput
									style={styles.pickerSearch}
									value={query}
									onChangeText={setQuery}
									placeholder="Search country or code"
									placeholderTextColor={C.muted2}
									autoCorrect={false}
									autoCapitalize="none"
									autoFocus
								/>
							</View>
						) : null}
						<ScrollView
							style={styles.pickerSheetList}
							keyboardShouldPersistTaps="handled"
							bounces={false}
						>
							{filtered.map((o) => {
								const on = o.value === value;
								const titleText = o.name ?? o.label;
								return (
									<Pressable
										key={o.value}
										onPress={() => {
											onSelect(o.value);
											close();
										}}
										style={[styles.pickerSheetRow, on && styles.pickerSheetRowOn]}
									>
										{o.flag ? <Text style={styles.pickerFlag}>{o.flag}</Text> : null}
										<Text
											style={[styles.pickerSheetRowText, on && styles.pickerSheetRowTextOn]}
											numberOfLines={1}
										>
											{titleText}
										</Text>
										{o.meta ? (
											<Text style={[styles.pickerMeta, on && styles.pickerSheetRowTextOn]}>
												{o.meta}
											</Text>
										) : null}
										{on ? <Check size={16} color={C.accent} strokeWidth={2.6} /> : null}
									</Pressable>
								);
							})}
							{filtered.length === 0 ? (
								<Text style={styles.pickerEmpty}>No matches.</Text>
							) : null}
						</ScrollView>
						<Pressable style={styles.pickerCancel} onPress={close}>
							<Text style={styles.pickerCancelText}>Cancel</Text>
						</Pressable>
					</Pressable>
				</Pressable>
			</Modal>
		</>
	);
}

const MONTHS = [
	{ value: 1, label: 'Jan' },
	{ value: 2, label: 'Feb' },
	{ value: 3, label: 'Mar' },
	{ value: 4, label: 'Apr' },
	{ value: 5, label: 'May' },
	{ value: 6, label: 'Jun' },
	{ value: 7, label: 'Jul' },
	{ value: 8, label: 'Aug' },
	{ value: 9, label: 'Sep' },
	{ value: 10, label: 'Oct' },
	{ value: 11, label: 'Nov' },
	{ value: 12, label: 'Dec' },
];

function daysInMonth(year: number, month: number) {
	return new Date(year, month, 0).getDate();
}

function pad2(n: number) {
	return String(n).padStart(2, '0');
}

function parseDob(value: string | null | undefined): { y: number; m: number; d: number } | null {
	if (!value) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
	return { y, m: mo, d };
}

function formatDob(y: number, m: number, d: number) {
	return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Bottom-sheet Y/M/D date picker — no native module (works with current APK). */
export function DatePicker({
	value,
	onSelect,
	placeholder = 'YYYY-MM-DD',
	title = 'Date of birth',
	/** Youngest allowed age (default 18 — IMI foreign-worker floor). */
	minAge = 18,
	/** Oldest allowed age. */
	maxAge = 80,
}: {
	value: string;
	onSelect: (isoDate: string) => void;
	placeholder?: string;
	title?: string;
	minAge?: number;
	maxAge?: number;
}) {
	const insets = useSafeAreaInsets();
	const [open, setOpen] = useState(false);

	const today = useMemo(() => new Date(), []);
	const maxYear = today.getFullYear() - minAge;
	const minYear = today.getFullYear() - maxAge;
	const years = useMemo(() => {
		const list: number[] = [];
		for (let y = maxYear; y >= minYear; y -= 1) list.push(y);
		return list;
	}, [maxYear, minYear]);

	const parsed = parseDob(value);
	const [year, setYear] = useState(parsed?.y ?? maxYear);
	const [month, setMonth] = useState(parsed?.m ?? 1);
	const [day, setDay] = useState(parsed?.d ?? 1);

	const pickYear = (y: number) => {
		setYear(y);
		setDay((d) => Math.min(d, daysInMonth(y, month)));
	};
	const pickMonth = (m: number) => {
		setMonth(m);
		setDay((d) => Math.min(d, daysInMonth(year, m)));
	};

	const openSheet = () => {
		const p = parseDob(value);
		setYear(p?.y ?? maxYear);
		setMonth(p?.m ?? 1);
		setDay(p?.d ?? 1);
		setOpen(true);
	};

	const maxDay = daysInMonth(year, month);
	const safeDay = Math.min(day, maxDay);

	const confirm = () => {
		onSelect(formatDob(year, month, safeDay));
		setOpen(false);
	};

	const empty = !value;
	const shown = value || placeholder;

	return (
		<>
			<Pressable style={[styles.inputWrap, styles.pickerTrigger]} onPress={openSheet}>
				<Text style={[styles.pickerValue, empty && styles.pickerPlaceholder]} numberOfLines={1}>
					{shown}
				</Text>
				<Calendar size={16} color={C.muted2} strokeWidth={2.2} />
			</Pressable>

			<Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
				<Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
					<Pressable
						style={[
							styles.pickerSheet,
							{ paddingBottom: 10 + Math.max(insets.bottom, 16) },
						]}
						onPress={(e) => e.stopPropagation()}
					>
						<Text style={styles.pickerSheetTitle}>{title}</Text>
						<View style={styles.dateCols}>
							<DateCol
								label="Year"
								items={years.map((y) => ({ value: y, label: String(y) }))}
								selected={year}
								onSelect={pickYear}
							/>
							<DateCol
								label="Month"
								items={MONTHS.map((m) => ({ value: m.value, label: m.label }))}
								selected={month}
								onSelect={pickMonth}
							/>
							<DateCol
								label="Day"
								items={Array.from({ length: maxDay }, (_, i) => ({
									value: i + 1,
									label: pad2(i + 1),
								}))}
								selected={safeDay}
								onSelect={setDay}
							/>
						</View>
						<Pressable style={styles.dateConfirm} onPress={confirm}>
							<Text style={styles.dateConfirmText}>Confirm</Text>
						</Pressable>
						<Pressable style={styles.pickerCancel} onPress={() => setOpen(false)}>
							<Text style={styles.pickerCancelText}>Cancel</Text>
						</Pressable>
					</Pressable>
				</Pressable>
			</Modal>
		</>
	);
}

function DateCol({
	label,
	items,
	selected,
	onSelect,
}: {
	label: string;
	items: { value: number; label: string }[];
	selected: number;
	onSelect: (v: number) => void;
}) {
	return (
		<View style={styles.dateCol}>
			<Text style={styles.dateColLabel}>{label}</Text>
			<ScrollView style={styles.dateColList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
				{items.map((item) => {
					const on = item.value === selected;
					return (
						<Pressable
							key={item.value}
							onPress={() => onSelect(item.value)}
							style={[styles.dateColRow, on && styles.dateColRowOn]}
						>
							<Text style={[styles.dateColText, on && styles.dateColTextOn]}>{item.label}</Text>
						</Pressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

export function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={[styles.choice, on && styles.choiceOn]}>
			<Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
		</Pressable>
	);
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.summaryRow}>
			<Text style={styles.summaryLabel}>{label}</Text>
			<Text style={styles.summaryValue}>{value || '—'}</Text>
		</View>
	);
}

export const fieldStyles = StyleSheet.create({
	row: { flexDirection: 'row', gap: 10 },
	inline: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
	field: { marginBottom: 12 },
	fieldLabel: {
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '600',
		letterSpacing: 0.3,
		color: C.prMuted,
		marginBottom: 6,
	},
	hint: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.muted2,
		marginTop: 5,
	},
	fieldError: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.red,
		marginTop: 5,
	},
	inputWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
		paddingHorizontal: 14,
	},
	inputWrapDisabled: { opacity: 0.55 },
	input: {
		flex: 1,
		paddingVertical: 12,
		fontFamily: F.sora,
		fontSize: 16,
		fontWeight: '600',
		color: C.txt,
	},
	pickerValue: {
		flex: 1,
		paddingVertical: 12,
		fontFamily: F.sora,
		fontSize: 16,
		fontWeight: '600',
		color: C.txt,
	},
	pickerPlaceholder: { color: C.muted2, fontWeight: '500' },
	pickerTrigger: { paddingRight: 10 },
	pickerSearchWrap: {
		marginHorizontal: 14,
		marginBottom: 8,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg,
		paddingHorizontal: 12,
	},
	pickerSearch: {
		paddingVertical: 11,
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '600',
		color: C.txt,
	},
	pickerEmpty: {
		paddingVertical: 20,
		paddingHorizontal: 18,
		fontFamily: F.manrope,
		fontSize: 14,
		color: C.muted2,
		textAlign: 'center',
	},
	pickerBackdrop: {
		flex: 1,
		justifyContent: 'flex-end',
		backgroundColor: 'rgba(0,0,0,0.55)',
	},
	pickerSheet: {
		maxHeight: '70%',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		backgroundColor: C.bg2,
		borderWidth: 1,
		borderColor: C.line,
		paddingTop: 14,
	},
	pickerSheetTitle: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: C.txt,
		paddingHorizontal: 18,
		marginBottom: 8,
	},
	pickerSheetList: { maxHeight: 320 },
	pickerSheetRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingVertical: 14,
		paddingHorizontal: 18,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: C.line,
	},
	pickerFlag: { fontSize: 22, width: 30, textAlign: 'center' },
	pickerSheetRowOn: { backgroundColor: 'rgba(227,184,119,0.10)' },
	pickerSheetRowText: {
		flex: 1,
		fontFamily: F.sora,
		fontSize: 16,
		fontWeight: '600',
		color: C.prMuted,
	},
	pickerSheetRowTextOn: { color: C.accent },
	pickerMeta: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: C.muted2,
		marginRight: 4,
	},
	pickerCancel: {
		marginTop: 6,
		marginHorizontal: 14,
		alignItems: 'center',
		paddingVertical: 13,
		borderRadius: 14,
		backgroundColor: C.bg,
		borderWidth: 1,
		borderColor: C.line,
	},
	pickerCancelText: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: C.prMuted,
	},
	dateCols: {
		flexDirection: 'row',
		gap: 8,
		paddingHorizontal: 14,
		marginBottom: 10,
		height: 220,
	},
	dateCol: { flex: 1 },
	dateColLabel: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 0.8,
		color: C.muted2,
		marginBottom: 6,
		textAlign: 'center',
	},
	dateColList: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg,
	},
	dateColRow: { paddingVertical: 10, alignItems: 'center' },
	dateColRowOn: { backgroundColor: 'rgba(227,184,119,0.14)' },
	dateColText: { fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.prMuted },
	dateColTextOn: { color: C.accent, fontWeight: '700' },
	dateConfirm: {
		marginHorizontal: 14,
		alignItems: 'center',
		paddingVertical: 13,
		borderRadius: 14,
		backgroundColor: C.accent,
	},
	dateConfirmText: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: '#241a08',
	},
	choice: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
	},
	choiceOn: { borderColor: C.accent },
	choiceText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.prMuted },
	choiceTextOn: { color: C.accent },
	note: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.45,
		color: C.muted2,
		marginTop: 4,
	},
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: 14,
		paddingVertical: 9,
		borderBottomWidth: 1,
		borderBottomColor: C.line,
	},
	summaryLabel: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.muted2 },
	summaryValue: {
		flex: 1,
		textAlign: 'right',
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '600',
		color: C.txt,
	},
});

const styles = fieldStyles;
