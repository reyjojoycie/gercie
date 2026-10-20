#!/usr/bin/env node
/**
 * check-all-errors.js — Vérificateur TypeScript (liste TOUTES les erreurs)
 *
 * Usage :
 *   node check-all-errors.js                → vérif incrémentale (rapide, avec cache)
 *   node check-all-errors.js --fresh        → ignore le cache (vérif complète)
 *   node check-all-errors.js --filter admin → ne garde que les fichiers/dossiers contenant "admin"
 *   node check-all-errors.js --report       → génère en plus errors.json + errors.html
 *   node check-all-errors.js --max 5        → max 5 erreurs affichées par fichier
 *   node check-all-errors.js --json         → exporte errors.json
 *   node check-all-errors.js --txt          → écrit TOUTES les erreurs dans errors.txt (texte brut)
 *
 * Corrections par rapport à la version précédente :
 *   - plus de faux "Aucune erreur" quand tsc plante (code de sortie vérifié)
 *   - --filter s'applique au code de sortie et aux exports, pas seulement à l'affichage
 *   - les lignes de détail indentées de tsc sont rattachées à leur erreur
 *   - suggestions uniquement pour les littéraux de chaîne (évite les propositions absurdes)
 *   - libellé "cache incrémental" seulement si le cache existait déjà
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─────────────────────────── CONFIG ───────────────────────────
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const FRESH = hasFlag('--fresh');
const REPORT = hasFlag('--report');
const JSON_OUT = hasFlag('--json');
const TXT_OUT = hasFlag('--txt');
const FILTER = getArg('--filter', null);
const MAX_PER_FILE = parseInt(getArg('--max', '10'), 10);

const CACHE_DIR = path.join('node_modules', '.cache');
const BUILD_INFO = path.join(CACHE_DIR, 'ts-check.tsbuildinfo');
const OUT_JSON = 'errors.json';
const OUT_HTML = 'errors.html';
const OUT_TXT = 'errors.txt';

// ─────────────────────────── COULEURS ─────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m',
};

// ─────────────────────── LEVENSHTEIN (suggestions) ───────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

// Suggère la valeur la plus proche, uniquement quand la valeur reçue est un
// littéral de chaîne (ex. "admn" au lieu de "admin"). Pour `string`, `number`,
// etc., une suggestion n'aurait aucun sens.
function suggestFix(message) {
  const m = message.match(/Type '([^']+)' is not assignable to type '([^']+)'/);
  if (!m) return null;

  const rawReceived = m[1];
  if (!rawReceived.startsWith('"')) return null; // pas un littéral → pas de suggestion
  const received = rawReceived.replace(/"/g, '');

  const candidates = m[2]
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('"'))
    .map((s) => s.replace(/"/g, ''));
  if (candidates.length === 0) return null;

  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(received.toLowerCase(), c.toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  // Ne suggère que si c'est vraiment proche (typo probable)
  return best && bestDist <= Math.max(2, received.length / 2) ? best : null;
}

// ─────────────────────── ANALYSE DU TSC ───────────────────────
function runTsc() {
  const tscArgs = ['tsc', '--noEmit', '--pretty', 'false'];
  let cacheExisted = false;
  if (!FRESH) {
    // Compilation incrémentale : seuls les fichiers modifiés sont re-checkés.
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    cacheExisted = fs.existsSync(BUILD_INFO);
    tscArgs.push('--incremental', '--tsBuildInfoFile', BUILD_INFO);
  }
  const start = Date.now();
  const res = spawnSync('npx', tscArgs, {
    encoding: 'utf8',
    shell: true, // requis sur Windows
    maxBuffer: 50 * 1024 * 1024,
  });
  return {
    output: (res.stdout || '') + (res.stderr || ''),
    elapsed: Date.now() - start,
    // status === null si le process n'a pas pu démarrer ou a été tué
    status: res.status === null ? 1 : res.status,
    spawnError: res.error ? res.error.message : null,
    cacheExisted,
  };
}

// ─────────────────────── PARSING ───────────────────────
function parseErrors(output) {
  const lineRe = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/;
  const errors = [];
  let last = null;
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(lineRe);
    if (m) {
      last = {
        file: m[1].replace(/\\/g, '/'),
        line: +m[2], col: +m[3],
        severity: m[4], code: m[5], message: m[6],
        details: [],
      };
      errors.push(last);
    } else if (last && /^\s+\S/.test(line)) {
      // Ligne indentée = détail de l'erreur précédente
      last.details.push(line.trim());
    } else if (line.trim() !== '') {
      last = null;
    }
  }
  return errors;
}

// ─────────────────────── AFFICHAGE ───────────────────────
function printResults(list, elapsed, cached) {
  // Regroupement par fichier
  const byFile = new Map();
  for (const e of list) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  const files = [...byFile.keys()].sort();

  // Statistiques par code d'erreur
  const byCode = {};
  for (const e of list) byCode[e.code] = (byCode[e.code] || 0) + 1;

  console.log(`\n${C.bold}${'─'.repeat(70)}${C.reset}`);
  console.log(
    `${C.bold}RAPPORT TYPESCRIPT${C.reset}  ${C.gray}(${elapsed}ms${cached ? ' · cache incrémental' : ''}${FILTER ? ` · filtre "${FILTER}"` : ''})${C.reset}`
  );
  console.log(`${C.bold}${'─'.repeat(70)}${C.reset}\n`);

  if (list.length === 0) {
    console.log(`${C.green}${C.bold}✅ Aucune erreur !${C.reset}\n`);
    return;
  }

  for (const file of files) {
    const errs = byFile.get(file);
    console.log(`${C.cyan}${C.bold}📄 ${file}${C.reset} ${C.gray}(${errs.length})${C.reset}`);
    for (const e of errs.slice(0, MAX_PER_FILE)) {
      const loc = `${C.gray}${e.line}:${e.col}${C.reset}`;
      const sev = e.severity === 'error'
        ? `${C.red}✖ ${e.code}${C.reset}`
        : `${C.yellow}⚠ ${e.code}${C.reset}`;
      console.log(`   ${loc}  ${sev}  ${e.message}`);
      for (const d of e.details) console.log(`        ${C.dim}${d}${C.reset}`);
      const fix = suggestFix(e.message);
      if (fix) console.log(`   ${C.green}💡 Suggestion : remplace par '${fix}'${C.reset}`);
    }
    if (errs.length > MAX_PER_FILE)
      console.log(`   ${C.dim}... et ${errs.length - MAX_PER_FILE} autres (utilise --max pour tout voir)${C.reset}`);
    console.log();
  }

  // Résumé global
  console.log(`${C.bold}${'─'.repeat(70)}${C.reset}`);
  console.log(`${C.red}${C.bold}❌ ${list.length} erreur(s)${C.reset} dans ${C.bold}${files.length} fichier(s)${C.reset}`);
  console.log(`\n${C.bold}Top codes d'erreur :${C.reset}`);
  Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([code, n]) => console.log(`   ${C.yellow}${code}${C.reset} × ${n}`));
  console.log();
}

// ─────────────────────── EXPORTS ───────────────────────
function exportJson(errors) {
  fs.writeFileSync(OUT_JSON, JSON.stringify(errors, null, 2));
  console.log(`${C.green}📦 Exporté → ${OUT_JSON}${C.reset}`);
}

function exportHtml(errors) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = errors.map((e) => `
    <tr>
      <td>${esc(e.file)}</td><td>${e.line}:${e.col}</td>
      <td class="${e.severity}">${esc(e.code)}</td>
      <td>${esc(e.message)}${e.details.length ? `<pre>${esc(e.details.join('\n'))}</pre>` : ''}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport TS</title>
<style>body{font-family:system-ui;background:#0d1117;color:#e6edf3;padding:2rem}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #30363d;padding:6px 10px;font-size:13px;vertical-align:top}
th{background:#161b22;text-align:left}.error{color:#f85149}.warning{color:#d29922}
pre{margin:6px 0 0;color:#8b949e;font-size:12px;white-space:pre-wrap}</style></head>
<body><h1>❌ ${errors.length} erreurs TypeScript</h1><table>
<tr><th>Fichier</th><th>Ligne</th><th>Code</th><th>Message</th></tr>${rows}</table></body></html>`;
  fs.writeFileSync(OUT_HTML, html);
  console.log(`${C.green}🌐 Rapport → ${OUT_HTML}${C.reset}`);
}

// Fichier texte brut (sans couleurs), TOUTES les erreurs, regroupées par fichier.
// Pratique : s'ouvre dans VS Code et se copie/colle facilement.
function exportTxt(errors) {
  const byFile = new Map();
  for (const e of errors) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  const lines = [`${errors.length} erreur(s) dans ${byFile.size} fichier(s)`, ''];
  for (const file of [...byFile.keys()].sort()) {
    const errs = byFile.get(file);
    lines.push(`${file} (${errs.length})`);
    for (const e of errs) {
      lines.push(`  ${e.line}:${e.col}  ${e.code}  ${e.message}`);
      for (const d of e.details.slice(0, 3)) lines.push(`      ${d}`);
      if (e.details.length > 3) lines.push(`      ... (${e.details.length - 3} lignes de détail omises)`);
    }
    lines.push('');
  }
  fs.writeFileSync(OUT_TXT, lines.join('\n'), 'utf8');
  console.log(`${C.green}📝 Liste complète → ${OUT_TXT}${C.reset}`);
}

// ─────────────────────── MAIN ───────────────────────
console.log(`\n${C.magenta}${C.bold}🔍 Vérification TypeScript...${C.reset}`);
if (FRESH) console.log(`${C.yellow}(cache ignoré — vérif complète)${C.reset}`);

const { output, elapsed, status, spawnError, cacheExisted } = runTsc();
const allErrors = parseErrors(output);

// Garde-fou : tsc a échoué mais aucune erreur "fichier(l,c)" n'a été trouvée
// (tsconfig introuvable, npx/tsc absent, option invalide...). On ne doit surtout
// pas afficher "Aucune erreur" dans ce cas.
if (spawnError || (status !== 0 && allErrors.length === 0)) {
  console.log(`${C.red}${C.bold}❌ tsc a échoué sans produire d'erreurs analysables :${C.reset}\n`);
  if (spawnError) console.log(spawnError);
  if (output.trim()) console.log(output);
  process.exit(1);
}

// Le filtre s'applique ici : affichage, exports ET code de sortie sont cohérents.
const errors = FILTER ? allErrors.filter((e) => e.file.includes(FILTER)) : allErrors;

printResults(errors, elapsed, !FRESH && cacheExisted);
if (JSON_OUT || REPORT) exportJson(errors);
if (REPORT) exportHtml(errors);
if (TXT_OUT) exportTxt(errors);

process.exit(errors.length ? 1 : 0);