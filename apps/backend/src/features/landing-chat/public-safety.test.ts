import { describe, expect, it } from 'vitest';
import { LANDING_CHAT_FACTS } from './landing-chat-facts.generated';
import { describeFindings, scanPublicText, scanReplyText, type SafetyRule } from './public-safety';

const rules = (text: string) => scanPublicText(text).map((f) => f.rule);

describe('scanPublicText — what may never reach the public chat', () => {
  const canaries: Array<[SafetyRule, string]> = [
    ['email', 'Write to ops.team@example.com for help.'],
    ['ic-number', 'Her IC900101-14-5678 is on file.'],
    ['ic-number', 'IC 900101145678 was used.'],
    ['phone-number', 'WhatsApp +60 12-345 6789 any time.'],
    ['phone-number', 'Call 0123456789 now.'],
    ['passport-number', 'Passport A12345678 expires soon.'],
    ['uuid', 'Row 3f2b1c4d-1a2b-4c3d-9e8f-0a1b2c3d4e5f was edited.'],
    ['ip-address', 'The server is 10.0.0.12.'],
    ['url', 'See https://docs.example.com/guide for more.'],
    ['env-name', 'Set GEMINI_API_KEY first.'],
    ['code-identifier', 'It reads payment_voucher rows.'],
    ['file-path', 'Edit landing-chat.service.ts to change it.'],
    ['demo-name', 'Velvet 23 posted a job.'],
    ['internal-note', 'TODO: fix the leak.'],
    ['internal-note', 'See TEST_SCRIPT §9 for the bug.'],
    // review, 5 Oct 2026 — shapes the first version missed
    ['phone-number', 'Office 03-1234 5678.'],
    ['phone-number', 'Text 012.345.6789 later.'],
    ['phone-number', 'Ring (012) 345 6789.'],
    ['phone-number', 'Call 012–345 6789.'],
    ['phone-number', 'Call ０１２-３４５ ６７８９.'],
    ['phone-number', 'Singapore +65 9123 4567.'],
    ['long-number', 'Account 1234567890123 at the bank.'],
    ['url', 'Go to www.example.com for it.'],
    ['url', 'See example.com/help.'],
  ];

  it.each(canaries)('catches %s', (rule, text) => {
    expect(rules(text)).toContain(rule);
  });

  it('leaves product words and the site’s own address alone', () => {
    const ordinary =
      'A PR checks in within 50 m of the venue with GPS. The agency pays RM 1,500 by bank transfer. ' +
      'Upload your IC photos on “Profile”. Forgot your password? Sign up at https://innocenz.net.';
    expect(scanPublicText(ordinary)).toEqual([]);
    for (const link of ['访问 https://innocenz.net。', 'https://innocenz.net，然后', 'https://www.innocenz.net:443/x?y=1']) {
      expect(scanReplyText(link)).toEqual([]);
    }
  });

  it('reports one number once, under its most specific rule', () => {
    expect(describeFindings(scanReplyText('Call 012-345 6789.'))).toBe('phone-number×1');
  });

  it('names the rule and count, never the value it caught', () => {
    const findings = scanPublicText('Call 0123456789 or 0198765432, email a@b.co');
    const summary = describeFindings(findings);
    expect(summary).toBe('phone-number×2, email×1');
    expect(summary).not.toMatch(/\d{6}|a@b/);
  });

  it('checks a model reply for values and links only — a capitalised word the visitor typed is fine', () => {
    expect(scanReplyText('Your GEMINI_API_KEY question: see Settings.')).toEqual([]);
    expect(scanReplyText('Call 012-345 6789.').map((f) => f.rule)).toEqual(['phone-number']);
  });
});

describe('the generated facts (pnpm chat:facts)', () => {
  const sheets = Object.entries(LANDING_CHAT_FACTS).flatMap(([locale, byRole]) =>
    Object.entries(byRole).map(([role, text]) => [`${locale}/${role}`, text as string] as const),
  );

  it('has all ten sheets', () => {
    expect(sheets).toHaveLength(10);
  });

  it.each(sheets)('%s is clean', (_name, text) => {
    expect(describeFindings(scanPublicText(text))).toBe('');
  });

  it('carries the system sections built from the code — menus, team permissions, records, what is new', () => {
    const en = LANDING_CHAT_FACTS.en.none;
    const zh = LANDING_CHAT_FACTS.zh.none;
    for (const title of [
      "## The InnocenZ app's tabs (for PRs)",
      "## The agency portal's menu (for PR agencies)",
      "## The outlet portal's menu (for outlets)",
      '## Who can do what in an agency team (for PR agencies)',
      '## Who can do what in an outlet team (for outlets)',
      '## What InnocenZ keeps for everyone (for everyone)',
      "## What's new on InnocenZ (for everyone)",
    ]) {
      expect(en).toContain(title);
    }
    expect(zh).toContain('## 场所团队里谁能做什么 (适用于场所 (Outlet))');
  });
});
