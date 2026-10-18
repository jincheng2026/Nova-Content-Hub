import {exact} from './validation.ts';
export function setupDesktopInput(method: string, input: unknown): boolean | undefined {
    if (method === 'openSetupTarget') return exact(input, ['target']) && ['assistant', 'market'].includes(input.target as string);
    return ['readSetup', 'copyPluginMarketLocation', 'exportDiagnostics'].includes(method) ? input === undefined : undefined;
}
