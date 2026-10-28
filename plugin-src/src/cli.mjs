import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {main as contract} from './content.mjs';

export async function main(argv) {
    const [namespace = 'help', ...args] = argv;
    if (namespace === 'contract') return contract(args);
    if (namespace === 'hook') return contract(['hook', ...args]);
    if (namespace === 'content-journey') { const {main} = await import('./commands/content-journey.mjs'); return main(args); }
    if (namespace === 'production') { const {main: production} = await import('./commands/production.mjs'); return production(args); }
    if (namespace === 'jincheng-creation') { const {main} = await import('./commands/jincheng-creation.mjs'); return main(args); }
    if (namespace === 'jincheng-publish') { const {main} = await import('./commands/jincheng-publish.mjs'); return main(args); }
    if (namespace === 'jincheng-workflow') { const {main} = await import('./commands/jincheng-workflow.mjs'); return main(args); }
    if (namespace === 'jincheng-research') { const {main: research} = await import('./commands/jincheng-research.mjs'); return research(args); }
    if (namespace === 'template') {
        const {main: template} = await import('./commands/template.mjs');
        return template(args);
    }
    if (namespace === 'cover' || namespace === 'doctor' && args.length === 0) {
        const {main: cover} = await import('./commands/cover.mjs');
        return cover(namespace === 'doctor' ? ['doctor'] : args);
    }
    const ok = namespace === 'help' && args.length === 0;
    process.stdout.write(JSON.stringify({
        ok, ...(ok ? {} : {code: 'INVALID_ARGUMENTS'}),
        namespaces: ['contract', 'cover', 'template', 'production', 'content-journey', 'jincheng-research', 'jincheng-creation', 'jincheng-workflow', 'jincheng-publish', 'hook', 'doctor'], productionReady: false,
        message: '显式使用 contract、cover 或 template 命令空间；原型请求只供契约校验。'
    }) + '\n');
    return ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));
