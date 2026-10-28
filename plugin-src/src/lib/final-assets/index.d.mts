import type {Buffer} from 'node:buffer';
import type {PackagingSource} from '../vault/packaging.mjs';
export type FinalAssetWarning = 'COVER_SOURCE_DIFFERENT'|'COVER_SOURCE_UNKNOWN';
export type FinalAssetSelection = {contentId:string;packagingDocumentId?:string;manuscript:{kind:'current'}|{kind:'recorded';documentId:string}};
export type FinalAssetSaveInput = FinalAssetSelection & {expectedPreviewToken:string;expectedCurrentHash:string|null;acknowledgedWarnings:FinalAssetWarning[]};
export type FinalWork = {vaultId:string;workId:string};
export type FinalManuscript =
 | (PackagingSource & {kind:'current-document';relativePath:string;format:'markdown'|'text';hash:string})
 | (PackagingSource & {kind:'jc-doc-segments';pageId:string;relativePath:string;hash:string;segments:{itemId:string;hash:string}[]})
 | (PackagingSource & {kind:'recorded';pageId:string;relativePath:string;infoItemId:string;hash:string});
export type FinalCoverProvenance =
 | {kind:'generated';requestId:string;requestHash:string;attemptId:string;receiptHash:string;template:unknown;designSource?:unknown;packagingSource:unknown|null;bodyHash:string|null}
 | {kind:'imported';importId:string;originalName:string;assetHash:string}
 | {kind:'legacy';unknown:true};
export type FinalCover = {candidateId:string;assetHash:string;selectedAt:string;mime:'image/png'|'image/jpeg'|'image/webp'|'image/gif';width:number;height:number;bytes:number;provenance:FinalCoverProvenance;sourceMatch:'current'|'different'|'unknown'};
export type FinalPackaging = PackagingSource & {pageId:string;selectionToken:string;slots:Record<'title'|'coverText'|'description',{itemId:string;hash:string}>};
export type FinalAssetRole = 'script'|'title'|'description'|'coverText'|'cover'|'sources'|'readme';
export type FinalAssetFile = {role:FinalAssetRole;name:string;sha256:string;bytes:number;mime:string};
export type FinalManifest = {format:'nova-final-assets';schemaVersion:1;bundleId:string;work:FinalWork;contentIdAtSave:string;adoptedAt:string;adoption:{kind:'author-save';mutationId:string;previewToken:string};packaging:FinalPackaging;manuscript:FinalManuscript;cover:FinalCover;files:FinalAssetFile[]};
export type CurrentFinalAssets = {format:'nova-final-assets-current';schemaVersion:1;work:FinalWork;bundleId:string;manifestHash:string;mutationId:string;adoptedAt:string};
/** A finite, verified native resource identity, never a renderer-supplied filesystem path. */
export type FinalAssetResource = {contentId:string;bundleId:string;manifestHash:string;role:FinalAssetRole};
export type FinalAssetsPreview = {contentId:string;work:FinalWork;texts:{script:string;title:string;description:string;coverText:string};packaging:FinalPackaging;manuscript:FinalManuscript;cover:FinalCover;warnings:FinalAssetWarning[];previewToken:string;currentHash:string|null};
export type FinalBundleSummary = {bundleId:string;manifestHash:string;adoptedAt:string;complete:boolean;issues:string[]};
export type FinalSavedBundle = {bundleId:string;manifestHash:string;relativeDirectory:string;manifest:FinalManifest;texts:FinalAssetsPreview['texts'];cover:FinalCover & {resource:FinalAssetResource}};
export type FinalAssetsView = {contentId:string;work:FinalWork|null;current:(CurrentFinalAssets & {hash:string})|null;bundles:FinalBundleSummary[];selected:FinalSavedBundle|null;sourceState:'current'|'changed'|'unavailable'|'not-checked';issues:{code:string;message:string;mutationId?:string;relativePath?:string}[]};
/** Export is a native-only frozen byte list; no live source/runtime asset reads. */
export type VerifiedBundle = {contentId:string;bundleId:string;manifestHash:string;manifest:FinalManifest;files:{name:string;sha256:string;mime:string;bytes:Buffer}[]};
export type SelectedCoverSnapshot = Omit<FinalCover,'sourceMatch'|'bytes'> & {contentId:string;bytes:Buffer;decoded:true};
/** Trusted code/test dependency only. Never forward this object through DTO/IPC. */
export type FinalAssetsDependencies = {readSelectedCoverSnapshot?:(runtimeRoot:string,input:{contentId:string})=>SelectedCoverSnapshot};
export function readFinalAssets(runtimeRoot:string,input:{contentId:string;bundleId?:string}):FinalAssetsView;
export function previewFinalAssets(runtimeRoot:string,input:FinalAssetSelection,h?:FinalAssetsDependencies):FinalAssetsPreview;
export function saveFinalAssets(runtimeRoot:string,input:FinalAssetSaveInput,options:{mutationId:string},h?:FinalAssetsDependencies):FinalAssetsView;
export function readFinalAssetExport(runtimeRoot:string,input:{contentId:string;bundleId:string;manifestHash:string}):VerifiedBundle;
export function applyFinalAssetsReceipt(vaultRoot:string,receipt:unknown):FinalAssetsView;
