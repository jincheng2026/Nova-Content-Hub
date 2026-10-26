declare module '*lib/package-snapshot.mjs' {
    export type PackageEntry = {directory: true} | {link: string} | {sha256: string; bytes: number; executable: boolean};
    export function snapshotPackage(input: string, expected?: Record<string, PackageEntry>): Promise<Record<string, PackageEntry>>;
}
declare module '*file-library/index.mjs' {
    export class LibraryError extends Error { code: string; constructor(code: string, message: string, details?: Record<string, unknown>); }
    interface Library {
        listPhotos(): import('./cover-contracts.ts').Photo[];
        readPhoto(id: string): import('./cover-contracts.ts').Photo & { editToken: string };
        updatePhoto(id: string, input: { isOwnPhoto: boolean }, token: string): unknown;
        createPhoto(input: { title: string; originalName: string; assetHash: string; isOwnPhoto: boolean }, options: { mutationId: string }): import('./cover-contracts.ts').Photo;
        readAsset(hash: string): { assetHash: string; bytes: number; detectedType: string; data: Uint8Array };
        importAsset(source: string, options: { purpose: 'photo' }): { assetHash: string };
        listTemplates(): (import('./template-core.d.ts').TemplateCoreDocument)[];
        rebuildTemplateReports(id: string): {warnings: string[]};
        readTemplate(id: string, version?: number): import('./template-core.d.ts').TemplateCoreDocument & { definition: Record<string, unknown>; resources: Record<string, { assetHash: string; role: string }> };
        readTemplateContext(templateId: string, requestId: string, attemptId: string): import('./template-core.d.ts').TemplateCoreContext;
        inspectCoverInput(id: string, input: import('./cover-contracts.ts').CoverInput, token: string): import('./cover-contracts.ts').Fingerprint;
        findCoverRequest(id: string, fingerprint: { inputHash: string; title: string; bodyHash: string }): import('./cover-contracts.ts').RequestResult | null;
        createCoverRequest(id: string, input: import('./cover-contracts.ts').CoverInput, token: string, options: { mutationId: string }): import('./cover-contracts.ts').RequestResult;
        createCoverAttempt(id: string, requestId: string, input: { host: import('./cover-contracts.ts').Assistant; reason: string }, options: { mutationId: string }): { attempt: import('./cover-contracts.ts').Attempt };
        readCoverState(id: string): {content: ReturnType<Library['readContent']>; progress: import('./cover-contracts.ts').TaskProgressView; requests: Map<string, ReturnType<Library['readCoverContext']>['request'] | null>};
        readCoverProgress(id: string): import('./cover-contracts.ts').TaskProgressView;
        readCoverContext(id: string, requestId: string, attemptId: string): import('./cover-contracts.ts').CoverContext & { inbox: string; inputs: { assetHash: string }[]; request: import('./cover-contracts.ts').CoverContext['request'] & Pick<import('./cover-contracts.ts').CoverInput, 'template' | 'styleAssetHashes' | 'photo' | 'pixels' | 'sizePolicy' | 'count' | 'ratio' | 'outputFormat'> };
        claimCoverAttempt(id: string, requestId: string, attemptId: string, input: { host: 'codex' | 'workbuddy'; readAssetHashes: string[] }): unknown;
        commitCoverAttempt(id: string, requestId: string, attemptId: string, receipt: unknown): Promise<unknown>;
        cancelCoverAttempt(id: string, requestId: string, attemptId: string, options: { mutationId: string }): unknown;
        selectContentCover(id: string, candidateId: string, token: string, options: { mutationId: string }): unknown;

    info: { root: string; libraryId: string; rootIdentity: import('./contracts.ts').RootIdentity };

        readLibrarySettings(): { channels: { id: string; name: string; deletedAt: string | null }[] };

        listPrompts(): import('./contracts.ts').WorkspacePrompt[];

        readPrompt(id: string): import('./contracts.ts').WorkspacePrompt;

        listContents(): ReturnType<Library['readContent']>[];
        listAllContents(): ReturnType<Library['readContent']>[];

        listTrash(): ReturnType<Library['readContent']>[];

        readContent(id: string): import('./contracts.ts').Content & { createdAt: string; updatedAt: string; plans?: (Omit<import('./contracts.ts').WorkspacePlan, 'schedule'> & { schedule?: import('./contracts.ts').WorkspacePlan['schedule']; scheduledAt?: string; timezone?: string; publicationId?: string })[]; publications?: { id: string; planId: string; schedule?: import('./contracts.ts').WorkspacePlan['schedule']; publishedAt?: string; timezone?: string }[]; coverJobs?: import('./cover-contracts.ts').CoverJob[]; candidates?: Omit<import('./cover-contracts.ts').Candidate, 'url'>[]; selectedCover?: { candidateId: string } | null };

        createContent(input: import('./contracts.ts').Draft, options?: {
            mutationId: string
        }): import('./contracts.ts').Content;

        updateContent(id: string, changes: Partial<import('./contracts.ts').Draft>, editToken: string, options?: {
            mutationId: string
        }): import('./contracts.ts').Content;

        trashContent(id: string, editToken: string, options?: { mutationId: string }): import('./contracts.ts').Content;

        restoreContent(id: string, editToken: string, options?: {
            mutationId: string
        }): import('./contracts.ts').Content;

        queryMutation(id: string): { objectId: string ; objectKind: string; content: { coverJobs?: import('./cover-contracts.ts').CoverJob[] } } | null;
    }

    export function openLibrary(destination: string, options?: {
        expectedLibraryId: string;
        expectedRootIdentity: import('./contracts.ts').RootIdentity
    }): Library;

    export function createLibrary(destination: string, options?: {
        expectedRootIdentity: import('./contracts.ts').RootIdentity
    }): Library;
}
declare module '*library-seed/index.mjs' { export function installBuiltins(library: unknown): unknown; }
declare module '*image-validation/index.mjs' { export function validateImportedRaster(bytes: Uint8Array): Promise<{ assetHash: string; format: string; width: number; height: number }>; }
declare module '*bridge/native-handoff.mjs' { export function openNativeHandoff(handoff: {url: string; prompt: string; requiresPaste: boolean}, effects: {copyText(text: string): void | Promise<void>; confirmPaste(text: string): Promise<boolean>; openExternal(url: string): Promise<void>}): Promise<void>; export function nativeHandoffDirectory(appData: string): string; export function prepareNativeHandoff(directory: string, binding: import('./contracts.ts').LibraryBinding, reference: {templateId: string; requestId: string; attemptId: string; requestHash: string; host: import('./cover-contracts.ts').Assistant}, release: import('./contracts.ts').Release, options: {kind: 'template'; installedSkill: 'nova-content-template-execution'}): Promise<{id: string; url: string; prompt: string; requiresPaste: boolean}>; export function prepareNativeHandoff(directory: string, binding: import('./contracts.ts').LibraryBinding, reference: import('./cover-contracts.ts').CoverReference & { requestHash: string; host: import('./cover-contracts.ts').Assistant }, release: import('./contracts.ts').Release, options: { installedSkill: 'nova-content-cover-execution' }): Promise<{ id: string; url: string; prompt: string; requiresPaste: boolean }>; }
