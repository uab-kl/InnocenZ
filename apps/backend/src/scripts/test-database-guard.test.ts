import { describe, expect, it } from 'vitest';
import { looksLikeTestDatabase, TEST_DB_ACK_FLAG, testDatabaseRefusal } from './test-database-guard';

describe('looksLikeTestDatabase', () => {
  it.each([['innocenz-test'], ['innocenz_test'], ['test-innocenz'], ['INNOCENZ-TEST'], ['test']])(
    '%s is a test database',
    (name) => {
      expect(looksLikeTestDatabase(name)).toBe(true);
    },
  );

  it.each([['innocenz'], ['innocenz-prod'], ['contest'], ['innocenztest'], ['testing-lab'], [''], [null]])(
    '%s is NOT (the token must be exactly "test")',
    (name) => {
      expect(looksLikeTestDatabase(name)).toBe(false);
    },
  );
});

describe('testDatabaseRefusal', () => {
  it('runs only with the acknowledgement flag AND a test database', () => {
    expect(testDatabaseRefusal({ argv: ['--apply', TEST_DB_ACK_FLAG], databaseName: 'innocenz-test' })).toBeNull();
  });

  it('refuses without the flag, even on a test database', () => {
    expect(testDatabaseRefusal({ argv: ['--apply'], databaseName: 'innocenz-test' })).toMatch(
      TEST_DB_ACK_FLAG,
    );
  });

  it('refuses with the flag on a database that is not a test one', () => {
    expect(testDatabaseRefusal({ argv: [TEST_DB_ACK_FLAG], databaseName: 'innocenz' })).toMatch(
      /does not look like a test database/,
    );
  });

  it('refuses when the database name is unknown', () => {
    expect(testDatabaseRefusal({ argv: [TEST_DB_ACK_FLAG], databaseName: undefined })).toMatch(
      /POSTGRES_DB is not set/,
    );
    expect(testDatabaseRefusal({ argv: [TEST_DB_ACK_FLAG], databaseName: '  ' })).toMatch(
      /POSTGRES_DB is not set/,
    );
  });
});
