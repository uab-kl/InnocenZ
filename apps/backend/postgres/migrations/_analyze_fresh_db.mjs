#!/usr/bin/env node
/**
 * Simulate migration schema state on empty DB; flag likely hard failures.
 * Heuristic — not a full SQL parser. Focus: missing tables/types/columns for ALTER/DROP/RENAME/INDEX.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(fs.readFileSync(path.join(__dirname, "meta/_journal.json"), "utf8"));

/** @typedef {{cols: Set<string>, indexes: Set<string>, constraints: Set<string>}} TableState */

/** @type {Map<string, TableState>} */
const tables = new Map();
/** @type {Set<string>} */
const types = new Set();
/** @type {Set<string>} */
const globalIndexes = new Set(); // index names are global in PG
/** @type {Array<{tag:string, stmt:string, why:string, severity:string}>} */
const failures = [];

function q(name) {
  return String(name).replace(/"/g, "").trim();
}

function ensureTable(name) {
  const n = q(name);
  if (!tables.has(n)) tables.set(n, { cols: new Set(), indexes: new Set(), constraints: new Set() });
  return tables.get(n);
}

function tableExists(name) {
  return tables.has(q(name));
}

function addFail(tag, stmt, why, severity = "FAIL") {
  failures.push({ tag, stmt: stmt.trim().replace(/\s+/g, " ").slice(0, 220), why, severity });
}

function stripComments(sql) {
  // remove /* */ and -- comments carefully
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, "\n");
  s = s
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      if (i >= 0) {
        // keep --> statement-breakpoint as separator only if whole token
        if (line.slice(i).startsWith("-->")) return line.slice(0, i);
        return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
  return s;
}

function splitStatements(sql) {
  const cleaned = stripComments(sql).replace(/-->\s*statement-breakpoint/gi, ";");
  // naive split on ; outside of quotes — good enough for migrations
  const stmts = [];
  let cur = "";
  let inSingle = false;
  let inDouble = false;
  let dollar = null;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (dollar) {
      if (cleaned.startsWith(dollar, i)) {
        cur += dollar;
        i += dollar.length - 1;
        dollar = null;
        continue;
      }
      cur += c;
      continue;
    }
    if (!inSingle && !inDouble && c === "$") {
      const m = cleaned.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollar = m[0];
        cur += dollar;
        i += dollar.length - 1;
        continue;
      }
    }
    if (!inDouble && c === "'" && cleaned[i - 1] !== "\\") {
      inSingle = !inSingle;
      cur += c;
      continue;
    }
    if (!inSingle && c === '"') {
      inDouble = !inDouble;
      cur += c;
      continue;
    }
    if (!inSingle && !inDouble && c === ";") {
      if (cur.trim()) stmts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

function parseCreateTable(stmt) {
  const m = stmt.match(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (!m) return null;
  const ifNot = !!m[1];
  const name = q(m[2]);
  // extract column defs between first ( and matching )
  const start = stmt.indexOf("(");
  const end = stmt.lastIndexOf(")");
  const cols = new Set();
  if (start >= 0 && end > start) {
    const body = stmt.slice(start + 1, end);
    // split by commas at depth 0
    let depth = 0;
    let part = "";
    const parts = [];
    let inS = false,
      inD = false;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (!inD && c === "'" && body[i - 1] !== "\\") inS = !inS;
      else if (!inS && c === '"') inD = !inD;
      else if (!inS && !inD) {
        if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === "," && depth === 0) {
          parts.push(part.trim());
          part = "";
          continue;
        }
      }
      part += c;
    }
    if (part.trim()) parts.push(part.trim());
    for (const p of parts) {
      if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)/i.test(p)) continue;
      const cm = p.match(/^"?([a-zA-Z0-9_]+)"?/);
      if (cm) cols.add(q(cm[1]));
    }
  }
  return { name, ifNot, cols };
}

