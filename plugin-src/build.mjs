import {fileURLToPath} from 'node:url';
import {main} from './scripts/build.mjs';

export {build, buildCover, hooksFor, skillNames, allSkillNames} from './scripts/build.mjs';

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
