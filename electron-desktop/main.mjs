import { startDesktop } from './desktop.mjs';
import { app } from 'electron';
// Electron emits ready after entry evaluation; awaiting whenReady at top level deadlocks it.
startDesktop().catch(error => { console.error(error); app.exit(1); });
