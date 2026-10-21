import type {LibraryBinding} from './contracts.ts';
import type {Assistant, Attempt, Raster} from './cover-contracts.ts';

export interface TemplateAssistantSetup {host: Assistant; ready: boolean; skill: 'nova-content-template-execution' | null; reason: 'available' | 'protocol-missing' | 'skill-missing' | 'unconfigured'}
export interface TemplateReference {templateId: string; requestId: string; attemptId: string; requestHash: string; sourceVersion: number; sourcePackageHash: string}
export interface TemplateStart {templateId: string; version: number; editToken: string; notes: string}
export interface TemplateAccept extends TemplateReference {resultHash: string; editToken: string}
export interface TemplateRules {fixed: string[]; variable: string[]; evidence: {sourceAssetHash: string; ruleType: 'fixed' | 'variable'; ruleIndex: number; observation: string}[]}
export interface TemplateAcceptance {requestId: string; attemptId: string; requestHash: string; resultHash: string; sourceTemplate: {id: string; version: number; packageHash: string}; acceptedTemplate: {id: string; version: number; packageHash: string}; acceptedAt: string}
export interface TemplateAttemptView extends Attempt {reference: TemplateReference; result: {resultHash: string; rules: TemplateRules; restore: Raster} | null; samples: Raster[]; unavailable: boolean}
export interface TemplateJobView {id: string; activeAttemptId: string | null; acceptance: TemplateAcceptance | null; attempts: TemplateAttemptView[]}
export interface TemplateWorkflowView {reportWarnings?: string[]; templateId: string; title: string; editToken: string; currentVersion: number; builtin: boolean; deletedAt: string | null; jobs: TemplateJobView[]}
export interface TemplateWorkflowResult {view: TemplateWorkflowView; launchRequested: boolean}
type Bound = {binding: Pick<LibraryBinding, 'libraryId' | 'rootIdentity'>; mutationId: string};
export type TemplatePending = Bound & (
    | {action: 'start'; sizePolicy?: 'exact' | 'ratio-minimum'; input: TemplateStart; host: Assistant; requestMutationId: string; attemptMutationId: string; request: {requestId: string; requestHash: string; sourcePackageHash: string} | null}
    | {action: 'attempt'; reference: TemplateReference; host: Assistant; reason: 'retry' | 'host-change'}
    | {action: 'cancel'; reference: TemplateReference}
    | {action: 'accept'; input: TemplateAccept}
);
export interface TemplatePendingView {mutationId: string; action: TemplatePending['action']; templateId: string; state: 'uncertain' | 'missing' | 'conflict'}
export interface TemplateRecovery {pending: TemplatePendingView | null; result: TemplateWorkflowResult | null}
export interface TemplateInputs {
    readTemplateAssistantSetup: undefined;
    readTemplateWorkflow: {templateId: string};
    startTemplateStudy: TemplateStart;
    continueTemplateStudy: TemplateReference;
    retryTemplateStudy: TemplateReference;
    cancelTemplateStudy: TemplateReference;
    acceptTemplateStudy: TemplateAccept;
    recoverTemplateMutation: undefined;
    retryTemplateMutation: undefined;
    abandonTemplateMutation: undefined;
}
export interface TemplateResults {
    readTemplateAssistantSetup: TemplateAssistantSetup;
    readTemplateWorkflow: TemplateWorkflowView;
    startTemplateStudy: TemplateWorkflowResult;
    continueTemplateStudy: TemplateWorkflowResult;
    retryTemplateStudy: TemplateWorkflowResult;
    cancelTemplateStudy: TemplateWorkflowResult;
    acceptTemplateStudy: TemplateWorkflowResult;
    recoverTemplateMutation: TemplateRecovery;
    retryTemplateMutation: TemplateWorkflowResult | null;
    abandonTemplateMutation: void;
}
export interface TemplateRequestIdentity {requestId: string; requestHash: string; sourceVersion: number; sourcePackageHash: string}
export interface TemplateWorkerOperations {
    templateRead: {args: {binding: LibraryBinding; templateId: string}; result: TemplateWorkflowView};
    templateRequest: {args: {binding: LibraryBinding; pending: TemplatePending}; result: TemplateRequestIdentity};
    templateMutate: {args: {binding: LibraryBinding; pending: TemplatePending}; result: {reference: TemplateReference | null; reportWarnings?: string[]}};
    templateRecover: {args: {binding: LibraryBinding; pending: TemplatePending}; result: {reportWarnings?: string[]; found: boolean; conflict: boolean; request: TemplateRequestIdentity | null; reference: TemplateReference | null}};
    templateHandoff: {args: {binding: LibraryBinding; reference: TemplateReference}; result: {host: Assistant}};
}
export interface TemplateWorker {call<K extends keyof TemplateWorkerOperations>(op: K, args: TemplateWorkerOperations[K]['args']): Promise<TemplateWorkerOperations[K]['result']>}
