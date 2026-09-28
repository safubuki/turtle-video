#!/usr/bin/env node
// Read-only, deterministic checks for the project's license disclosures.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function usage() {
  return [
    'Usage: node .agents/skills/app-add-license/scripts/license_audit.mjs [options]',
    '  --project-root PATH  Audit another Turtle Video checkout',
    '  --source-only        Skip generated dist files',
    '  --dry-run            Show checks without reading project files',
    '  --help               Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { projectRoot: defaultRoot, sourceOnly: false, dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') options.help = true;
    else if (argument === '--source-only') options.sourceOnly = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--project-root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--project-root requires a directory path');
      options.projectRoot = resolve(value);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function read(root, relativePath) {
  const filePath = join(root, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing ${relativePath} in ${root}`);
  return readFileSync(filePath, 'utf8');
}

function parseJson(root, relativePath) {
  try {
    return JSON.parse(read(root, relativePath));
  } catch (error) {
    throw new Error(`Cannot parse ${relativePath}: ${error.message}`);
  }
}

function labelCounts(entries) {
  const counts = new Map();
  for (const [path, value] of Object.entries(entries)) {
    if (path === '') continue;
    const label = value.license ?? '(missing license)';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function orderedCounts(counts) {
  return [...counts].sort(([left], [right]) => left.localeCompare(right, 'en'));
}

function audit(root, sourceOnly) {
  const manifest = parseJson(root, 'package.json');
  const lock = parseJson(root, 'package-lock.json');
  const projectLicense = read(root, 'LICENSE');
  const readme = read(root, 'README.md');
  const help = read(root, join('src', 'constants', 'sectionHelp.ts'));
  const vite = read(root, 'vite.config.ts');
  const checks = [];
  const check = (name, passed, detail = '') => checks.push({ name, passed: Boolean(passed), detail });

  check('GPL notice in LICENSE', /either version 3 of the License, or\s*\(at your option\) any later version\./.test(projectLicense));
  check('GPL identifier in package metadata', manifest.license === 'GPL-3.0-or-later' && lock.packages?.['']?.license === 'GPL-3.0-or-later');
  check('GPL identifier in README', readme.includes('GPL-3.0-or-later'));
  check('build creates third-party notices', typeof manifest.scripts?.build === 'string' && manifest.scripts.build.includes('vite build') && manifest.scripts.build.includes('scripts/generate-third-party-licenses.mjs'));
  check('Vite source maps enabled', /sourcemap:\s*true\b/.test(vite));
  check('help links to both notice files', help.includes('"fileName": "LICENSE.txt"') && help.includes('"fileName": "THIRD_PARTY_LICENSES.txt"'));

  const entries = lock.packages;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('package-lock.json has no packages object');
  const lockCount = Object.keys(entries).filter((path) => path !== '').length;
  const section = help.match(/"title": "依存ライセンス集計（package-lock\.json 全体）"[\s\S]*?"items": \[([\s\S]*?)\]/)?.[1];
  const displayedCount = Number(section?.match(/依存エントリ\s+(\d+)\s+件/)?.[1]);
  check('help lockfile entry count', displayedCount === lockCount, `lock=${lockCount}, help=${Number.isNaN(displayedCount) ? 'missing' : displayedCount}`);

  const displayedLabels = new Map();
  for (const match of section?.matchAll(/^\s*"([^"]+): (\d+)件",?\s*$/gm) ?? []) {
    displayedLabels.set(match[1], Number(match[2]));
  }
  const actualLabels = labelCounts(entries);
  const sameLabels = JSON.stringify(orderedCounts(actualLabels)) === JSON.stringify(orderedCounts(displayedLabels));
  check('help license totals', sameLabels, sameLabels
    ? `${actualLabels.size} license expressions`
    : `lock=${JSON.stringify(orderedCounts(actualLabels))}, help=${JSON.stringify(orderedCounts(displayedLabels))}`);

  const missingDirect = [];
  for (const [name, range] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!help.includes(`${name} (${range}): `)) missingDirect.push(name);
  }
  check('help direct dependency entries', missingDirect.length === 0, missingDirect.length ? `missing: ${missingDirect.sort().join(', ')}` : '');

  let noticeCount = null;
  if (!sourceOnly) {
    const copiedLicense = read(root, join('dist', 'LICENSE.txt'));
    const notice = read(root, join('dist', 'THIRD_PARTY_LICENSES.txt'));
    check('dist GPL copy', copiedLicense === projectLicense);
    noticeCount = Number(notice.match(/^Packages: (\d+)$/m)?.[1]);
    const sections = [...notice.matchAll(/^Declared license: /gm)].length;
    check('dist third-party notice sections', Number.isInteger(noticeCount) && noticeCount > 0 && noticeCount === sections, `declared=${noticeCount}, sections=${sections}`);
  }

  for (const result of checks) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.detail ? `: ${result.detail}` : ''}`);
  }
  console.log(`lock_entries=${lockCount}`);
  if (noticeCount !== null) console.log(`notice_packages=${noticeCount}`);
  console.log(`${checks.filter((result) => result.passed).length}/${checks.length} static checks passed`);
  console.log('Scope: static consistency only; inspect original terms, assets, distribution, and patent claims separately.');
  return checks.every((result) => result.passed) ? 0 : 1;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
  } else {
    if (!existsSync(options.projectRoot)) throw new Error(`Project root does not exist: ${options.projectRoot}`);
    if (options.dryRun) {
      console.log(`Project root: ${options.projectRoot}`);
      console.log('Planned read-only checks: LICENSE, package.json, package-lock.json, README.md, sectionHelp.ts, vite.config.ts');
      console.log(options.sourceOnly ? 'Skipping dist files (--source-only)' : 'Also check dist/LICENSE.txt and dist/THIRD_PARTY_LICENSES.txt');
    } else {
      process.exitCode = audit(options.projectRoot, options.sourceOnly);
    }
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
