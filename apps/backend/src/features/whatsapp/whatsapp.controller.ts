import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { logger } from '@/util/logger.js';

/**
 * Meta WhatsApp Cloud API webhooks.
 *
 * Dashboard → WhatsApp → Configuration → Webhooks:
 *   Callback URL  = https://<public-host>/api/v1/webhooks/whatsapp
 *   Verify Token  = META_WHATSAPP_VERIFY_TOKEN (same string you type in Meta)
 *
 * Meta cannot reach localhost — use a tunnel (ngrok / Cloudflare) or a
 * deployed backend for Verify and save.
 */
export class WhatsAppWebhookControllerClass {
  /**
   * Subscription handshake. Meta GETs with hub.mode, hub.verify_token,
   * hub.challenge — answer with the challenge as plain text when the token matches.
   */
  verify(req: Request, res: Response) {
    const mode = String(req.query['hub.mode'] ?? '');
    const token = String(req.query['hub.verify_token'] ?? '');
    const challenge = String(req.query['hub.challenge'] ?? '');
    const expected = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() ?? '';

    if (!expected) {
      logger.warn('[WhatsAppWebhook.verify] META_WHATSAPP_VERIFY_TOKEN is not set');
      return res.status(500).send('Verify token not configured');
    }

    if (mode === 'subscribe' && token === expected && challenge) {
      logger.info('[WhatsAppWebhook.verify] Subscription verified');
      return res.status(200).type('text/plain').send(challenge);
    }

    logger.warn('[WhatsAppWebhook.verify] Rejected', { mode, tokenMatch: token === expected });
    return res.status(403).send('Forbidden');
  }

  /**
   * Inbound events (message status, optional inbound messages). Always 200
   * quickly so Meta does not retry-storm; signature checked when app secret is set.
   */
  receive(req: Request, res: Response) {
    if (!this.signatureOk(req)) {
      logger.warn('[WhatsAppWebhook.receive] Bad X-Hub-Signature-256');
      return res.status(401).send('Invalid signature');
    }

    // Acknowledge first — processing is best-effort logging for OTP delivery status.
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body as {
        object?: string;
        entry?: Array<{
          changes?: Array<{
            value?: {
              statuses?: Array<{ id?: string; status?: string; recipient_id?: string }>;
              messages?: Array<{ from?: string; type?: string; text?: { body?: string } }>;
            };
          }>;
        }>;
      };

      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          for (const st of value?.statuses ?? []) {
            logger.info('[WhatsAppWebhook] status', {
              messageId: st.id,
              status: st.status,
              to: st.recipient_id,
            });
          }
          for (const msg of value?.messages ?? []) {
            // PR verification is app-entered OTP, not reply-parsing — log only.
            logger.info('[WhatsAppWebhook] inbound', {
              from: msg.from,
              type: msg.type,
            });
          }
        }
      }
    } catch (error) {
      logger.error('[WhatsAppWebhook.receive] Error parsing body', error);
    }
  }

  private signatureOk(req: Request): boolean {
    const secret = process.env.META_WHATSAPP_APP_SECRET?.trim();
    /**
     * NO SECRET IS A REFUSAL, NOT A PASS.
     *
     * This read `return true`d when the secret was unset — "optional until the
     * Meta app secret is pasted in" — which made a PUBLIC, unauthenticated
     * endpoint accept any body anyone posted to it, on any deployment where the
     * variable was missing or misspelt. The sibling this webhook was the model
     * for got the opposite treatment: the payment webhook answers 503 when it
     * cannot verify a delivery, precisely so it never acts on bytes it cannot
     * trust. Fail-closed is the only safe direction for a signature check — an
     * unconfigured webhook that rejects is visible in minutes, one that accepts
     * is invisible until it is abused.
     *
     * Development keeps the old convenience deliberately and loudly: nothing on
     * a developer machine has a Meta secret, and the alternative is that the
     * inbound path cannot be tested at all.
     */
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error(
          '[WhatsAppWebhook] META_WHATSAPP_APP_SECRET is unset — refusing unverifiable delivery',
        );
        return false;
      }
      logger.warn('[WhatsAppWebhook] no app secret set; accepting unverified delivery (dev only)');
      return true;
    }

    const header = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature?.startsWith('sha256=')) return false;

    /**
     * The RAW bytes or nothing. Falling back to a re-serialised body meant
     * checking a signature against JSON Meta never sent — key order and
     * whitespace both move through parse/stringify — so a genuine delivery
     * would fail and whoever debugged it would be tempted to drop the check.
     * `main.ts` captures the raw body for this exact path.
     */
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      logger.error('[WhatsAppWebhook] raw body missing; cannot verify signature');
      return false;
    }
    const payload = raw;
    const expected =
      'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
