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
    if (!secret) return true; // optional until the Meta app secret is pasted in

    const header = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature?.startsWith('sha256=')) return false;

    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const payload = raw ?? Buffer.from(JSON.stringify(req.body ?? {}));
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
