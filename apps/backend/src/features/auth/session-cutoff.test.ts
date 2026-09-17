import { describe, expect, it } from 'vitest';
import { floorToSecond, isTokenBeforeCutoff } from './session-cutoff';

describe('isTokenBeforeCutoff — whole seconds', () => {
  it('accepts a token from the SAME second even when the cutoff carries milliseconds', () => {
    // The re-issued token of a password change: minted at .900 after a cutoff
    // stamped at .700 of the same second. `iat` has no milliseconds, so the
    // token reads 10:00:00.000 — which used to be refused as older than .700.
    const cutoff = new Date('2026-09-13T10:00:00.700Z');
    const iatSeconds = Math.floor(new Date('2026-09-13T10:00:00.900Z').getTime() / 1000);
    expect(isTokenBeforeCutoff(new Date(iatSeconds * 1000), cutoff)).toBe(false);
  });

  it('refuses a token from the PREVIOUS second', () => {
    const cutoff = new Date('2026-09-13T10:00:00.000Z');
    expect(isTokenBeforeCutoff(new Date('2026-09-13T09:59:59.999Z'), cutoff)).toBe(true);
  });

  it('refuses the previous second against an unfloored cutoff too', () => {
    const cutoff = new Date('2026-09-13T10:00:00.050Z');
    expect(isTokenBeforeCutoff(new Date('2026-09-13T09:59:59.000Z'), cutoff)).toBe(true);
  });
});

describe('floorToSecond', () => {
  it('drops the milliseconds and nothing else', () => {
    expect(floorToSecond(new Date('2026-09-13T10:00:00.999Z')).toISOString()).toBe(
      '2026-09-13T10:00:00.000Z',
    );
    expect(floorToSecond(new Date('2026-09-13T10:00:01.000Z')).toISOString()).toBe(
      '2026-09-13T10:00:01.000Z',
    );
  });
});

describe('isTokenBeforeCutoff', () => {
  const cutoff = new Date('2026-09-13T10:00:00.000Z');

  it('refuses a token issued before the password changed', () => {
    // The point of the whole feature: the stolen device's session ends.
    expect(isTokenBeforeCutoff(new Date('2026-09-13T09:59:59.000Z'), cutoff)).toBe(
      true,
    );
  });

  it('allows a token issued after it', () => {
    expect(isTokenBeforeCutoff(new Date('2026-09-13T10:00:01.000Z'), cutoff)).toBe(
      false,
    );
  });

  it('allows a token issued in the SAME second', () => {
    // `iat` is seconds. Refusing on equal would log a person out with the token
    // their own password change had just minted.
    expect(isTokenBeforeCutoff(new Date(cutoff), cutoff)).toBe(false);
  });

  it('allows everything when the account has no cutoff', () => {
    // Every account carries NULL until its password changes — this is why the
    // migration signs nobody out.
    expect(isTokenBeforeCutoff(new Date('2020-01-01T00:00:00.000Z'), null)).toBe(
      false,
    );
  });

  it('allows a token that carries no issued-at', () => {
    // Undatable, not old. Refusing here would sign out every holder of a token
    // minted before this shipped.
    expect(isTokenBeforeCutoff(null, cutoff)).toBe(false);
  });
});
