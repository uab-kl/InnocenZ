#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(fs.readFileSync(path.join(__dirname, "meta/_journal.json"), "utf8"));
const tags = journal.entries.map((e) => e.tag);

const created = new Map();
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  for (const m of sql.matchAll(
    /CREATE\s+(?:TEMPORARY\s+|TEMP\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/gi,
  )) {
    const t = m[1];
    if (!created.has(t)) created.set(t, { tag, temp: /TEMPORARY|TEMP\s+TABLE/i.test(m[0]) });
  }
  // table renames
  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+TO\s+"?([a-zA-Z0-9_]+)"?/gi,
  )) {
    const from = m[1],
      to = m[2];
    if (created.has(from)) {
      created.set(to, created.get(from));
      // keep from as historical
    } else {
      created.set(to, { tag, temp: false, viaRename: from });
    }
  }
}

console.log("=== Tables never CREATE'd but ALTER/DROP/INDEX'd ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  const refs = new Set();
  for (const m of sql.matchAll(
    /(?:ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^\s]+\s+ON)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/gi,
  )) {
    refs.add(m[1]);
  }
  for (const t of refs) {
    if (["EXISTS", "NOT", "IF", "ONLY"].includes(t.toUpperCase())) continue;
    if (!created.has(t)) {
      console.log(`${tag}: references ${t} — never CREATE TABLE`);
    } else {
      const c = created.get(t);
      const cidx = tags.indexOf(c.tag);
      const aidx = tags.indexOf(tag);
      if (cidx > aidx) {
        console.log(`${tag}: references ${t} — CREATE is later at ${c.tag}`);
      }
    }
  }
}

console.log("\n=== Bare CREATE TYPE (no DO/EXCEPTION) that may duplicate ===");
const typeCreated = new Map();
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  // bare CREATE TYPE not inside obvious exception — approximate: line-level
  for (const m of sql.matchAll(/CREATE\s+TYPE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/gi)) {
    const name = m[1];
    const start = Math.max(0, m.index - 80);
    const ctx = sql.slice(start, m.index);
    const inException = /EXCEPTION/i.test(ctx) || /BEGIN\s*$/i.test(ctx.trim()) || /DO\s+\$\$/i.test(sql.slice(Math.max(0, m.index - 200), m.index));
    if (typeCreated.has(name)) {
      console.log(
        `${tag}: CREATE TYPE ${name} again (first: ${typeCreated.get(name).tag}, guarded=${inException})`,
      );
    } else {
      typeCreated.set(name, { tag, guarded: inException });
    }
  }
}

console.log("\n=== RENAME COLUMN statements ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  for (const m of sql.matchAll(
    /RENAME\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+TO\s+"?([a-zA-Z0-9_]+)"?/gi,
  )) {
    console.log(`${tag}: ${m[1]} -> ${m[2]}`);
  }
}

console.log("\n=== CREATE INDEX without IF NOT EXISTS ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  for (const m of sql.matchAll(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)(?:"?([a-zA-Z0-9_]+)"?)/gi,
  )) {
    console.log(`${tag}: CREATE INDEX ${m[2]}`);
  }
}

console.log("\n=== ADD CONSTRAINT (bare, not in DO) ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  // find ADD CONSTRAINT outside of DO blocks roughly
  const parts = sql.split(/DO\s+\$\$/i);
  // first part is outside first DO
  const outside = [parts[0]];
  // after each DO, skip until $$;
  let rest = sql;
  // simpler: all ADD CONSTRAINT
  for (const m of sql.matchAll(/ADD\s+CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?/gi)) {
    const before = sql.slice(Math.max(0, m.index - 250), m.index);
    const guarded = /pg_constraint|IF\s+NOT\s+EXISTS/i.test(before);
    console.log(`${tag}: ${m[1]} guarded=${guarded}`);
  }
}

console.log("\n=== DROP CONSTRAINT without IF EXISTS ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  for (const m of sql.matchAll(
    /DROP\s+CONSTRAINT\s+(?!IF\s+EXISTS)(?:"?([a-zA-Z0-9_]+)"?)/gi,
  )) {
    console.log(`${tag}: DROP CONSTRAINT ${m[1]}`);
  }
}

console.log("\n=== DROP TYPE without IF EXISTS ===");
for (const tag of tags) {
  const sql = fs.readFileSync(path.join(__dirname, `${tag}.sql`), "utf8");
  for (const m of sql.matchAll(/DROP\s+TYPE\s+(?!IF\s+EXISTS)(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/gi)) {
    console.log(`${tag}: DROP TYPE ${m[1]}`);
  }
}