function processStmt(tag, stmt) {
  const s = stmt.replace(/\s+/g, " ").trim();
  if (!s || /^DO\s+\$\$/i.test(s) || /^BEGIN\b/i.test(s)) {
    // DO blocks — scan inner for RENAME/ALTER without IF
    if (/DO\s+\$\$/i.test(s) || /\$\$/.test(stmt)) {
      processDoBlock(tag, stmt);
    }
    return;
  }

  // CREATE SCHEMA
  if (/^CREATE\s+SCHEMA/i.test(s)) return;

  // CREATE EXTENSION
  if (/^CREATE\s+EXTENSION/i.test(s)) return;

  // CREATE TYPE
  {
    const m = s.match(/^CREATE\s+TYPE\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const name = q(m[2]);
      if (types.has(name) && !m[1]) {
        addFail(tag, s, `CREATE TYPE ${name} already exists (no IF NOT EXISTS)`);
      }
      types.add(name);
      return;
    }
  }

  // ALTER TYPE ... RENAME TO
  {
    const m = s.match(/^ALTER\s+TYPE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+TO\s+"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const from = q(m[1]);
      const to = q(m[2]);
      if (!types.has(from)) {
        addFail(tag, s, `ALTER TYPE RENAME: type ${from} was never CREATE'd`);
      } else {
        types.delete(from);
        types.add(to);
      }
      return;
    }
  }

  // ALTER TYPE ... ADD VALUE
  {
    const m = s.match(/^ALTER\s+TYPE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+VALUE/i);
    if (m) {
      const name = q(m[1]);
      if (!types.has(name)) {
        addFail(tag, s, `ALTER TYPE ADD VALUE: type ${name} was never CREATE'd`);
      }
      return;
    }
  }

  // DROP TYPE
  {
    const m = s.match(/^DROP\s+TYPE\s+(IF\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const name = q(m[2]);
      if (!types.has(name) && !m[1]) {
        addFail(tag, s, `DROP TYPE ${name}: type never existed (no IF EXISTS)`);
      }
      types.delete(name);
      return;
    }
  }

  // CREATE TABLE
  if (/^CREATE\s+TABLE/i.test(s)) {
    const parsed = parseCreateTable(stmt);
    if (parsed) {
      if (tables.has(parsed.name) && !parsed.ifNot) {
        addFail(tag, s, `CREATE TABLE ${parsed.name} already exists (no IF NOT EXISTS)`);
      }
      const t = ensureTable(parsed.name);
      for (const c of parsed.cols) t.cols.add(c);
      // also detect enum type refs in CREATE TABLE that don't exist
      const typeRefs = [...stmt.matchAll(/"main"\."([a-zA-Z0-9_]+)"/g)].map((x) => x[1]);
      // crude: also main.foo
      for (const tr of typeRefs) {
        // skip if it's the table being created or a known table used as FK target text only
        if (tr === parsed.name) continue;
        // if looks like enum usage: "main"."enumname" as column type
      }
      // Better: find column type patterns like "main"."xxx" after column name
      const enumUses = [...stmt.matchAll(/"?[a-zA-Z0-9_]+"?\s+"main"\."([a-zA-Z0-9_]+)"/gi)];
      for (const eu of enumUses) {
        const tn = q(eu[1]);
        if (!types.has(tn) && !tables.has(tn)) {
          // could be enum
          addFail(tag, s.slice(0, 120) + `... uses type ${tn}`, `CREATE TABLE references type/enum ${tn} which was never CREATE'd`, "FAIL");
        }
      }
    }
    return;
  }

  // DROP TABLE
  {
    const m = s.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const name = q(m[2]);
      if (!tableExists(name) && !m[1]) {
        addFail(tag, s, `DROP TABLE ${name}: table never existed`);
      }
      tables.delete(name);
      return;
    }
  }

  // ALTER TABLE ... RENAME TO (table rename)
  {
    const m = s.match(/^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+TO\s+"?([a-zA-Z0-9_]+)"?/i);
    if (m && !/RENAME\s+COLUMN/i.test(s)) {
      const from = q(m[2]);
      const to = q(m[3]);
      if (!tableExists(from)) {
        if (!m[1]) addFail(tag, s, `ALTER TABLE RENAME: table ${from} never CREATE'd`);
      } else {
        const st = tables.get(from);
        tables.delete(from);
        tables.set(to, st);
      }
      return;
    }
  }

  // ALTER TABLE — general
  {
    const m = s.match(/^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+(.*)$/i);
    if (m) {
      const ifExists = !!m[1];
      const tname = q(m[2]);
      const rest = m[3];

      if (!tableExists(tname)) {
        // IF NOT EXISTS on ADD COLUMN still fails if table missing
        // DROP COLUMN IF EXISTS also fails if table missing
        // Only ALTER TABLE IF EXISTS would soft-fail
        if (!ifExists) {
          addFail(tag, s, `ALTER TABLE ${tname}: table was never CREATE'd`);
        }
        return;
      }

      const t = tables.get(tname);

      // RENAME COLUMN
      {
        const rm = rest.match(/^RENAME\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+TO\s+"?([a-zA-Z0-9_]+)"?/i);
        if (rm) {
          const from = q(rm[1]);
          const to = q(rm[2]);
          if (!t.cols.has(from)) {
            addFail(tag, s, `RENAME COLUMN ${from}→${to}: column ${from} was never ADD'd on ${tname}`);
          } else {
            t.cols.delete(from);
            t.cols.add(to);
          }
          return;
        }
      }

      // Multiple actions: ADD COLUMN, DROP COLUMN, ADD CONSTRAINT, DROP CONSTRAINT, ALTER COLUMN, SET/DROP NOT NULL
      // Split on commas carefully for multi-add — for our purpose scan with regex globally

      // ADD COLUMN [IF NOT EXISTS] col
      for (const am of rest.matchAll(/ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)/gi)) {
        const ifNot = !!am[1];
        const col = q(am[2]);
        if (t.cols.has(col) && !ifNot) {
          addFail(tag, s, `ADD COLUMN ${col} on ${tname}: already exists (no IF NOT EXISTS)`);
        }
        // check enum type in same ADD — look at fragment after column name
        t.cols.add(col);
      }

      // Check ADD COLUMN using missing enum types
      for (const am of rest.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-zA-Z0-9_]+"?)\s+"main"\."([a-zA-Z0-9_]+)"/gi)) {
        const tn = q(am[1]);
        if (!types.has(tn)) {
          addFail(tag, s, `ADD COLUMN uses type ${tn} which was never CREATE'd`);
        }
      }
      for (const am of rest.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[a-zA-Z0-9_]+"?)\s+main\.([a-zA-Z0-9_]+)/gi)) {
        const tn = q(am[1]);
        if (!types.has(tn) && !tables.has(tn)) {
          addFail(tag, s, `ADD COLUMN uses type main.${tn} which was never CREATE'd`);
        }
      }

      // DROP COLUMN [IF EXISTS]
      for (const dm of rest.matchAll(/DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)/gi)) {
        const ifEx = !!dm[1];
        const col = q(dm[2]);
        if (!t.cols.has(col) && !ifEx) {
          addFail(tag, s, `DROP COLUMN ${col} on ${tname}: column never existed`);
        }
        t.cols.delete(col);
      }

      // ADD CONSTRAINT name
      for (const cm of rest.matchAll(/ADD\s+CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?/gi)) {
        const cname = q(cm[1]);
        if (t.constraints.has(cname)) {
          addFail(tag, s, `ADD CONSTRAINT ${cname} on ${tname}: already exists`);
        }
        t.constraints.add(cname);
      }

      // DROP CONSTRAINT [IF EXISTS]
      for (const cm of rest.matchAll(/DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)/gi)) {
        const ifEx = !!cm[1];
        const cname = q(cm[2]);
        if (!t.constraints.has(cname) && !ifEx) {
          // Also check global — constraints might have been named at CREATE without tracking
          addFail(tag, s, `DROP CONSTRAINT ${cname} on ${tname}: constraint not tracked / may not exist`, "WARN");
        }
        t.constraints.delete(cname);
      }

      // ALTER COLUMN ... TYPE using enum?
      for (const am of rest.matchAll(/ALTER\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+TYPE\s+"main"\."([a-zA-Z0-9_]+)"/gi)) {
        const col = q(am[1]);
        const tn = q(am[2]);
        if (!t.cols.has(col)) {
          addFail(tag, s, `ALTER COLUMN TYPE: column ${col} never existed on ${tname}`);
        }
        if (!types.has(tn)) {
          addFail(tag, s, `ALTER COLUMN TYPE: type ${tn} never CREATE'd`);
        }
      }

      return;
    }
  }

  // CREATE [UNIQUE] INDEX
  {
    const m = s.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)\s+ON\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const ifNot = !!m[3];
      const iname = q(m[4]);
      const tname = q(m[5]);
      if (!tableExists(tname)) {
        addFail(tag, s, `CREATE INDEX ${iname} ON ${tname}: table never CREATE'd`);
      }
      if (globalIndexes.has(iname) && !ifNot) {
        addFail(tag, s, `CREATE INDEX ${iname}: index already exists (no IF NOT EXISTS)`);
      }
      // check columns in index
      const colPart = s.match(/ON\s+[^\(]+\((.+)\)/i);
      if (colPart && tableExists(tname)) {
        const t = tables.get(tname);
        // extract simple column names
        const cols = [...colPart[1].matchAll(/"?([a-zA-Z0-9_]+)"?/g)].map((x) => q(x[1]));
        // filter SQL keywords and expressions
        for (const c of cols) {
          if (/^(btree|hash|gist|gin|brin|asc|desc|nulls|first|last|using)$/i.test(c)) continue;
          if (/^\d+$/.test(c)) continue;
          // skip function-ish — if previous was (
          if (!t.cols.has(c)) {
            // might be expression — only flag if looks like identifier in list
            // soft warn
            addFail(tag, s, `CREATE INDEX ${iname}: column ${c} may not exist on ${tname}`, "WARN");
          }
        }
      }
      globalIndexes.add(iname);
      if (tableExists(tname)) tables.get(tname).indexes.add(iname);
      return;
    }
  }

  // DROP INDEX
  {
    const m = s.match(/^DROP\s+INDEX\s+(IF\s+EXISTS\s+)?(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (m) {
      const ifEx = !!m[1];
      const iname = q(m[2]);
      if (!globalIndexes.has(iname) && !ifEx) {
        addFail(tag, s, `DROP INDEX ${iname}: index never existed`);
      }
      globalIndexes.delete(iname);
      return;
    }
  }
}

function processDoBlock(tag, stmt) {
  // Extract SQL inside DO $$ ... $$ or EXECUTE '...'
  // Look for RENAME COLUMN without existence check failing
  // Common pattern: IF EXISTS (col) THEN RENAME ELSE ADD
  // Flag bare RENAME COLUMN inside DO if the IF check looks for wrong column

  // Find RENAME COLUMN statements
  const renames = [...stmt.matchAll(/ALTER\s+TABLE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+RENAME\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+TO\s+"?([a-zA-Z0-9_]+)"?/gi)];
  for (const rm of renames) {
    const tname = q(rm[1]);
    const from = q(rm[2]);
    const to = q(rm[3]);
    if (!tableExists(tname)) {
      addFail(tag, rm[0], `DO block RENAME COLUMN: table ${tname} never CREATE'd`);
      continue;
    }
    const t = tables.get(tname);
    // Check if surrounding IF EXISTS looks for the from column
    const before = stmt.slice(Math.max(0, rm.index - 400), rm.index);
    const checksFrom =
      before.toLowerCase().includes(`column_name = '${from}'`) ||
      before.toLowerCase().includes(`column_name = '${from.toLowerCase()}'`) ||
      before.match(new RegExp(`information_schema\\.columns[\\s\\S]{0,200}'${from}'`, "i"));
    if (!t.cols.has(from)) {
      if (checksFrom) {
        // guarded — will take ELSE path; check ELSE for ADD COLUMN
        const after = stmt.slice(rm.index, rm.index + 500);
        const elseAdd = after.match(new RegExp(`ADD\\s+COLUMN\\s+"?${to}"?`, "i"));
        if (elseAdd) {
          t.cols.add(to);
          // OK path for fresh DB
        } else {
          addFail(tag, rm[0], `DO block RENAME ${from}→${to}: ${from} missing; IF guards skip rename but no ELSE ADD of ${to}?`, "WARN");
        }
      } else {
        addFail(tag, rm[0], `DO block RENAME COLUMN ${from}→${to}: column ${from} never existed on ${tname} and no column_name IF guard detected`);
      }
    } else {
      t.cols.delete(from);
      t.cols.add(to);
    }
  }

  // ADD COLUMN inside DO
  for (const am of stmt.matchAll(/ALTER\s+TABLE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)/gi)) {
    const tname = q(am[1]);
    const col = q(am[3] || am[2]);
    if (!tableExists(tname)) {
      addFail(tag, am[0], `DO block ADD COLUMN: table ${tname} never CREATE'd`);
      continue;
    }
    tables.get(tname).cols.add(col);
  }

  // DROP COLUMN inside DO
  for (const dm of stmt.matchAll(/ALTER\s+TABLE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?)/gi)) {
    const tname = q(dm[1]);
    const col = q(dm[3] || dm[2]);
    if (tableExists(tname)) tables.get(tname).cols.delete(col);
  }

  // ADD CONSTRAINT inside DO
  for (const cm of stmt.matchAll(/ALTER\s+TABLE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?/gi)) {
    const tname = q(cm[1]);
    const cname = q(cm[2]);
    if (!tableExists(tname)) {
      addFail(tag, cm[0], `DO block ADD CONSTRAINT: table ${tname} never CREATE'd`);
      continue;
    }
    const t = tables.get(tname);
    if (t.constraints.has(cname)) {
      // often guarded by IF NOT EXISTS on pg_constraint
      const before = stmt.slice(Math.max(0, cm.index - 300), cm.index);
      if (!/pg_constraint/i.test(before) && !/IF\s+NOT\s+EXISTS/i.test(before)) {
        addFail(tag, cm[0], `DO block ADD CONSTRAINT ${cname}: may already exist`);
      }
    }
    t.constraints.add(cname);
  }

  // CREATE TYPE inside DO
  for (const tm of stmt.matchAll(/CREATE\s+TYPE\s+(?:"?main"?\.)?"?([a-zA-Z0-9_]+)"?/gi)) {
    types.add(q(tm[1]));
  }
}

