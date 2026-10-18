import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {main} from '../plugin-src/src/commands/cover.mjs';

export {main};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));
