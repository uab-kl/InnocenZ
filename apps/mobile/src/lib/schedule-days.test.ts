import { buildScheduleDays, todayYmd, ymdToIso } from './demo-shifts';

/**
 * A date N days out. Derived from today rather than hardcoded because
 * `buildScheduleDays` opens its window at THIS payroll week's Sunday and closes
 * it 21 days past the baseline — a fixed date would fall outside that window
 * (and out of the test's reach) the moment the calendar moved on.
 */
function isoInDays(days: number): string {
  const [y, m, d] = todayYmd();
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymdToIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

const kindOn = (days: ReturnType<typeof buildScheduleDays>, iso: string) =>
  days.find((day) => day.dateIso === iso)?.kind;

describe('buildScheduleDays — a blocked day against a live shift', () => {
  const baseline = isoInDays(0);

  test('marks a blocked day unavailable when nothing is rostered on it', () => {
    // Arrange
    const day = isoInDays(3);

    // Act
    const days = buildScheduleDays([day], baseline, []);

    // Assert
    expect(kindOn(days, day)).toBe('unavailable');
  });

  test('shows the shift, not the block, when one agency blocked a day another still rosters', () => {
    // An approved MC blocks the whole DATE server-side (`blockLeaveDay`), but an
    // agency that REJECTED the same MC still holds the PR that night — a rejected
    // request reverts to `assigned`. The day must not read as time off.
    // Arrange
    const day = isoInDays(4);
    const stillOwed = [
      {
        id: 'b1',
        dateIso: day,
        outlet: 'Emhub Testing',
        time: '22:00 - 04:00',
        status: 'assigned',
        checkInAt: null,
        checkOutAt: null,
      },
    ];

    // Act
    const days = buildScheduleDays([day], baseline, stillOwed);

    // Assert — amber "still booked", never "Not available", which would invite
    // the no-show this calendar exists to prevent.
    expect(kindOn(days, day)).toBe('pending');
  });

  test('leaves a day with no block and no shift open', () => {
    // Arrange
    const day = isoInDays(5);

    // Act
    const days = buildScheduleDays([], baseline, []);

    // Assert
    expect(kindOn(days, day)).toBe('open');
  });
});