// Bootstrap: empty
for (const entry of journal.entries) {
  const tag = entry.tag;
  const file = path.join(__dirname, `${tag}.sql`);
  if (!fs.existsSync(file)) {
    addFail(tag, "(missing file)", "Journal tag has no .sql file");
    continue;
  }
  const sql = fs.readFileSync(file, "utf8");
  const stmts = splitStatements(sql);
  for (const stmt of stmts) {
    try {
      processStmt(tag, stmt);
    } catch (e) {
      addFail(tag, stmt.slice(0, 100), `Analyzer error: ${e.message}`, "WARN");
    }
  }
}

// Deduplicate identical failures
const seen = new Set();
const unique = [];
for (const f of failures) {
  const k = `${f.tag}|${f.stmt}|${f.why}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(f);
}

const fails = unique.filter((f) => f.severity === "FAIL");
const warns = unique.filter((f) => f.severity === "WARN");

console.log("=== HARD FAILURES ===");
for (const f of fails) {
  console.log(`\n[${f.tag}]`);
  console.log(`  STMT: ${f.stmt}`);
  console.log(`  WHY:  ${f.why}`);
}
console.log(`\nTotal FAIL: ${fails.length}`);
console.log("\n=== WARNINGS ===");
for (const f of warns) {
  console.log(`\n[${f.tag}]`);
  console.log(`  STMT: ${f.stmt}`);
  console.log(`  WHY:  ${f.why}`);
}
console.log(`\nTotal WARN: ${warns.length}`);
console.log(`\nTables tracked: ${tables.size}, Types: ${types.size}`);
