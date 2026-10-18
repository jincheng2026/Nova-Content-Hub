import {exact, uuid} from './validation.ts';

export function bootstrapDesktopInput(method: string, input: unknown): boolean | undefined {
    if (method === 'readBootstrapRecovery') return input === undefined;
    if (method === 'resetMachineBinding') return exact(input, ['confirmationToken', 'confirmed']) && uuid(input.confirmationToken) && input.confirmed === true;
    return undefined;
}
