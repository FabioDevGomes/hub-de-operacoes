import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nextVersion, readRelease, readmeVersionBlock } from './system-version.mjs';

export async function updateVersion(directory, requested, notes, date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })) {
  if (!notes?.trim() || /[\r\n]/.test(notes)) throw new Error('Informe uma descrição das mudanças em uma única linha.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida para o CHANGELOG.');
  const release = await readRelease(directory);
  const version = nextVersion(release.version, requested);
  const readme = release.readme.replace(/<!-- hub-version:start -->[\s\S]*?<!-- hub-version:end -->/, readmeVersionBlock(version));
  const changelog = release.changelog.replace(/^## \[/m, `## [${version}] - ${date}\n\n- ${notes.trim()}\n\n## [`);
  // Only public release metadata; no Git commands, build or user database access.
  await writeFile(join(directory, 'CHANGELOG.md'), changelog, 'utf8');
  await writeFile(join(directory, 'README.md'), readme, 'utf8');
  await writeFile(join(directory, 'VERSION'), `${version}\n`, 'utf8');
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Uso: node scripts/set-version.mjs patch|minor|major|X.Y.Z "Descrição das mudanças"');
    const directory = resolve(import.meta.dirname, '..');
    const version = await updateVersion(directory, process.argv[2], process.argv[3]);
    console.log(`Hub v${version}: VERSION, README e CHANGELOG atualizados. Execute o build e os testes; commit/push continuam manuais.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
