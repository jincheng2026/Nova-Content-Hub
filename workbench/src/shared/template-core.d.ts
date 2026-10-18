import type {Assistant, Attempt} from './cover-contracts.ts';
import type {TemplateRules, TemplateAcceptance} from './template-contracts.ts';
export interface TemplateCoreAttempt extends Attempt {resultHash: string | null; receiptHash: string | null; reportHash: string | null}
export interface TemplateCoreJob {id: string; requestHash: string; inputHash: string; activeAttemptId: string | null; acceptance: TemplateAcceptance | null; attempts: TemplateCoreAttempt[]}
export interface TemplateCoreDocument {id: string; title: string; editToken: string; builtin: boolean; currentVersion: number; deletedAt: string | null; versions: {version: number; packageHash: string}[]; templateJobs?: TemplateCoreJob[]}
export interface TemplateCoreRequest {requestId: string; requestHash: string; template: {id: string; version: number; packageHash: string}; styleAssetHashes: string[]}
export interface TemplateCoreContext {template: TemplateCoreDocument; request: TemplateCoreRequest; attempt: TemplateCoreAttempt; results: {requestId: string; attemptId: string; unavailable?: boolean; result: {resultHash: string; rules: TemplateRules; restore: {assetHash: string}} | null}[]}
type Options = {mutationId: string};
export interface TemplateCoreLibrary {
    readTemplate(id: string, version?: number): TemplateCoreDocument;
    readTemplateContext(templateId: string, requestId: string, attemptId: string): TemplateCoreContext;
    createTemplateRequest(templateId: string, input: {version: number; notes?: string}, editToken: string, options: Options): Promise<{template: TemplateCoreDocument; request: TemplateCoreRequest}>;
    createTemplateAttempt(templateId: string, requestId: string, input: {host: Assistant; reason: string}, options: Options): {template: TemplateCoreDocument; request: TemplateCoreRequest; attempt: TemplateCoreAttempt};
    cancelTemplateAttempt(templateId: string, requestId: string, attemptId: string, options: Options): unknown;
    acceptTemplateResult(templateId: string, input: {requestId: string; attemptId: string; requestHash: string; resultHash: string; sourceVersion: number; sourcePackageHash: string}, editToken: string, options: Options): unknown;
    queryMutation(mutationId: string): {objectId: string; objectKind: string; content: TemplateCoreDocument} | null;
}
