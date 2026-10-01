// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  forgetSupersededTokens,
  isSessionRefusalAt,
  noteSupersededToken,
  refreshRefusedByServer,
  registerTokenProvider,
  renewSession,
  type RefreshOutcome,
  type SessionTokens,
  type TokenProvider,
} from './token-refresh';

/**
 * THE RENEWAL POLICY, with the network replaced by a hand-driven exchange.
 *
 * What is pinned is everything that decides whether a PR stays signed in: ONE
 * refresh however many requests were refused together (the endpoint shares
 * login's per-IP limiter), only a refused REFRESH ends a session, a request
 * that merely lost a race rides on the new token, and a token that is not this
 * session's is never swapped for one that is.
 */

const PAIR: SessionTokens = { accessToken: 'A1', refreshToken: 'R1', expiredAt: 1000 };

let held: SessionTokens | null;
let provider: TokenProvider & {
  renewed: jest.Mock<void, [SessionTokens]>;
  dead: jest.Mock<void, []>;
};
let unregister: () => void;

/** An exchange whose answer the test releases when it chooses. */
function heldExchange() {
  let release!: (outcome: RefreshOutcome) => void;
  const answer = new Promise<RefreshOutcome>((resolve) => {
    release = resolve;
  });
  const exchange = jest.fn(() => answer);
  return { exchange, release };
}

beforeEach(() => {
  held = { ...PAIR };
  provider = {
    current: () => held,
    renewed: jest.fn((next: SessionTokens) => {
      held = next;
    }),
    dead: jest.fn(() => {
      held = null;
    }),
  };
  unregister = registerTokenProvider(provider);
});

afterEach(() => {
  unregister();
});

