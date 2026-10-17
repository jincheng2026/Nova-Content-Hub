import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'release.config.json'), 'utf8'));
if (!['required', 'disabled'].includes(config.AUTH_MODE) || config.prototype !== true || config.appScope !== 'nova-content-hub' || config.productId !== config.appScope || config.protocolVersion !== 1 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(config.version)) throw Error('Invalid release.config.json');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--auth' || !['required', 'disabled', 'both'].includes(args[1]))) throw Error('Usage: node scripts/build-prototype.mjs [--auth required|disabled|both]');
const requested = args[1] || config.AUTH_MODE;
function buildConfig(mode) {
  const pairId = `${config.appScope}@${config.version}:p${config.protocolVersion}:${mode}`;
  return { ...config, AUTH_MODE: mode, authMode: mode, pairId, bundleId: pairId };
}
const js = c => `// Generated browser prototype; never a real production entitlement.\nwindow.NCH_BUILD = Object.freeze(${JSON.stringify(c)});\n`;
await fs.writeFile(path.join(root, '原型', 'build-config.js'), js(buildConfig(config.AUTH_MODE)));
for (const mode of requested === 'both' ? ['required', 'disabled'] : [requested]) {
  const dest = path.join(root, 'dist-prototype', `auth-${mode}`);
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(path.join(root, '原型'), dest, { recursive: true, filter: src => !['_audit.html', '_shot.html'].includes(path.basename(src)) });
  await fs.cp(path.join(root, 'assets', 'ai-reference-prompts'), path.join(dest, 'assets', 'ai-reference-prompts'), { recursive: true });
  await fs.writeFile(path.join(dest, 'build-config.js'), js(buildConfig(mode)));
  console.log(path.relative(root, path.join(dest, 'index.html')));
}
