import './load-env';

import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';

import { typeDefs, resolvers } from '@/graphql';
import { createContext, GraphQLContext } from '@/graphql/context';
import { auditLogPlugin } from '@/graphql/audit.plugin';
import { applyDirectives } from '@/graphql/directives';
import v1Router from '@/router/v1.js';
import { requestLoggerMiddleware } from './middlewares/request-logger';
import { platformAuditMiddleware } from './middlewares/platform-audit';
import { env } from './env';
import { logger } from './util/logger';
import { scheduler } from './scheduler/scheduler';
import { registerJobs } from './scheduler/jobs';
import { initAdmin } from './scripts/init-admin';
import { initRoles } from './scripts/init-roles';
import { primeUserFolders } from '@/util/user-folder';
import { seedRbac } from './scripts/seed-rbac';
import { ensureProfileImageDir } from './util/profile-image';
import { registerAllAuditOldDataFetchers } from './features/audit-log/audit-log.wrapper';

ensureProfileImageDir();
registerAllAuditOldDataFetchers();

const app = express();

const frontendOrigin = env.FRONTEND_URL.replace(/\/en\/?$/, '').replace(/\/$/, '');

function buildAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    frontendOrigin,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://studio.apollographql.com',
  ]);

  // Staging (DuckDNS) + live (.net) — apex and www
  for (const host of ['innocenz.duckdns.org', 'innocenz.net']) {
    origins.add(`https://${host}`);
    origins.add(`https://www.${host}`);
  }

  for (const raw of (env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
    const o = raw.trim().replace(/\/$/, '');
    if (o) origins.add(o);
  }
  return origins;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    if (
      env.NODE_ENV === 'development' &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      callback(null, true);
      return;
    }

    logger.warn(`[cors] blocked origin: ${origin}`);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  /**
   * ⚠️ A header the browser sends must be named HERE or the request never
   * happens at all: the preflight refuses it, and the browser reports a CORS
   * failure rather than anything about the header. Adding x-org-id to the
   * client without this line broke EVERY authenticated call, /auth/me
   * included — not just the requests that carry a chosen organisation.
   */
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    /** Which organisation this session is working in — see org-scope.ts. */
    'x-org-id',
  ],
  optionsSuccessStatus: 200,
};

/**
 * Trust the reverse proxy ONLY when a deployment says to. Unset = Express's
 * default (trust nothing), so this is a no-op locally and in any environment
 * that has not opted in.
 *
 * Without it, behind a proxy every request reports the proxy's address and the
 * auth rate limiter would count the whole platform as one caller. With it set
 * too broadly (`true`), a client can forge `X-Forwarded-For` and mint a fresh
 * rate-limit bucket per request — which is why the narrow forms are documented
 * first in env.ts.
 */
if (env.TRUST_PROXY) {
  const raw = env.TRUST_PROXY.trim();
  const hops = Number(raw);
  const setting: boolean | number | string =
    raw === 'true' ? true : Number.isInteger(hops) && raw !== '' ? hops : raw;
  app.set('trust proxy', setting);
  logger.info(`[startup] trust proxy = ${String(setting)}`);
}

app.use(cors(corsOptions));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://apollo-server-landing-page.cdn.apollographql.com',
          'https://embeddable-sandbox.cdn.apollographql.com',
          'https://cdn.jsdelivr.net',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://apollo-server-landing-page.cdn.apollographql.com',
          'https://cdn.jsdelivr.net',
        ],
        imgSrc: ["'self'", 'data:', 'https://apollo-server-landing-page.cdn.apollographql.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: [
          "'self'",
          'https://sandbox.embed.apollographql.com',
          'https://explorer.embed.apollographql.com',
        ],
        connectSrc: ["'self'", 'https://*.apollographql.com'],
      },
    },
    // Allow the web app (different origin/port) to display /img/* assets.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(requestLoggerMiddleware);
