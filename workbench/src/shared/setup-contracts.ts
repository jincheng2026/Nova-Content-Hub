import type {AssistantSetup} from './cover-contracts.ts';

export interface SetupView {
    platform: 'darwin' | 'linux' | 'win32';
    arch: 'arm64' | 'x64';
    version: string;
    mode: 'required' | 'disabled';
    experimental: true;
    assistant: AssistantSetup;
    market: {state: 'available' | 'notavailable' | 'mismatch'; name: string | null};
    entitlement: 'not-integrated' | 'disabled-experimental';
}
export interface SetupContextSummary {
    bindingPresent: boolean;
    bindingBackupName?: string | null;
    recovery?: Partial<Record<'content' | 'workspace' | 'template' | 'creation' | 'photo' | 'cover' | 'coverAction' | 'maintenance' | 'seed' | 'needsReselect', boolean>>;
    counts?: Partial<Record<'contents' | 'collections' | 'templates' | 'photos' | 'prompts', number>>;
    errorCodes?: string[];
}
export interface SetupInputs {
    readSetup: undefined;
    openSetupTarget: {target: 'assistant' | 'market'};
    copyPluginMarketLocation: undefined;
    exportDiagnostics: undefined;
}
export interface SetupResults {
    readSetup: SetupView;
    openSetupTarget: {opened: true};
    copyPluginMarketLocation: {copied: true};
    exportDiagnostics: {exported: boolean; name: string | null};
}
