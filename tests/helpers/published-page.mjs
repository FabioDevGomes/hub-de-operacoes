import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRelease, versionPage } from '../../scripts/system-version.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { version } = await readRelease(root);
export const publishedPage = source => versionPage(String(source), version);

export async function copyReleaseMetadata(destination) {
  for (const path of ['VERSION', 'README.md', 'CHANGELOG.md', 'scripts/system-version.mjs']) {
    await cp(join(root, path), join(destination, path));
  }
}