describe('one refresh, shared by every request refused together', () => {
  test('three refusals of the same token make ONE exchange and all retry on its answer', async () => {
    const { exchange, release } = heldExchange();

    const waiting = [
      renewSession('A1', exchange),
      renewSession('A1', exchange),
      renewSession('A1', exchange),
    ];
    release({ kind: 'renewed', accessToken: 'A2', expiredAt: 2000 });
    const results = await Promise.all(waiting);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('R1');
    expect(results).toEqual([
      { kind: 'retry', accessToken: 'A2' },
      { kind: 'retry', accessToken: 'A2' },
      { kind: 'retry', accessToken: 'A2' },
    ]);
    // The refresh token is not rotated: the renewed pair keeps it.
    expect(provider.renewed).toHaveBeenCalledTimes(1);
    expect(provider.renewed).toHaveBeenCalledWith({
      accessToken: 'A2',
      refreshToken: 'R1',
      expiredAt: 2000,
    });
  });

  test('a request still out with the OLD token rides on the new one, with no second refresh', async () => {
    const exchange = jest.fn(
      async (): Promise<RefreshOutcome> => ({ kind: 'renewed', accessToken: 'A2', expiredAt: null }),
    );
    await renewSession('A1', exchange);

    // It was sent before the refresh landed and refused after it.
    const late = await renewSession('A1', exchange);

    expect(late).toEqual({ kind: 'retry', accessToken: 'A2' });
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  test('once a refresh has finished, a refusal of the NEW token asks again', async () => {
    const exchange = jest
      .fn<Promise<RefreshOutcome>, [string]>()
      .mockResolvedValueOnce({ kind: 'renewed', accessToken: 'A2', expiredAt: null })
      .mockResolvedValueOnce({ kind: 'renewed', accessToken: 'A3', expiredAt: null });
    await renewSession('A1', exchange);

    const next = await renewSession('A2', exchange);

    expect(exchange).toHaveBeenCalledTimes(2);
    expect(next).toEqual({ kind: 'retry', accessToken: 'A3' });
  });
});

describe('only a refused REFRESH ends the session', () => {
  test('dead: the provider forgets the session once, and every waiter is told', async () => {
    const { exchange, release } = heldExchange();

    const waiting = [renewSession('A1', exchange), renewSession('A1', exchange)];
    release({ kind: 'dead' });
    const results = await Promise.all(waiting);

    expect(results).toEqual([{ kind: 'dead' }, { kind: 'dead' }]);
    expect(provider.dead).toHaveBeenCalledTimes(1);
    expect(provider.renewed).not.toHaveBeenCalled();
  });

  test.each<[string, () => Promise<RefreshOutcome>]>([
    ['the server could not be reached', async () => ({ kind: 'unavailable' })],
    ['the exchange itself threw', async () => Promise.reject(new Error('socket hang up'))],
  ])('unavailable when %s — the session is kept as it was', async (_case, answer) => {
    const exchange = jest.fn(answer);

    const result = await renewSession('A1', exchange);

    expect(result).toEqual({ kind: 'unavailable' });
    expect(provider.dead).not.toHaveBeenCalled();
    expect(provider.renewed).not.toHaveBeenCalled();
    expect(held).toEqual(PAIR);
  });

  test('a session saved before refresh tokens were kept cannot renew: refused means over', async () => {
    held = { accessToken: 'A1', refreshToken: null, expiredAt: null };
    const exchange = jest.fn();

    const result = await renewSession('A1', exchange);

    expect(result).toEqual({ kind: 'dead' });
    expect(exchange).not.toHaveBeenCalled();
    expect(provider.dead).toHaveBeenCalledTimes(1);
  });
});

describe('never another account’s token', () => {
  test('a refused token this session never held is foreign — no refresh, no swap', async () => {
    const exchange = jest.fn();

    const result = await renewSession('SOMEONE-ELSES', exchange);

    expect(result).toEqual({ kind: 'foreign' });
    expect(exchange).not.toHaveBeenCalled();
  });

  test('with no session registered, every refusal is foreign', async () => {
    unregister();
    const exchange = jest.fn();

    expect(await renewSession('A1', exchange)).toEqual({ kind: 'foreign' });
    expect(exchange).not.toHaveBeenCalled();
  });

  test('after a sign-in as someone else, the old account’s tokens are foreign', async () => {
    noteSupersededToken('A0');
    forgetSupersededTokens();
    const exchange = jest.fn();

    expect(await renewSession('A0', exchange)).toEqual({ kind: 'foreign' });
  });
});

describe('the session moves while the server is being asked', () => {
  test('signed out meanwhile: the answer is dropped, nothing is renewed', async () => {
    const { exchange, release } = heldExchange();

    const waiting = renewSession('A1', exchange);
    held = null;
    release({ kind: 'renewed', accessToken: 'A2', expiredAt: null });

    expect(await waiting).toEqual({ kind: 'foreign' });
    expect(provider.renewed).not.toHaveBeenCalled();
  });

  test('a re-issued pair adopted meanwhile: the refused request retries on THAT pair', async () => {
    const { exchange, release } = heldExchange();

    const waiting = renewSession('A1', exchange);
    // What adoptToken does after a password change on this same account.
    noteSupersededToken('A1');
    held = { accessToken: 'NEW', refreshToken: 'R-NEW', expiredAt: null };
    release({ kind: 'dead' });

    expect(await waiting).toEqual({ kind: 'retry', accessToken: 'NEW' });
    // The old refresh token's refusal says nothing about the new pair.
    expect(provider.dead).not.toHaveBeenCalled();
  });
});

/**
 * WHICH 401s THE APP RENEWS — the SAME rule as the web's `isSessionRefusal`
 * (apps/web/src/lib/auth/token-refresh.ts). The cases below are the web test's
 * own, so the two clients cannot quietly disagree again.
 */
describe('isSessionRefusalAt — only a 401, and never from a body-credential endpoint', () => {
  test.each<[number | undefined, string, boolean]>([
    [401, '/notification', true],
    [401, '/auth/me', true],
    [401, '/auth/org-member-invite/accept', true],
    [401, 'http://h/graphql', true],
    [401, 'http://192.168.0.2:7777/api/v1/payment-voucher/mine/pv-1/export.pdf', true],
    [401, '/auth/login', false],
    [401, 'http://h/api/v1/auth/refresh?x=1', false],
    [401, '/user/abc/delete/', false],
    [401, 'http://192.168.0.2:7777/api/v1/user/abc/delete', false],
    [403, '/notification', false],
    [undefined, '/notification', false],
  ])('%s %s → %s', (status, url, expected) => {
    expect(isSessionRefusalAt(status, url)).toBe(expected);
  });

  test('a delete-looking path that is NOT self-delete still renews', () => {
    expect(isSessionRefusalAt(401, '/user/abc/delete/photo')).toBe(true);
  });
});

describe('refreshRefusedByServer — the web\'s refusedByServer', () => {
  test.each<[number, boolean]>([
    [400, true],
    [401, true],
    [403, true],
    [404, true],
    [408, false],
    [429, false],
    [500, false],
    [503, false],
  ])('%s → %s', (status, expected) => {
    expect(refreshRefusedByServer(status)).toBe(expected);
  });
});
