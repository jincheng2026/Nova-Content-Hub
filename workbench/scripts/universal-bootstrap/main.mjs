import {app} from 'electron';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nativePayloadPath} from './selector.mjs';

const fail = error => { console.error(error); app.exit(1); };
try {
    const payload = nativePayloadPath(process.resourcesPath, process.platform, process.arch);
    // Import registers the renderer protocol before ready; awaiting startDesktop here deadlocks Electron.
    const {startDesktop} = await import(pathToFileURL(path.join(payload, 'workbench/dist/main/desktop.mjs')).href);
    startDesktop({marketRoot: path.join(payload, 'workbench/plugin-marketplace')}).catch(fail);
} catch (error) { fail(error); }
