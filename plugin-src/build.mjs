import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { HOST_EVENTS, validRelease } from './src/content.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(source, '..');
export const skillNames = ['nova-content-template-study', 'nova-content-template-restore', 'nova-content-cover'];
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export function hooksFor(host, events) {
  return { hooks: Object.fromEntries(events.map(event => [event, [{ hooks: [{
    type: 'command',
    command: `sh "\${CLAUDE_PLUGIN_ROOT}/bin/run-node" hook --host ${host} --event ${event}`,
    commandWindows: `cmd /d /s /c "cd /d %CLAUDE_PLUGIN_ROOT%&& bin\\run-node.cmd hook --host ${host} --event ${event}"`,
    timeout: event === 'Interrupt' ? 3 : 5,
  }] }]])) };
}

export async function build(mode) {
  const config = JSON.parse(await readFile(join(root, 'release.config.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(config.version) || config.appScope !== 'nova-content-hub' || config.productId !== config.appScope || config.protocolVersion !== 1 || config.prototype !== true || !['required', 'disabled'].includes(config.AUTH_MODE)) throw new Error('Invalid prototype release.config.json');
  const modes = mode === 'both' ? ['required', 'disabled'] : [mode ?? config.AUTH_MODE];
  if (!modes.every(value => ['required', 'disabled'].includes(value))) throw new Error('Use --auth required|disabled|both');
  const outputs = [];
  for (const auth of modes) {
    const release = { productId: config.productId, version: config.version, appScope: config.appScope, protocolVersion: config.protocolVersion, prototype: true, AUTH_MODE: auth, pairId: `${config.appScope}@${config.version}:p${config.protocolVersion}:${auth}`, productionReady: false };
    if (!validRelease(release)) throw new Error('Invalid package release configuration');
    const dest = join(root, 'dist-plugin-contract', `${config.appScope}-${auth}`);
    await rm(dest, { recursive: true, force: true });
    for (const directory of ['dist', 'bin', 'hooks', '.codex-plugin', '.codebuddy-plugin', 'references']) await mkdir(join(dest, directory), { recursive: true });
    const cliSource = (await readFile(join(source, 'src/content.mjs'), 'utf8')).replace("from '../../原型/shared/handoff.js'", "from './handoff.js'");
    await writeFile(join(dest, 'dist/content.mjs'), cliSource);
    await cp(join(root, '原型/shared/handoff.js'), join(dest, 'dist/handoff.js'));
    await cp(join(root, 'schemas'), join(dest, 'schemas'), { recursive: true });
    await json(join(dest, 'dist/release.json'), release);
    await json(join(dest, 'contract.json'), { ...release, status: 'preintegration', requestProtocol: 'nova-content-hub-request', handoffProtocol:'nova-content-hub-handoff', schemaDirectory:'./schemas/', requestEntrypoint: './dist/content.mjs', realAuthorization: 'not_configured', libraryBinding: 'unavailable', hosts: { codex: 'compatibility_unverified', workbuddy: 'compatibility_unverified' } });
    await cp(join(source, 'README.md'), join(dest, 'README.md'));
    await cp(join(source, 'references'), join(dest, 'references'), { recursive: true });
    await writeFile(join(dest, 'bin/run-node'), '#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\nexec node "$ROOT/dist/content.mjs" "$@"\n', { mode: 0o755 });
    await writeFile(join(dest, 'bin/run-node.cmd'), '@echo off\r\nnode "%~dp0..\\dist\\content.mjs" %*\r\n');
    for (const name of skillNames) {
      const skill = join(dest, 'skills', name);
      await cp(join(source, 'skills', name), skill, { recursive: true });
      await mkdir(join(skill, 'scripts'), { recursive: true });
      await mkdir(join(skill, 'references'), { recursive: true });
      await writeFile(join(skill, 'scripts/content.mjs'), cliSource);
      await cp(join(root, '原型/shared/handoff.js'), join(skill, 'scripts/handoff.js'));
      await cp(join(root, 'schemas'), join(skill, 'schemas'), { recursive: true });
      await json(join(skill, 'scripts/release.json'), release);
      await cp(join(source, 'references'), join(skill, 'references'), { recursive: true });
    }
    const description = `自媒体模板学习、还原与封面预接入包；prototype，productionReady=false；${release.pairId}`;
    const base = { name: config.appScope, version: config.version, description, author: { name: 'Nova Content Hub' } };
    await json(join(dest, '.codex-plugin/plugin.json'), { ...base, skills: './skills/', hooks: './hooks/codex.json' });
    await json(join(dest, '.codebuddy-plugin/plugin.json'), { ...base, skills: skillNames.map(name => `./skills/${name}`), hooks: ['./hooks/hooks.json', './hooks/workbuddy.json'] });
    const common = ['SessionStart', 'UserPromptSubmit', 'Stop'];
    // Codex explicit hooks replace its default; WorkBuddy extension contains only its extra event.
    await json(join(dest, 'hooks/codex.json'), hooksFor('codex', HOST_EVENTS.codex));
    await json(join(dest, 'hooks/hooks.json'), hooksFor('workbuddy', common));
    await json(join(dest, 'hooks/workbuddy.json'), hooksFor('workbuddy', ['StopFailure']));
    outputs.push({ path: dest, pairId: release.pairId });
  }
  return outputs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--auth')) throw new Error('Use node plugin-src/build.mjs [--auth required|disabled|both]');
  process.stdout.write(JSON.stringify(await build(args[1]), null, 2) + '\n');
}
