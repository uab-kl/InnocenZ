import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('Database URL not initialized');
}

export default defineConfig({
  schema: [
    './src/db/db.schema.ts',
    './src/features/**/*.model.ts',
  ],
  out: './postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
