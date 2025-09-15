#!/usr/bin/env node
/*
 Detects C-style ternary operators in GDScript files and exits non-zero if any are found.
 Heuristic: after stripping strings and comments, flag any line that has a '?' not followed by '.' or '?'
 and later on the same line a ':' that is not part of ':='.
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'out',
]);

/**
 * Strip strings (single/double and triple quotes) and comments (#...) from a line stream.
 * Maintains state across lines for multi-line strings.
 */
function stripLine(line, state) {
  let out = '';
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (!state.inString) {
      if (ch === '#' ) {
        // comment starts; ignore rest
        break;
      }
      if (ch === '"' || ch === "'") {
        // possible triple
        const isTriple = i + 2 < n && line[i + 1] === ch && line[i + 2] === ch;
        state.inString = true;
        state.quote = ch;
        state.triple = !!isTriple;
        // replace consumed quote(s) with spaces
        out += ' ';
        i += 1;
        if (isTriple) {
          out += '  ';
          i += 2;
        }
        continue;
      }
      // normal code char
      out += ch;
      i += 1;
    } else {
      // inside string
      if (state.triple) {
        // look for closing triple
        if (ch === state.quote && i + 2 < n && line[i + 1] === state.quote && line[i + 2] === state.quote) {
          // close
          out += '   ';
          i += 3;
          state.inString = false;
          state.quote = '';
          state.triple = false;
          continue;
        } else {
          out += ' ';
          i += 1;
          continue;
        }
      } else {
        if (ch === '\\') {
          // escape next char inside string
          out += '  ';
          i += 2;
          continue;
        }
        if (ch === state.quote) {
          out += ' ';
          i += 1;
          state.inString = false;
          state.quote = '';
          continue;
        }
        out += ' ';
        i += 1;
      }
    }
  }
  return out;
}

function findGdFiles(dir) {
  const res = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(path.join(cur, e.name));
      } else if (e.isFile()) {
        if (e.name.toLowerCase().endsWith('.gd')) {
          res.push(path.join(cur, e.name));
        }
      }
    }
  }
  return res;
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const hits = [];
  const state = { inString: false, quote: '', triple: false };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = stripLine(raw, state);
    const q = code.indexOf('?');
    if (q === -1) continue;
    // ignore safe-nav (?.) and null-coalesce (??)
    const next = code[q + 1] || '';
    if (next === '.' || next === '?') continue;
    // find ':' after '?'
    const c = code.indexOf(':', q + 1);
    if (c === -1) continue;
    // ignore ':=' assignment
    if (code[c + 1] === '=') continue;
    // looks like a C-style ternary
    hits.push({ line: i + 1, text: raw.trim() });
  }
  return hits;
}

function main() {
  const files = findGdFiles(ROOT);
  let total = 0;
  const all = [];
  for (const f of files) {
    const hits = scanFile(f);
    if (hits.length) {
      total += hits.length;
      all.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), hits });
    }
  }
  if (total > 0) {
    console.error('[gd-ternary-check] Found potential C-style ternaries in .gd files:');
    for (const entry of all) {
      for (const h of entry.hits) {
        console.error(`  ${entry.file}:${h.line}  ${h.text}`);
      }
    }
    console.error(`\nUse: value_if_true if condition else value_if_false`);
    process.exit(1);
  } else {
    console.log('[gd-ternary-check] No C-style ternaries found.');
  }
}

main();
