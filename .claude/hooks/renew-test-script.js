#!/usr/bin/env node
/**
 * Stop hook: refuses to let a Claude Code turn end while code changes exist
 * that TEST_SCRIPT.md does not reflect — enforcing the CLAUDE.md doc-roles
 * rule that TEST_SCRIPT.md (the living session memory) is renewed on EVERY
 * work slice.
 *
 * Blocks when either:
 *  1. there are uncommitted changes under apps/ | packages/ | tools/ and
 *     TEST_SCRIPT.md is not among the uncommitted changes, or
 *  2. the most recent commit is < 60 min old, touches those code dirs, and
 *     does not include TEST_SCRIPT.md (and TEST_SCRIPT.md is not dirty).
 * Complying once (committing a renewed TEST_SCRIPT.md) satisfies both.
 * Never double-blocks one stop (stop_hook_active) and fails open on errors.
 */
const { execSync } = require('child_process');

let raw = '';
try {
  raw = require('fs').readFileSync(0, 'utf8');
} catch {}
let evt = {};
try {
  evt = JSON.parse(raw || '{}');
} catch {}
if (evt.stop_hook_active) process.exit(0);

const CODE_RE = /^(apps|packages|tools)\//;
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' });

try {
  const dirty = git('status --porcelain')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''));
  const dirtyCode = dirty.filter((f) => CODE_RE.test(f));
  const dirtyScript = dirty.some((f) => f.endsWith('TEST_SCRIPT.md'));

  let staleCommit = null;
  if (!dirtyScript) {
    const lines = git('log -1 --pretty=%ct%n%h --name-only')
      .split('\n')
      .filter(Boolean);
    const ageMin = (Date.now() / 1000 - Number(lines[0])) / 60;
    const files = lines.slice(2);
    if (
      ageMin < 60 &&
      files.some((f) => CODE_RE.test(f)) &&
      !files.some((f) => f.endsWith('TEST_SCRIPT.md'))
    ) {
      staleCommit = lines[1];
    }
  }

  if ((dirtyCode.length && !dirtyScript) || staleCommit) {
    const what = dirtyCode.length
      ? `uncommitted code changes (${dirtyCode.slice(0, 5).join(', ')}${dirtyCode.length > 5 ? ', …' : ''})`
      : `the last commit (${staleCommit}) touches code`;
    console.log(
      JSON.stringify({
        decision: 'block',
        reason:
          `TEST_SCRIPT.md was not renewed but ${what}. Per the CLAUDE.md doc-roles rule, renew it now: ` +
          'update §8/§9 for what was done or newly required, append a §10 changelog row (newest at top), ' +
          'then commit TEST_SCRIPT.md together with (or right after) the code change.',
      }),
    );
    process.exit(0);
  }
} catch {}
process.exit(0);
