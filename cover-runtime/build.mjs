import {main} from '../plugin-src/scripts/build.mjs';

await main(['--target', 'cover', ...process.argv.slice(2)]);
