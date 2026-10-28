import type {CreationDocument} from './index.mjs';
export type PackagingField = {itemId:string;value:string;hash:string};
export type PackagingFields = {title:PackagingField|null;coverText:PackagingField|null;description:PackagingField|null};
/** Exact pubslot/locked.slot fields.final extraction; empty strings are explicit values. */
export function extractCreationPackaging(doc:CreationDocument):{fields:PackagingFields;issues:string[]};
