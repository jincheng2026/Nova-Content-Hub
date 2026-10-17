// The existing ESM core owns validation and persistence; this seam declares only the desktop's finite calls.
declare module '*browser-import/index.mjs' {
  export function inspectBrowserBackup(source: string): import('./contracts.ts').Inspection;
  export function getBrowserImport(destination: string, importId?: string): import('./contracts.ts').ImportTask | null;
  export function importBrowserBackup(source: string, destination: string, options: { expectedSourceHash: string }): Promise<import('./contracts.ts').ImportTask>;
  export function resumeBrowserImport(destination: string, importId: string): Promise<import('./contracts.ts').ImportTask>;
}
declare module '*file-library/index.mjs' {
  export function openLibrary(destination: string): {
    info: { libraryId: string };
    listContents(): (import('./contracts.ts').Content & { editToken: string })[];
    readContent(id: string): import('./contracts.ts').Content & { editToken: string };
    updateContent(id: string, changes: { body: string }, editToken: string): unknown;
  };
}
