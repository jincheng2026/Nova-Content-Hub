import {openLibrary} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {LibraryBinding} from '../shared/contracts.ts';

// Cache a handle, never document/asset data. Every method retains the core lock,
// recovery, current descriptor/root identity, and current-byte validation.
let current: {key: string; library: ReturnType<typeof openLibrary>} | undefined;
export function forgetBoundReader() { current = undefined; }
export function boundReader(binding: LibraryBinding) {
    const key = JSON.stringify([binding.root, binding.libraryId, binding.rootIdentity.dev, binding.rootIdentity.ino]);
    if (current?.key !== key) {
        current = undefined;
        current = {key, library: openLibrary(binding.root, {expectedLibraryId: binding.libraryId, expectedRootIdentity: binding.rootIdentity})};
    }
    return current.library;
}
