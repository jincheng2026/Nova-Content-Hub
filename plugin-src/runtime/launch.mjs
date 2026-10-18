import {lstat, readFile, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';

const runtime = dirname(fileURLToPath(import.meta.url));
try {
    if (!(await lstat(runtime)).isDirectory()) throw Error('Unsafe bundled runtime directory');
    const manifest = JSON.parse(await readFile(join(runtime, 'manifest.json'), 'utf8'));
    const node = join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
    if (manifest.format !== 'nova-bundled-node' || manifest.schemaVersion !== 1 || manifest.version !== '24.20.0' || process.version !== `v${manifest.version}` || manifest.platform !== process.platform || manifest.arch !== process.arch || await realpath(node) !== await realpath(process.execPath)) throw Error('Bundled Node version/platform/architecture mismatch');
    for (const [name, expected] of [[process.platform === 'win32' ? 'node.exe' : 'node', manifest.nodeSha256], ['LICENSE', manifest.licenseSha256]]) {
        const path = join(runtime, name);
        if (!(await lstat(path)).isFile() || createHash('sha256').update(await readFile(path)).digest('hex') !== expected) throw Error(`Bundled runtime integrity mismatch: ${name}`);
    }
    const cli = join(runtime, '../plugin-src/src/cli.mjs');
    if (!(await lstat(cli)).isFile()) throw Error('Bundled CLI is missing or unsafe');
    const {main} = await import(pathToFileURL(cli).href);
    process.exitCode = await main(process.argv.slice(2));
} catch (error) {
    process.stderr.write(`BUNDLED_RUNTIME_INVALID: ${error.message}\n`);
    process.exitCode = 1;
}
