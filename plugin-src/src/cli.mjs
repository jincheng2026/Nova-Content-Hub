import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { main as contract } from './content.mjs';

export async function main(argv) {
  const [namespace = 'help', ...args] = argv;
  if (namespace === 'contract') return contract(args);
  if (namespace === 'hook') return contract(['hook', ...args]);
  if (namespace === 'cover' || namespace === 'doctor' && args.length === 0) {
    const { main: cover } = await import('./commands/cover.mjs');
    return cover(namespace === 'doctor' ? ['doctor'] : args);
  }
  const ok = namespace === 'help' && args.length === 0;
  process.stdout.write(JSON.stringify({ ok, ...(ok ? {} : { code: 'INVALID_ARGUMENTS' }),
    namespaces: ['contract', 'cover', 'hook', 'doctor'], productionReady: false,
    message: '显式使用 contract 或 cover 命令空间；原型请求只供契约校验。' }) + '\n');
  return ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));
