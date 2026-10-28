import {createHash} from 'node:crypto';
import type {LibraryBinding} from '../shared/contracts.ts';
/** Opaque physical-library identity; never a renderer-selected location. */
export const productionLibraryScope=(binding:LibraryBinding)=>createHash('sha256').update(JSON.stringify([binding.libraryId,binding.root,binding.rootIdentity.dev,binding.rootIdentity.ino])).digest('hex');
