import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '@/env';
import { clientBudgetKey, rateLimit } from '@/middlewares/rate-limit';
import { answerLandingChat, parseLandingChatInput, type LandingChatInput } from './landing-chat.service';

/**
 * PUBLIC on purpose — the landing page has no session. Mounted in v1.ts ABOVE the
 * audit middleware: it changes no data, and auditing it would store every
 * visitor's question plus the facts. Whatever is refused here, the website
 * shows its written answer instead, so a refusal never breaks the chat.
 *
 * The order matters (review, 1 Oct 2026):
 *  1. JSON from an allowed origin only. A form-encoded or text/plain POST is a
 *     "simple" request a stranger's web page can fire from its visitors'
 *     browsers with no CORS preflight; express.urlencoded would even parse it
 *     into a valid question. Requiring application/json forces the preflight,
 *     which CORS refuses for other sites.
 *  2. Per-visitor budgets: a burst and a day.
 *  3. A valid body and a configured key.
 *  4. ONLY THEN the site-wide daily budget, so a bad request or a server with
 *     no key never spends what real visitors need.
 */

const FAIL = { success: false, message: 'The assistant could not answer right now.', data: null };

const allowedOrigins = new Set(
  [env.FRONTEND_URL, ...(env.CORS_ALLOWED_ORIGINS ?? '').split(',')]
    .map((o) => o?.trim())
    .filter(Boolean)
    .map((o) => {
      try {
        return new URL(o as string).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean),
);

function jsonFromOurSite(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json')) {
    res.status(415).json({ ...FAIL, message: 'Send the question as JSON.' });
    return;
  }
  const origin = req.get('origin');
  // No Origin = a server-side caller (curl, tests); browsers always send one on
  // a cross-site POST, and those must be ours.
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json(FAIL);
    return;
  }
  next();
}

const burstLimiter = rateLimit({
  name: 'landing-chat-burst',
  windowMs: 10 * 60 * 1000,
  // Every message and every button tap is one call, so a real conversation
  // needs room: 30 per 10 minutes is a brisk chat, not a script.
  max: 30,
  keys: (req) => [clientBudgetKey(req)],
  message: 'Too many questions in a short time. Please wait a few minutes.',
});

const dailyLimiter = rateLimit({
  name: 'landing-chat-day',
  windowMs: 24 * 60 * 60 * 1000,
  max: 100,
  keys: (req) => [clientBudgetKey(req)],
  message: 'Daily question limit reached. Please message us on WhatsApp.',
});

function validInput(req: Request, res: Response, next: NextFunction): void {
  // Turned off on purpose (LANDING_CHAT_DAILY_LIMIT=0) or no key: the same 503,
  // and nothing is counted.
  if (env.LANDING_CHAT_DAILY_LIMIT === 0 || !env.GEMINI_API_KEY) {
    res.status(503).json(FAIL);
    return;
  }
  const input = parseLandingChatInput(req.body);
  if (!input) {
    res.status(400).json({ ...FAIL, message: 'A question and a language are required.' });
    return;
  }
  res.locals.chatInput = input;
  next();
}

const platformDailyLimiter = rateLimit({
  name: 'landing-chat-platform-day',
  windowMs: 24 * 60 * 60 * 1000,
  // Raise LANDING_CHAT_DAILY_LIMIT once the key's project is on a paid tier.
  // ⚠️ In memory: it restarts with the server and is per instance.
  max: env.LANDING_CHAT_DAILY_LIMIT,
  keys: () => ['all'],
  message: 'The assistant is resting for today. Please message us on WhatsApp.',
});

const router = Router();

router.post(
  '',
  jsonFromOurSite,
  burstLimiter,
  dailyLimiter,
  validInput,
  platformDailyLimiter,
  async (_req: Request, res: Response) => {
    const outcome = await answerLandingChat(res.locals.chatInput as LandingChatInput);
    if (outcome.ok) {
      res.json({ success: true, message: 'OK', data: { reply: outcome.reply } });
      return;
    }
    res.status(outcome.reason === 'not_configured' ? 503 : 502).json(FAIL);
  },
);

export default router;
