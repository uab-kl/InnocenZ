// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import { ApiError } from './api';
import { isTransientFailure, withRetries } from './retry';

/**
 * The sign-up ID upload and Profile's "Take photo" retry a DROPPED CONNECTION,
 * and nothing else. The timer is injected — no test waits.
 */

const noWait = jest.fn(async (_ms: number) => {});

beforeEach(() => {
  noWait.mockClear();
});

describe('isTransientFailure', () => {
  test.each<[string, unknown, boolean]>([
    ['no connection (status 0)', new ApiError('Upload failed — could not finish talking', 0), true],
    ['a server fault', new ApiError('Internal Server Error', 500), true],
    ['a bad gateway', new ApiError('Upload failed (502)', 502), true],
    ['the limiter', new ApiError('Too many requests', 429), true],
    ['a timeout', new ApiError('Request timeout', 408), true],
    ['a file refused', new ApiError('Image too large', 413), false],
    ['a request refused', new ApiError('idPhoto is required', 400), false],
    ['not signed in', new ApiError('Unauthorized', 401), false],
    ['a platform error', new TypeError('Network request failed'), true],
  ])('%s → %s', (_label, error, expected) => {
    expect(isTransientFailure(error)).toBe(expected);
  });
});

describe('withRetries', () => {
  test('THE BUG: one dropped connection no longer loses the ID photo', async () => {
    const work = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new ApiError('Upload failed — could not finish talking', 0))
      .mockResolvedValueOnce('saved');

    await expect(withRetries(work, { attempts: 3, delayMs: 1500, sleep: noWait })).resolves.toBe('saved');
    expect(work).toHaveBeenCalledTimes(2);
    expect(noWait).toHaveBeenCalledWith(1500);
  });

  test('the wait doubles between tries', async () => {
    const work = jest.fn<Promise<string>, []>().mockRejectedValue(new ApiError('Bad gateway', 502));

    await expect(withRetries(work, { attempts: 3, delayMs: 1500, sleep: noWait })).rejects.toMatchObject({
      status: 502,
    });
    expect(work).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls.map(([ms]) => ms)).toEqual([1500, 3000]);
  });

  test('a refusal the request earned is not retried — the caller hears it at once', async () => {
    const work = jest.fn<Promise<string>, []>().mockRejectedValue(new ApiError('Image too large', 413));

    await expect(withRetries(work, { attempts: 3, delayMs: 1500, sleep: noWait })).rejects.toMatchObject({
      status: 413,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(noWait).not.toHaveBeenCalled();
  });

  test('success first time: one call, no wait', async () => {
    const work = jest.fn<Promise<string>, []>().mockResolvedValue('ok');

    await expect(withRetries(work, { attempts: 3, delayMs: 1500, sleep: noWait })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(noWait).not.toHaveBeenCalled();
  });
});
