import { describe, expect, test } from "vitest";
import type { AttendanceFix } from "@/services/attendance-fix";
import { buildAttendanceGroups } from "./use-agency-attendance-fixes";

/**
 * The live case this was written for (7 Sep 2026, Atlas Agency): Vicky is
 * rostered at UAB Emhub 11:30-12:00 and at JK House 12:00-13:00 on the same
 * day. She checked into Emhub at 11:10 and has not checked out. The owner saw
 * her on BOTH venue cards and read it as the panel showing one person in two
 * places — the JK House row said only "Not checked in", with nothing to say she
 * was on the floor across town until noon.
 */
const noPhoto = () => null;

function fix(over: Partial<AttendanceFix>): AttendanceFix {
	return {
		assignmentId: "a1",
		prId: "pr-vicky",
		prName: "Vicky",
		status: "assigned",
		shiftDate: "2026-09-07",
		slot: "12:00 - 13:00",
		outlet: {
			id: "o-jk",
			name: "JK House",
			lat: 3.1,
			lng: 101.6,
			radiusM: 50,
			pinned: true,
		},
		checkIn: null,
		checkOut: null,
		...over,
	};
}

const emhubOpen = fix({
	assignmentId: "a-emhub",
	status: "confirmed",
	slot: "11:30 - 12:00",
	outlet: {
		id: "o-emhub",
		name: "UAB Emhub",
		lat: 3.2,
		lng: 101.7,
		radiusM: 50,
		pinned: true,
	},
	checkIn: {
		at: "2026-09-07T03:10:00.536Z",
		lat: 3.2,
		lng: 101.7,
		distanceM: 12,
		accuracyM: 8,
	},
	checkOut: null,
});

function jkRow(groups: ReturnType<typeof buildAttendanceGroups>["groups"]) {
	const jk = groups.find((g) => g.outlet === "JK House");
	if (!jk) throw new Error("JK House group missing");
	return jk.notArrived[0];
}

describe("buildAttendanceGroups · a PR on two venues in one day", () => {
	test("names the venue she has not checked out of", () => {
		const { groups } = buildAttendanceGroups([fix({}), emhubOpen], noPhoto);
		expect(jkRow(groups).stillCheckedInAt).toBe("UAB Emhub");
	});

	test("says nothing once she has checked out of that venue", () => {
		const closed: AttendanceFix = {
			...emhubOpen,
			checkOut: {
				at: "2026-09-07T04:00:00.000Z",
				lat: 3.2,
				lng: 101.7,
				distanceM: 14,
				accuracyM: 9,
			},
		};
		const { groups } = buildAttendanceGroups([fix({}), closed], noPhoto);
		expect(jkRow(groups).stillCheckedInAt).toBeNull();
	});

	test("never names the row's own venue back at the reader", () => {
		// Two JK House slots, the earlier one still open. The card already shows
		// that check-in above; repeating it on the later row explains nothing.
		const earlierSameVenue: AttendanceFix = {
			...emhubOpen,
			assignmentId: "a-jk-early",
			slot: "10:00 - 11:00",
			outlet: {
				id: "o-jk",
				name: "JK House",
				lat: 3.1,
				lng: 101.6,
				radiusM: 50,
				pinned: true,
			},
		};
		const { groups } = buildAttendanceGroups(
			[fix({}), earlierSameVenue],
			noPhoto,
		);
		expect(jkRow(groups).stillCheckedInAt).toBeNull();
	});

	test("a PR with no open check-in anywhere gets no clause", () => {
		const { groups } = buildAttendanceGroups([fix({})], noPhoto);
		expect(jkRow(groups).stillCheckedInAt).toBeNull();
	});
});

describe("buildAttendanceGroups · when a rostered PR is due", () => {
	test("resolves the slot start against the shift's own date", () => {
		const { groups } = buildAttendanceGroups([fix({})], noPhoto);
		const due = jkRow(groups).dueAt;
		expect(due).not.toBeNull();
		// Local midnight + 12:00, so the assertion holds in any zone.
		expect(new Date(due as string).getTime()).toBe(
			new Date(2026, 8, 7, 12, 0, 0, 0).getTime(),
		);
	});

	test("a timestamptz shift_date is not read as the previous day", () => {
		// shift_date arrives as LOCAL midnight; its first ten characters are the
		// day before in any zone east of UTC. Reading them raw made a shift due
		// 24 hours early — always in the past, so it could never read as due.
		const asTimestamptz = new Date(2026, 8, 7, 0, 0, 0, 0).toISOString();
		const { groups } = buildAttendanceGroups(
			[fix({ shiftDate: asTimestamptz })],
			noPhoto,
		);
		expect(new Date(jkRow(groups).dueAt as string).getTime()).toBe(
			new Date(2026, 8, 7, 12, 0, 0, 0).getTime(),
		);
	});

	test("a label-only slot has no due time rather than a made-up one", () => {
		const { groups } = buildAttendanceGroups(
			[fix({ slot: "Late night" })],
			noPhoto,
		);
		expect(jkRow(groups).dueAt).toBeNull();
	});

	test("an overnight slot is due on the evening it starts", () => {
		const { groups } = buildAttendanceGroups(
			[fix({ slot: "22:00 - 04:00" })],
			noPhoto,
		);
		expect(new Date(jkRow(groups).dueAt as string).getTime()).toBe(
			new Date(2026, 8, 7, 22, 0, 0, 0).getTime(),
		);
	});
});

