#!/usr/bin/env node
// scripts/prepublish-gate.mjs — STRUCTURAL guard against the "shipped to npm from an
// uncommitted tree" loophole.
//
// Root cause it closes: sizmo 0.7.0, 0.8.0, and 0.9.0 were all published to npm while git
// was stuck at the 0.6.0 commit — three releases with no commit, no tag, no traceable source.
// A documented "remember to commit first" ritual is exactly the kind of thing that gets
// skipped (that's how it happened). So this is enforced, not advised.
//
// Wired into package.json `prepublishOnly`, so `npm publish` ABORTS unless:
//   1. it's a git repo,
//   2. the working tree is clean (nothing uncommitted/untracked), and
//   3. HEAD carries the tag matching package.json's version (vX.Y.Z).
//
// There is NO bypass flag by design — a bypass is the loophole. If you genuinely must override,
// you have to edit this file, which is a visible, reviewable act.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function sh(cmd) { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
function fail(msg) { process.stderr.write(`\n✖ prepublish-gate: ${msg}\n\n`); process.exit(1); }

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

// 1) must be inside a git repo
try { sh('git rev-parse --is-inside-work-tree'); }
catch { fail('not a git repository — refusing to publish untracked code.'); }

// 2) working tree must be clean — no uncommitted or untracked changes
const dirty = sh('git status --porcelain');
if (dirty) {
  fail(`working tree is dirty — commit (or .gitignore) everything before publishing.\n` +
       `What npm would ship that git has never seen:\n${dirty}`);
}

// 3) HEAD must carry the tag that matches package.json's version
const tagsAtHead = sh('git tag --points-at HEAD').split('\n').filter(Boolean);
if (!tagsAtHead.includes(tag)) {
  fail(`HEAD is not tagged ${tag}.\n` +
       `  package.json version: ${version}\n` +
       `  tags at HEAD:         [${tagsAtHead.join(', ') || 'none'}]\n` +
       `Release ritual: bump version → node --test → commit → git tag -a ${tag} → npm publish.`);
}

process.stdout.write(`✓ prepublish-gate: clean tree, HEAD tagged ${tag} — safe to publish\n`);
