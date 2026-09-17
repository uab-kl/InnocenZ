import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  NODE_ENV: 'development' as string,
  OTP_DELIVERY_LOG_ONLY: undefined as string | undefined,
  SMS_PROVIDER: undefined as string | undefined,
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/env.js', () => ({ env }));
vi.mock('@/util/logger.js', () => ({ logger }));
// The real transports are replaced by the injected `senders` below; these stop
// their modules opening SMTP / reading templates at import.
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  emailConfigured: () => false,
  sendAccountCodeEmail: vi.fn(),
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => false,
  sendWhatsAppOtp: vi.fn(),
}));

import { type CodeSenders, deliverCode, deliveryLogOnly, plannedChannels, channelColumn } from './delivery';

const CODE = '482913';

function senders(overrides: Partial<CodeSenders> = {}): CodeSenders & {
  sendWhatsApp: ReturnType<typeof vi.fn>;
  sendSms: ReturnType<typeof vi.fn>;
  sendEmail: ReturnType<typeof vi.fn>;
} {
  return {
    whatsappConfigured: () => true,
    sendWhatsApp: vi.fn(async () => ({ ok: true as const, messageId: 'wamid-1' })),
    sendSms: vi.fn(async () => ({ status: 'sent' as const, messageId: 'sms-1' })),
    emailConfigured: () => true,
    sendEmail: vi.fn(async () => ({ messageId: 'e-1', accepted: ['x'], rejected: [] })),
    ...overrides,
  } as never;
}

const input = {
  code: CODE,
  purpose: 'reset_password' as const,
  purposeLabel: 'Password reset',
  validMinutes: 10,
  phone: '+60123456789',
  email: 'Owner@Atlas-Agency.my',
  name: 'Owner',
};

function codeWasLogged(): boolean {
  const all = [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls];
  return all.some((call) => JSON.stringify(call).includes(CODE));
}

beforeEach(() => {
  env.NODE_ENV = 'development';
  env.OTP_DELIVERY_LOG_ONLY = undefined;
  vi.clearAllMocks();
});

describe('deliverCode — one code, every channel', () => {
  it('sends by WhatsApp and SMS to the phone and by email to the email, masked', async () => {
    const s = senders();
    const result = await deliverCode(input, s);
    expect(result.ok).toBe(true);
    expect(result.waMessageId).toBe('wamid-1');
    expect(result.sentTo).toEqual([
      { channel: 'whatsapp', to: '+60 ••••• 6789', status: 'sent' },
      { channel: 'sms', to: '+60 ••••• 6789', status: 'sent' },
      { channel: 'email', to: 'o••••@atlas-agency.my', status: 'sent' },
    ]);
    expect(s.sendWhatsApp).toHaveBeenCalledWith('60123456789', CODE, 'reset_password', 'Password reset');
    expect(s.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '60123456789',
        text: 'RM0.00 InnocenZ: your code is 482913. Valid 10 minutes. Never share it.',
      }),
    );
    expect(s.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: 'owner@atlas-agency.my', code: CODE }),
    );
  });

  it('only tries the channels a destination exists for', async () => {
    const s = senders();
    const result = await deliverCode({ ...input, phone: null }, s);
    expect(result.sentTo.map((d) => d.channel)).toEqual(['email']);
    expect(s.sendWhatsApp).not.toHaveBeenCalled();
    expect(s.sendSms).not.toHaveBeenCalled();
  });

  it('one channel failing does not fail the others, and one sent is enough', async () => {
    env.NODE_ENV = 'production';
    const s = senders({
      sendWhatsApp: vi.fn(async () => ({ ok: false as const, error: 'template' })),
      sendEmail: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    });
    const result = await deliverCode(input, s);
    expect(result.sentTo.map((d) => d.status)).toEqual(['failed', 'sent', 'failed']);
    expect(result.ok).toBe(true);
  });
});

describe('deliverCode — production with nothing sent is an error', () => {
  it('ok=false when every channel failed or was skipped', async () => {
    env.NODE_ENV = 'production';
    const s = senders({
      whatsappConfigured: () => false,
      sendSms: vi.fn(async () => ({ status: 'skipped' as const, reason: 'no provider' })),
      sendEmail: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    });
    const result = await deliverCode(input, s);
    expect(result.sentTo.map((d) => d.status)).toEqual(['skipped', 'skipped', 'failed']);
    expect(result.ok).toBe(false);
    expect(codeWasLogged()).toBe(false);
  });

  it('ok=false when there is no destination at all', async () => {
    const result = await deliverCode({ ...input, phone: null, email: null }, senders());
    expect(result.sentTo).toEqual([]);
    expect(result.ok).toBe(false);
  });
});

describe('OTP_DELIVERY_LOG_ONLY', () => {
  it('outside production: every channel LOGS, nothing is sent, and that counts as delivered', async () => {
    env.OTP_DELIVERY_LOG_ONLY = 'true';
    const s = senders();
    expect(deliveryLogOnly()).toBe(true);
    const result = await deliverCode(input, s);
    expect(result.sentTo.map((d) => d.status)).toEqual(['logged', 'logged', 'logged']);
    expect(result.ok).toBe(true);
    expect(s.sendWhatsApp).not.toHaveBeenCalled();
    expect(s.sendSms).not.toHaveBeenCalled();
    expect(s.sendEmail).not.toHaveBeenCalled();
    expect(codeWasLogged()).toBe(true);
  });

  it('is IGNORED in production — real sends happen and the code is never logged', async () => {
    env.NODE_ENV = 'production';
    env.OTP_DELIVERY_LOG_ONLY = 'true';
    const s = senders();
    expect(deliveryLogOnly()).toBe(false);
    const result = await deliverCode(input, s);
    expect(result.sentTo.map((d) => d.status)).toEqual(['sent', 'sent', 'sent']);
    expect(s.sendWhatsApp).toHaveBeenCalled();
    expect(codeWasLogged()).toBe(false);
  });

  it('an unconfigured channel outside production is logged, not skipped', async () => {
    const s = senders({ whatsappConfigured: () => false, emailConfigured: () => false });
    const result = await deliverCode(input, s);
    expect(result.sentTo.map((d) => `${d.channel}:${d.status}`)).toEqual([
      'whatsapp:logged',
      'sms:sent',
      'email:logged',
    ]);
  });
});

describe('plannedChannels / channelColumn', () => {
  it('lists the channels in fixed order and fits the varchar(20) column', () => {
    const channels = plannedChannels({ phone: '0123456789', email: 'a@b.my' });
    expect(channels).toEqual(['whatsapp', 'sms', 'email']);
    expect(channelColumn(channels)).toBe('whatsapp,sms,email');
    expect(channelColumn(channels).length).toBeLessThanOrEqual(20);
    expect(plannedChannels({ phone: 'x', email: 'a@b.my' })).toEqual(['email']);
  });
});
