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
import { initAdmin } from './scripts/init-admin';
import { initRoles } from './scripts/init-roles';
import { seedRbac } from './scripts/seed-rbac';
import { ensureProfileImageDir } from './util/profile-image';
import { registerAllAuditOldDataFetchers } from './features/audit-log/audit-log.wrapper';

ensureProfileImageDir();
registerAllAuditOldDataFetchers();

const app = express();

const frontendOrigin = env.FRONTEND_URL.replace(/\/en\/?$/, '').replace(/\/$/, '');

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowedOrigins = new Set([
      frontendOrigin,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://innocenz.duckdns.org',
      'https://studio.apollographql.com',
    ]);

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

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200,
};

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
app.use(express.json({ limit: '12mb' }));
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
  })();
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});