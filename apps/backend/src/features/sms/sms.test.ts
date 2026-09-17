import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  NODE_ENV: 'development' as string,
  SMS_PROVIDER: undefined as string | undefined,
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/env.js', () => ({ env }));
vi.mock('@/util/logger.js', () => ({ logger }));

import { clearSmsProviders, registerSmsProvider, sendSms, smsConfigured } from './sms';
import { SMS_CODE_TEXT, smsCodeText } from './sms-text';

const TEXT = smsCodeText('123456', 10);

function loggedText(): boolean {
  const all = [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls];
  return all.some((call) => JSON.stringify(call).includes('123456'));
}

beforeEach(() => {
  env.NODE_ENV = 'development';
  env.SMS_PROVIDER = undefined;
  clearSmsProviders();
  vi.clearAllMocks();
});

afterEach(() => {
  clearSmsProviders();
});

describe('sms text', () => {
  it('is the contract sentence, in one constant', () => {
    expect(SMS_CODE_TEXT).toBe('RM0.00 InnocenZ: your code is {code}. Valid {minutes} minutes. Never share it.');
    expect(TEXT).toBe('RM0.00 InnocenZ: your code is 123456. Valid 10 minutes. Never share it.');
  });
});

describe('sendSms with NO provider', () => {
  it('outside production LOGS the text and reports logged', async () => {
    const result = await sendSms({ to: '+60123456789', text: TEXT, purpose: 'reset_password' });
    expect(result).toEqual({ status: 'logged' });
    expect(loggedText()).toBe(true);
  });

  it('in production SKIPS with a warning and never logs the text', async () => {
    env.NODE_ENV = 'production';
    const result = await sendSms({ to: '+60123456789', text: TEXT, purpose: 'reset_password' });
    expect(result.status).toBe('skipped');
    expect(logger.warn).toHaveBeenCalled();
    expect(loggedText()).toBe(false);
  });

  it('reports not configured', () => {
    expect(smsConfigured()).toBe(false);
  });
});

describe('sendSms with a provider', () => {
  it('sends through the registered adapter named by SMS_PROVIDER, digits only', async () => {
    const send = vi.fn(async () => ({ ok: true as const, messageId: 'm-1' }));
    registerSmsProvider({ name: 'Acme', send });
    env.SMS_PROVIDER = 'acme';
    env.NODE_ENV = 'production';

    expect(smsConfigured()).toBe(true);
    const result = await sendSms({ to: '+60 12-345 6789', text: TEXT });
    expect(result).toEqual({ status: 'sent', messageId: 'm-1' });
    expect(send).toHaveBeenCalledWith({ to: '60123456789', text: TEXT });
  });

  it('reports failed when the adapter refuses', async () => {
    registerSmsProvider({ name: 'acme', send: async () => ({ ok: false as const, error: 'blocked' }) });
    env.SMS_PROVIDER = 'acme';
    expect(await sendSms({ to: '60123456789', text: TEXT })).toEqual({ status: 'failed', error: 'blocked' });
  });

  it('reports failed when the adapter throws', async () => {
    registerSmsProvider({
      name: 'acme',
      send: async () => {
        throw new Error('network');
      },
    });
    env.SMS_PROVIDER = 'acme';
    expect((await sendSms({ to: '60123456789', text: TEXT })).status).toBe('failed');
  });

  it('a provider NAMED but not registered is failed, not a quiet skip', async () => {
    env.SMS_PROVIDER = 'typo';
    env.NODE_ENV = 'production';
    const result = await sendSms({ to: '60123456789', text: TEXT });
    expect(result.status).toBe('failed');
    expect(loggedText()).toBe(false);
  });

  it('refuses a destination that is not a phone number', async () => {
    expect((await sendSms({ to: '123', text: TEXT })).status).toBe('failed');
  });

  it('a refusal or throw that quotes the number is logged masked, never raw', async () => {
    const quoted = (): string => {
      const all = [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls];
      return JSON.stringify(all);
    };
    registerSmsProvider({
      name: 'acme',
      send: async () => ({ ok: false as const, error: 'Destination +60123456789 is barred' }),
    });
    env.SMS_PROVIDER = 'acme';
    await sendSms({ to: '60123456789', text: TEXT });

    clearSmsProviders();
    registerSmsProvider({
      name: 'acme',
      send: async () => {
        throw new Error('Invalid destination 012-345 6789');
      },
    });
    await sendSms({ to: '60123456789', text: TEXT });

    // The instrument: both lines were written, and they name the tail.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(quoted()).toContain('6789');
    expect(quoted()).not.toContain('60123456789');
    expect(quoted()).not.toContain('012-345 6789');
  });

  it('the dev-only log keeps the text but masks the number', async () => {
    await sendSms({ to: '+60123456789', text: TEXT, purpose: 'reset_password' });
    const all = JSON.stringify(logger.warn.mock.calls);
    expect(loggedText()).toBe(true);
    expect(all).not.toContain('60123456789');
  });
});
