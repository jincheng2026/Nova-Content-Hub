export type BootstrapReason = 'none' | 'binding-invalid' | 'binding-unreadable' | 'binding-unsafe' | 'binding-changed' | 'recovery-incomplete';

export interface BootstrapRecoveryView {
    state: 'ready' | 'binding-unavailable';
    reasonCode: BootstrapReason;
    canReset: boolean;
    confirmationToken: string | null;
    backupName: string | null;
}
export interface BootstrapInputs {
    readBootstrapRecovery: undefined;
    resetMachineBinding: {confirmationToken: string; confirmed: true};
}
export interface BootstrapResults {
    readBootstrapRecovery: BootstrapRecoveryView;
    resetMachineBinding: {reset: true; backupName: string};
}
