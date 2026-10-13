import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function parseVersion(value) {
  const version = String(value).trim();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
      || version.split('.').some(part => !Number.isSafeInteger(Number(part)))) {
    throw new Error('VERSION deve conter uma versão estável no formato MAJOR.MINOR.PATCH (ex.: 1.0.0).');
  }
  return version;
}

export function nextVersion(current, requested) {
  const parts = parseVersion(current).split('.').map(Number);
  const index = ['major', 'minor', 'patch'].indexOf(requested);
  const next = index < 0 ? parseVersion(requested) : parseVersion(parts.map((part, position) =>
    position < index ? part : position === index ? part + 1 : 0).join('.'));
  const candidate = next.split('.').map(Number);
  const difference = candidate.map((part, position) => part - parts[position]).find(value => value !== 0);
  if (!(difference > 0)) throw new Error('A nova versão deve ser maior que a atual.');
  return next;
}

export function readmeVersionBlock(version) {
  return `<!-- hub-version:start -->
## Versão atual: v${parseVersion(version)}

Fonte única: [VERSION](VERSION). Mudanças: [CHANGELOG](CHANGELOG.md).
A mesma versão aparece junto ao título das telas e no título da aba do navegador.
<!-- hub-version:end -->`;
}

export function validateReleaseDocuments(version, readme, changelog) {
  version = parseVersion(version);
  readme = readme.replaceAll('\r\n', '\n');
  changelog = changelog.replaceAll('\r\n', '\n');
  const blocks = readme.match(/<!-- hub-version:start -->[\s\S]*?<!-- hub-version:end -->/g) || [];
  if (blocks.length !== 1 || blocks[0] !== readmeVersionBlock(version)) {
    throw new Error('README não corresponde a VERSION. Atualize pelo comando scripts/set-version.mjs.');
  }
  const latest = changelog.match(/^## \[([^\]]+)\] - \d{4}-\d{2}-\d{2}$/m)?.[1];
  if (latest !== version) throw new Error('A versão mais recente do CHANGELOG não corresponde a VERSION.');
  return version;
}

export async function readRelease(directory) {
  const [version, readme, changelog] = await Promise.all(['VERSION', 'README.md', 'CHANGELOG.md']
    .map(file => readFile(join(directory, file), 'utf8')));
  return { version: validateReleaseDocuments(version, readme, changelog), readme, changelog };
}

export function versionPage(html, version) {
  version = parseVersion(version);
  // Fragments used by SPA views are not independent browser documents.
  if (!/<html(?:\s|>)/i.test(html)) return html;
  const clean = html.replace(/<!-- hub-system-version:start -->[\s\S]*?<!-- hub-system-version:end -->\s*/g, '');
  if (!/<title>[\s\S]*?<\/title>/i.test(clean) || !/<\/head>/i.test(clean)) {
    throw new Error('Página completa sem title/head: não é possível publicar a versão.');
  }
  const titled = clean.replace(/<title>([\s\S]*?)<\/title>/i, (_, title) =>
    `<title>Hub v${version} · ${title.replace(/^Hub v\d+\.\d+\.\d+ · /, '')}</title>`);
  return titled.replace(/<\/head>/i, `<!-- hub-system-version:start -->
<meta name="hub-system-version" content="${version}">
<link rel="stylesheet" href="/system-version.css?v=${version}">
<script defer src="/system-version.js?v=${version}"></script>
<!-- hub-system-version:end -->
</head>`);
}

export async function versionPublicPages(source, destination, version) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const original = join(source, entry.name);
    const published = join(destination, entry.name);
    if (entry.isDirectory()) await versionPublicPages(original, published, version);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(original, 'utf8');
      if (/<html(?:\s|>)/i.test(html)) await writeFile(published, versionPage(html, version), 'utf8');
    }
  }
}
