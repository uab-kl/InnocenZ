/**
 * Probe Brevo SMTP via features/mailing (semutz-style).
 *
 *   cd apps/backend
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-send-email.ts
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-send-email.ts you@example.com
 */
import '@/load-env.js';
import {
  emailConfigured,
  sendProbeEmail,
} from '@/features/mailing/mailing.repository.js';
import { env } from '@/env.js';

async function main() {
  const to = process.argv[2]?.trim() || env.ADMIN_EMAIL || env.SENDER_EMAIL;
  console.log('emailConfigured:', emailConfigured());
  console.log('host:', env.BREVO_SMTP_HOST);
  console.log('user:', env.BREVO_SMTP_USER);
  console.log('from:', env.SENDER_EMAIL);
  console.log('to:', to);
  if (!to) {
    console.error('Pass a recipient: npx tsx … _probe-send-email.ts you@example.com');
    process.exit(1);
  }

  const result = await sendProbeEmail({ recipientEmail: to });
  console.log('ok', result);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
