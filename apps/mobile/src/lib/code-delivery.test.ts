// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../i18n/translations';
import type { CodeDelivery } from './api';
import {
  codeReachedSomewhere,
  describeCodeDelivery,
  isCompleteCode,
  isPlausibleEmail,
  minutesFromSeconds,
  normalizeEmailInput,
  retryAfterSeconds,
} from './code-delivery';

/**
 * The PR must be told WHERE a code went — which phone, which inbox — or she
 * waits on the wrong app. And she must never be told a channel worked when the
 * server reported it failed.
 */

const EN = translations.en.security;
const ZH = translations.zh.security;
const ZH_HANT = translations['zh-Hant'].security;

const PHONE = '+60 ••••• 6789';
const MAIL = 'o••••@atlas-agency.my';

const ALL_SENT: CodeDelivery[] = [
  { channel: 'whatsapp', to: PHONE, status: 'sent' },
  { channel: 'sms', to: PHONE, status: 'sent' },
  { channel: 'email', to: MAIL, status: 'sent' },
];

describe('describeCodeDelivery', () => {
  test('reads exactly as the contract example in English', () => {
    expect(describeCodeDelivery(ALL_SENT, EN)).toBe(
      'Code sent by WhatsApp and SMS to +60 ••••• 6789 and by email to o••••@atlas-agency.my',
    );
  });

  test('renders in Simplified and Traditional Chinese with the masks untouched', () => {
    expect(describeCodeDelivery(ALL_SENT, ZH)).toBe(
      '验证码已通过 WhatsApp 和 短信 发送至 +60 ••••• 6789，并通过 电子邮件 发送至 o••••@atlas-agency.my',
    );
    expect(describeCodeDelivery(ALL_SENT, ZH_HANT)).toBe(
      '驗證碼已透過 WhatsApp 和 簡訊 傳送至 +60 ••••• 6789，並透過 電子郵件 傳送至 o••••@atlas-agency.my',
    );
  });

  test('phone channels come first whatever order the server listed them in', () => {
    const shuffled: CodeDelivery[] = [ALL_SENT[2], ALL_SENT[1], ALL_SENT[0]];
    expect(describeCodeDelivery(shuffled, EN)).toBe(describeCodeDelivery(ALL_SENT, EN));
  });

  test('a failed or skipped channel is never claimed', () => {
    const partial: CodeDelivery[] = [
      { channel: 'whatsapp', to: PHONE, status: 'failed' },
      { channel: 'sms', to: PHONE, status: 'sent' },
      { channel: 'email', to: MAIL, status: 'skipped' },
    ];
    expect(describeCodeDelivery(partial, EN)).toBe('Code sent by SMS to +60 ••••• 6789');
  });

  test('a single email destination (the new-email step)', () => {
    expect(
      describeCodeDelivery([{ channel: 'email', to: 'n••••@example.com', status: 'sent' }], EN),
    ).toBe('Code sent by email to n••••@example.com');
  });

  test('says so when every attempt was only written to the server log', () => {
    const logged = ALL_SENT.map((d) => ({ ...d, status: 'logged' as const }));
    expect(describeCodeDelivery(logged, EN)).toBe(
      `Code sent by WhatsApp and SMS to ${PHONE} and by email to ${MAIL}\n${EN.sentLoggedOnly}`,
    );
  });

  test('no log note once any channel really delivered', () => {
    const mixed: CodeDelivery[] = [
      { channel: 'whatsapp', to: PHONE, status: 'sent' },
      { channel: 'sms', to: PHONE, status: 'logged' },
    ];
    expect(describeCodeDelivery(mixed, EN)).toBe('Code sent by WhatsApp and SMS to +60 ••••• 6789');
  });

  test('nothing delivered reads as not delivered, not as sent', () => {
    expect(describeCodeDelivery([], EN)).toBe(EN.sentNowhere);
    expect(describeCodeDelivery(null, ZH)).toBe(ZH.sentNowhere);
    expect(
      describeCodeDelivery([{ channel: 'email', to: MAIL, status: 'failed' }], ZH_HANT),
    ).toBe(ZH_HANT.sentNowhere);
  });
});

describe('codeReachedSomewhere', () => {
  test('agrees with the sentence: sent or logged counts, failed or skipped does not', () => {
    expect(codeReachedSomewhere(ALL_SENT)).toBe(true);
    expect(codeReachedSomewhere([{ channel: 'sms', to: PHONE, status: 'logged' }])).toBe(true);
    expect(
      codeReachedSomewhere([
        { channel: 'whatsapp', to: PHONE, status: 'failed' },
        { channel: 'email', to: MAIL, status: 'skipped' },
      ]),
    ).toBe(false);
    expect(codeReachedSomewhere([])).toBe(false);
    expect(codeReachedSomewhere(null)).toBe(false);
  });
});

describe('retryAfterSeconds', () => {
  test('reads the envelope data first', () => {
    expect(retryAfterSeconds({ message: 'x', data: { retryAfterSec: 42 } })).toBe(42);
    expect(retryAfterSeconds({ data: { retryAfterSec: '30' } })).toBe(30);
    expect(retryAfterSeconds({ data: { retryAfterSec: 12.2 } })).toBe(13);
  });

  test('falls back to the message', () => {
    expect(
      retryAfterSeconds({ message: 'Wait 17s before requesting another code', data: null }),
    ).toBe(17);
  });

  test('null when there is no wait to read', () => {
    expect(retryAfterSeconds(null)).toBeNull();
    expect(retryAfterSeconds('Wait 5s')).toBeNull();
    expect(retryAfterSeconds({ message: 'Invalid code', data: null })).toBeNull();
    expect(retryAfterSeconds({ data: { retryAfterSec: 0 } })).toBeNull();
    expect(retryAfterSeconds({ data: { retryAfterSec: 'soon' } })).toBeNull();
  });
});

describe('small helpers', () => {
  test('minutesFromSeconds never says 0', () => {
    expect(minutesFromSeconds(600)).toBe(10);
    expect(minutesFromSeconds(300)).toBe(5);
    expect(minutesFromSeconds(30)).toBe(1);
    expect(minutesFromSeconds(0)).toBe(1);
    expect(minutesFromSeconds(undefined)).toBe(1);
  });

  test('normalizeEmailInput trims and lowercases, as the server stores it', () => {
    expect(normalizeEmailInput('  Olivia@Atlas-Agency.MY ')).toBe('olivia@atlas-agency.my');
  });

  test('isPlausibleEmail', () => {
    expect(isPlausibleEmail('olivia@atlas-agency.my')).toBe(true);
    expect(isPlausibleEmail('olivia@atlas')).toBe(false);
    expect(isPlausibleEmail('olivia atlas@x.my')).toBe(false);
    expect(isPlausibleEmail(`${'a'.repeat(250)}@x.my`)).toBe(false);
  });

  test('isCompleteCode accepts exactly six digits', () => {
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('1234567')).toBe(false);
    expect(isCompleteCode('12345a')).toBe(false);
  });
});
