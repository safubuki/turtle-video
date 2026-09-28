import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(projectRoot, 'dist');
const nodeModulesDir = join(projectRoot, 'node_modules');
const outputFile = join(distDir, 'THIRD_PARTY_LICENSES.txt');
const projectLicenseFile = join(distDir, 'LICENSE.txt');

// These tools contribute generated browser code or CSS without appearing as
// node_modules sources in the final JavaScript source maps.
const generatedCodePackages = ['tailwindcss', 'vite', 'vite-plugin-pwa'];

function listSourceMaps(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceMaps(entryPath);
    return entry.name.endsWith('.map') ? [entryPath] : [];
  });
}

function packageDirectoryForSource(source) {
  const segments = source.replaceAll('\\', '/').split('/');
  const firstNodeModules = segments.indexOf('node_modules');
  if (firstNodeModules < 0) return null;

  const packagePath = segments.slice(firstNodeModules);
  const lastNodeModules = packagePath.lastIndexOf('node_modules');
  const firstNamePart = packagePath[lastNodeModules + 1];
  const namePartCount = firstNamePart?.startsWith('@') ? 2 : 1;
  const nameParts = packagePath.slice(lastNodeModules + 1, lastNodeModules + 1 + namePartCount);
  if (nameParts.length !== namePartCount || nameParts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Cannot identify the package in source map entry: ${source}`);
  }

  const packageDir = resolve(projectRoot, ...packagePath.slice(0, lastNodeModules + 1 + namePartCount));
  const relativeToNodeModules = relative(nodeModulesDir, packageDir);
  if (!relativeToNodeModules || relativeToNodeModules.startsWith('..' + sep) || relativeToNodeModules === '..') {
    throw new Error(`Package path escapes node_modules: ${source}`);
  }
  return packageDir;
}

if (!existsSync(distDir)) {
  throw new Error('dist is missing. Run the Vite build before generating third-party licenses.');
}

const sourceMaps = listSourceMaps(distDir);
if (sourceMaps.length === 0) {
  throw new Error('No build source maps found; third-party package discovery cannot be verified.');
}

const packageDirs = new Set(generatedCodePackages.map((name) => join(nodeModulesDir, name)));
let discoveredFromSourceMaps = 0;
for (const mapFile of sourceMaps) {
  const sourceMap = JSON.parse(readFileSync(mapFile, 'utf8'));
  for (const source of sourceMap.sources ?? []) {
    const packageDir = packageDirectoryForSource(source);
    if (!packageDir) continue;
    discoveredFromSourceMaps += 1;
    packageDirs.add(packageDir);
  }
}
if (discoveredFromSourceMaps === 0) {
  throw new Error('No node_modules sources found in build source maps.');
}

const packages = [...packageDirs].map((packageDir) => {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Package manifest is missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string' || typeof manifest.license !== 'string') {
    throw new Error(`Package license metadata is incomplete: ${manifestPath}`);
  }

  const noticeFiles = readdirSync(packageDir)
    .filter((name) => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name))
    .filter((name) => statSync(join(packageDir, name)).isFile())
    .sort();
  if (noticeFiles.length === 0) {
    throw new Error(`No license or notice file found for ${manifest.name}@${manifest.version}: ${packageDir}`);
  }

  return { packageDir, manifest, noticeFiles };
}).sort((a, b) =>
  `${a.manifest.name}@${a.manifest.version}`.localeCompare(`${b.manifest.name}@${b.manifest.version}`, 'en')
);

const sections = [
  'Turtle Video - Third-Party Licenses',
  '',
  'This file contains the notices shipped with the third-party packages found in the',
  'production JavaScript source maps, including the generated PWA service worker.',
  'Vite, vite-plugin-pwa, and Tailwind CSS are also included because they contribute',
  'generated browser code or CSS that source maps do not attribute to their packages.',
  'The Turtle Video project license is included separately as LICENSE.txt.',
  '',
  `Packages: ${packages.length}`,
];

for (const { packageDir, manifest, noticeFiles } of packages) {
  sections.push('', '='.repeat(78));
  sections.push(`${manifest.name}@${manifest.version}`);
  sections.push(`Declared license: ${manifest.license}`);
  for (const name of noticeFiles) {
    sections.push('', `--- ${name} ---`);
    sections.push(readFileSync(join(packageDir, name), 'utf8').trimEnd());
  }
}

writeFileSync(outputFile, sections.join('\n') + '\n', 'utf8');
copyFileSync(join(projectRoot, 'LICENSE'), projectLicenseFile);
console.log(`Generated ${relative(projectRoot, outputFile)} for ${packages.length} packages.`);