/**
 * The half the first pass MISSED. By 11:56 Vicky held a stamped row at BOTH
 * UAB Emhub (in 11:10, never closed) and Velvet 23 (in 11:31) — two check-ins,
 * no check-outs — and each rendered as a bare "Within fence · 45 m". Nothing on
 * either row carried an hour, so the panel showed one person inside two fences
 * 300 m apart with no way to tell which was current. Fixing only the rows that
 * had NOT stamped left this exactly as the owner first found it.
 */
describe("buildAttendanceGroups · a PR stamped in at two venues", () => {
	const velvetLater: AttendanceFix = {
		...emhubOpen,
		assignmentId: "a-velvet",
		slot: "13:00 - 14:00",
		outlet: {
			id: "o-velvet",
			name: "Velvet 23",
			lat: 3.05,
			lng: 101.5,
			radiusM: 1000,
			pinned: true,
		},
		checkIn: {
			at: "2026-09-07T03:31:18.000Z",
			lat: 3.05,
			lng: 101.5,
			distanceM: 327,
			accuracyM: 14,
		},
		checkOut: null,
	};

	function mappedAt(fixes: AttendanceFix[], outlet: string) {
		const g = buildAttendanceGroups(fixes, noPhoto).groups.find(
			(x) => x.outlet === outlet,
		);
		if (!g) throw new Error(`${outlet} group missing`);
		return g.mapped[0];
	}

	test("every stamped row carries the hour it was taken", () => {
		const rows = [emhubOpen, velvetLater];
		expect(mappedAt(rows, "UAB Emhub").checkInAt).toBe(
			"2026-09-07T03:10:00.536Z",
		);
		expect(mappedAt(rows, "Velvet 23").checkInAt).toBe(
			"2026-09-07T03:31:18.000Z",
		);
	});

	test("the unclosed EARLIER row names the venue that overtook it", () => {
		const rows = [emhubOpen, velvetLater];
		expect(mappedAt(rows, "UAB Emhub").sinceCheckedInAt).toBe("Velvet 23");
	});

	test("the latest row is not marked — it is the one she is at", () => {
		const rows = [emhubOpen, velvetLater];
		expect(mappedAt(rows, "Velvet 23").sinceCheckedInAt).toBeUndefined();
	});

	test("a row that was checked out properly is never called stale", () => {
		// Emhub closed at 12:00, Velvet 23 opened at 11:31. A finished shift
		// followed by another one is ordinary, not a missed check-out.
		const emhubClosed: AttendanceFix = {
			...emhubOpen,
			checkOut: {
				at: "2026-09-07T04:00:00.000Z",
				lat: 3.2,
				lng: 101.7,
				distanceM: 14,
				accuracyM: 9,
			},
		};
		const row = mappedAt([emhubClosed, velvetLater], "UAB Emhub");
		expect(row.sinceCheckedInAt).toBeUndefined();
		expect(row.checkOutAt).toBe("2026-09-07T04:00:00.000Z");
	});

	test("a single open check-in is not marked against itself", () => {
		expect(mappedAt([emhubOpen], "UAB Emhub").sinceCheckedInAt).toBeUndefined();
	});

	test("a later stamp at the SAME venue does not mark the earlier one", () => {
		const sameVenueLater: AttendanceFix = {
			...velvetLater,
			assignmentId: "a-emhub-2",
			outlet: emhubOpen.outlet,
		};
		expect(
			mappedAt([emhubOpen, sameVenueLater], "UAB Emhub").sinceCheckedInAt,
		).toBeUndefined();
	});
});

describe("buildAttendanceGroups · counts still hold", () => {
	test("both assignments are counted, on their own venues", () => {
		const shape = buildAttendanceGroups([fix({}), emhubOpen], noPhoto);
		expect(shape.rostered).toBe(2);
		expect(shape.stamped).toBe(1);
		expect(shape.withFix).toBe(1);
		expect(shape.inRange).toBe(1);
		expect(shape.groups.map((g) => g.outlet)).toEqual([
			"JK House",
			"UAB Emhub",
		]);
	});
});
