import { copyFile, cp, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

// The shared web package contains code and presentation assets only.
const publicExtensions = new Set(['.html', '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2']);
const privateExtensions = new Set(['.json', '.jsonl', '.csv', '.tsv', '.xls', '.xlsx', '.db', '.sqlite', '.sqlite3', '.bak']);

export async function copyPublicDirectory(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: async path => (await stat(path)).isDirectory() || publicExtensions.has(extname(path).toLowerCase()),
  });
}

export async function privateDistributionFiles(directory) {
  const found = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (privateExtensions.has(extname(entry.name).toLowerCase())) found.push(child);
    }
  }
  await visit(directory);
  return found;
}

async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function movePrivateFile(source, destination) {
  try {
    await rename(source, destination);
    return;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EXDEV'].includes(error?.code)) throw error;
  }

  // Windows may deny rename across sandboxed/temp directories even on one volume.
  // Preserve the source until a byte-for-byte verified recovery copy exists.
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  const [sourceDigest, destinationDigest] = await Promise.all([fileDigest(source), fileDigest(destination)]);
  if (sourceDigest !== destinationDigest) {
    throw new Error(`A cópia de recuperação do arquivo privado não confere; a origem foi preservada: ${source}`);
  }
  await unlink(source);
}

export async function isolatePrivateDistributionFiles(projectRoot) {
  const output = resolve(projectRoot, 'dist');
  const recovery = resolve(projectRoot, 'data-local/distribution-recovery');
  const isolated = [];
  for (const source of await privateDistributionFiles(output)) {
    const path = relative(output, source);
    if (path.startsWith('..')) throw new Error('Artefato privado fora do diretório de distribuição.');
    const destination = join(recovery, `${path}.${randomUUID()}.private`);
    await mkdir(dirname(destination), { recursive: true });
    // Move to an ignored recovery directory, preserving bytes and older copies.
    await movePrivateFile(source, destination);
    isolated.push({ source, destination });
  }
  return isolated;
}
