declare module '*browser-import/index.mjs' {
    export function inspectBrowserBackup(source: string): import('./contracts.ts').Inspection;

    export function getBrowserImport(destination: string, importId?: string): import('./contracts.ts').ImportTask | null;

    export function importBrowserBackup(source: string, destination: string, options: {
        expectedSourceHash: string
    }): Promise<import('./contracts.ts').ImportTask>;

    export function resumeBrowserImport(destination: string, importId: string): Promise<import('./contracts.ts').ImportTask>;
}
declare module '*file-library/index.mjs' {
    interface Library {
        info: { root: string; libraryId: string; rootIdentity: import('./contracts.ts').RootIdentity };

        listContents(): import('./contracts.ts').Content[];

        listTrash(): import('./contracts.ts').Content[];

        readContent(id: string): import('./contracts.ts').Content;

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

        queryMutation(id: string): { objectId: string } | null;
    }

    export function openLibrary(destination: string, options?: {
        expectedLibraryId: string;
        expectedRootIdentity: import('./contracts.ts').RootIdentity
    }): Library;

    export function createLibrary(destination: string, options?: {
        expectedRootIdentity: import('./contracts.ts').RootIdentity
    }): Library;
}
