import type {VaultDocument} from './index.mjs';
export function createVaultWorkingDraft(runtimeRoot:string,input:{id:string;expectedHash:string},options:{mutationId:string}):{document:VaultDocument;text:string};