app.use('/img', express.static(path.join(process.cwd(), 'public', 'img')));
// Self-log proof photos ride in the JSON body as base64 data URLs (up to 6 ×
// ~1.5 MB per the payment-voucher schema), so the default 100 kb limit is far
// too small — raise it enough to hold a full proof set.
app.use(express.json({
  limit: '12mb',
  verify: (req, _res, buf) => {
    // Meta signs webhook POSTs with X-Hub-Signature-256 over the raw body.
    //
    // `verify` hands back a bare http.IncomingMessage, not an express.Request —
    // `originalUrl` is added by express's own router and is genuinely absent
    // here, which is why reading it directly failed to compile. `url` carries
    // the same path at this point in the stack (nothing has mounted or stripped
    // a prefix yet); the cast keeps `originalUrl` as the preferred read for the
    // day this runs behind a mount that does rewrite it.
    const target =
      (req as express.Request).originalUrl ?? (req as { url?: string }).url ?? '';
    // Payment gateways sign the exact bytes they sent, so the parsed body is
    // useless for verification: JSON.parse followed by JSON.stringify does not
    // reproduce key order or whitespace, and every genuine delivery would fail
    // the check. Same reason Meta's webhook is captured here.
    if (
      target.includes('/webhooks/whatsapp') ||
      target.includes('/subscription-payment/webhook/')
    ) {
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(platformAuditMiddleware);

app.use('/api/v1', v1Router);

// Prefer a platform-injected PORT (container/cloud); otherwise the shared
// BACKEND_PORT convention (defaults to 7777) that the web app targets.
const PORT = env.PORT ?? env.BACKEND_PORT;
const MIGRATE_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function cleanCliOutput(value?: string): string | undefined {
  if (!value) return undefined;
  let s = value.replace(/\r/g, '\n');
  s = s
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '');
  s = s
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
  return s.length ? s : undefined;
}

async function runMigrations(): Promise<void> {
  const drizzleKit = path.join(process.cwd(), 'node_modules', 'drizzle-kit', 'bin.cjs');

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [drizzleKit, 'migrate', '--config', 'drizzle.migrate.config.ts'],
        {
          env: { ...process.env, CI: 'true' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
        if (stdout.length > MIGRATE_MAX_BUFFER_BYTES) {
          stdout = stdout.slice(-MIGRATE_MAX_BUFFER_BYTES);
        }
      });

      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
        if (stderr.length > MIGRATE_MAX_BUFFER_BYTES) {
          stderr = stderr.slice(-MIGRATE_MAX_BUFFER_BYTES);
        }
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const error = new Error(`Migration command failed with exit code ${code}`) as Error & {
          stdout?: string;
          stderr?: string;
        };
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });
    });
    logger.info('Migrations completed successfully');
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    logger.warn('Migrations did not complete cleanly', {
      message: e.message,
      stdout: cleanCliOutput(e.stdout),
      stderr: cleanCliOutput(e.stderr),
    });
  }
}

async function startApolloServer(): Promise<void> {
  let schema = makeExecutableSchema({ typeDefs, resolvers });
  schema = applyDirectives(schema);

  const apolloServer = new ApolloServer<GraphQLContext>({
    schema,
    introspection: true,
    plugins: [
      auditLogPlugin(),
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
    ],
    formatError: (formattedError) => {
      logger.error('[GraphQL Error]', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path,
      });

      return {
        message: formattedError.message,
        extensions: {
          code: formattedError.extensions?.code,
        },
      };
    },
  });

  await apolloServer.start();
  logger.info('Apollo Server started');

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(corsOptions),
    express.json(),
    expressMiddleware(apolloServer, {
      context: createContext,
    }),
  );

  logger.info('GraphQL endpoint available at /graphql');
}

async function bootstrap(): Promise<void> {
  await startApolloServer();

  const server = http.createServer(app);

  server.listen(Number(PORT), () => {
    logger.info(`Server is listening on port ${PORT}...`);
  });

  // Background jobs start with the server. registerJobs() is the only place that
  // names them, so what runs in the background is one file to read.
  registerJobs();
  scheduler.start();

  void (async () => {
    if (env.NODE_ENV === 'production') {
      logger.info('Running migrations...');
      await runMigrations();
    }

    try {
      await initRoles();
      await seedRbac();
      await initAdmin();
    } catch (error) {
      logger.error('Failed to initialize seed data', error);
    }

    // Warm the id -> R2 folder map (`user/pr/vicky-93ea08b0/`). OUTSIDE the try
    // above on purpose: a seeding failure must not leave every upload writing
    // raw-uuid folders. primeUserFolders swallows its own errors.
    await primeUserFolders();
  })();
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});