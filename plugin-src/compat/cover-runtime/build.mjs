import {main} from '../../scripts/build.mjs';

await main(['--target', 'cover', ...process.argv.slice(2)]);
