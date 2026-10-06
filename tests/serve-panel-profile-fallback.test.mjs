import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scriptsRoot = fileURLToPath(new URL('../scripts/', import.meta.url));
const engineRoot = fileURLToPath(new URL('../presell-engine/', import.meta.url));
const windowsOnly = { skip: process.platform !== 'win32', timeout: 20_000 };

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'hub-startup-test-'));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'dist'));
  await mkdir(join(root, 'profile'));
  await writeFile(join(root, 'dist', 'index.html'), '<!doctype html><title>Synthetic panel</title>');
  for (const file of ['tools/New-PresellFromFicha.ps1', 'tools/Invoke-PresellWorkflow.ps1', 'tools/Test-PresellStructure.ps1', 'tools/Test-PresellAgainstFicha.ps1', 'modules/Presell.Validation.Common.psm1', 'config/presell-rules.json']) {
    const destination = join(root, 'presell-engine', file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(engineRoot, file), destination);
  }
  return root;
}

test('Windows PowerShell starts the standalone server with a supplied profile environment', windowsOnly, async t => {
  const root = await makeFixture();
  for (const file of ['serve-panel.ps1', 'knowledge-export.ps1']) {
    await cp(join(scriptsRoot, file), join(root, 'scripts', file));
  }
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));

  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'serve-panel.ps1'), '-Port', String(port)], {
    env: { ...process.env, USERPROFILE: join(root, 'profile') },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let launchError;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { launchError = error; });
  t.after(async () => {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      child.kill();
      await stopped;
    }
    await rm(root, { recursive: true, force: true });
  });

  const deadline = Date.now() + 15_000;
  let health;
  while (Date.now() < deadline && !health) {
    assert.ifError(launchError);
    assert.equal(child.exitCode, null, output);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/presell/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) health = await response.json();
    } catch {}
    if (!health) await delay(100);
  }
  assert.deepEqual(health, { presellApi: 'v2', runtime: 'powershell', engine: 'embedded' }, output);
});

test('a browser launch failure does not misreport a healthy server as an occupied port', windowsOnly, async t => {
  const root = await makeFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const launcher = join(root, 'scripts', 'iniciar-painel.ps1');
  await cp(join(scriptsRoot, 'iniciar-painel.ps1'), launcher);
  const command = String.raw`
function Invoke-RestMethod { return [pscustomobject]@{ presellApi = 'v2'; runtime = 'powershell' } }
function Start-Process { throw 'SYNTHETIC_BROWSER_FAILURE' }
& $env:HUB_TEST_LAUNCHER
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
    env: { ...process.env, HUB_TEST_LAUNCHER: launcher }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /http:\/\/127\.0\.0\.1:8765\//);
});
