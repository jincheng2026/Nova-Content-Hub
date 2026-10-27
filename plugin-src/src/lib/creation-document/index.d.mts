export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type SourceRef = {sourceId:string;documentId:string;relativePath?:string;vaultId?:string;writable?:boolean};
export type WorkRef = {vaultId:string;workId:string};
export type RawItem = {id:string;kind?:string;locked:Record<string,Json>;fields:Record<string,string>} & Record<string,Json | undefined>;
export type CreationDocument = {source:SourceRef;revision:string;pageId:string;raw:Record<string,Json>;items:RawItem[];writable:boolean;issues:string[]};
export type FieldEdit = {itemId:string;field:string;before:string;after:string;itemFingerprint:string};
/** Constructed by the trusted main/host adapter. Renderer input must never supply actor. */
export type WriteActor = {kind:'author'} | {kind:'assistant';taskId:string;requestId:string};
export type EditGroup = {mutationId:string;source:SourceRef;baseRevision:string;pageId:string;actor:WriteActor;edits:FieldEdit[]};
export type CommitResult = {revision:string;mutationId:string;receiptHash:string;changedFields:string[]};
export function parseCreationHtml(bytes:Uint8Array,source:SourceRef):CreationDocument;
export function replaceCreationData(bytes:Uint8Array,doc:CreationDocument):Uint8Array;
export function orderedSegments(doc:CreationDocument):RawItem[];
export function kindOf(item:RawItem):string|null;
export function itemFingerprint(item:RawItem):string;
export function applyEditGroup(current:CreationDocument,group:EditGroup):CreationDocument;
/** root is the explicitly selected Vault root; source.relativePath is required for filesystem access. */
export function readCreationDocument(root:string,source:SourceRef):Promise<CreationDocument>;
export function commitCreationEdit(root:string,group:EditGroup):Promise<CommitResult>;
export type KitChange = {change_id:string;item_id:string;field:string;before:string;after:string;item_fp:string;group?:string};
export type KitResult = {change_id:string;status:'ok'|'conflict';reason:string;current?:string;item_fp?:string;group?:string};
export type KitSaveResult = CommitResult & {results:KitResult[];base_fingerprint:string;fingerprint:string;path:string};
export function saveCreationChanges(root:string,input:{source:SourceRef;pageId:string;changes:KitChange[];mutationId:string;actor:WriteActor}):Promise<KitSaveResult>;
export function replyToNote(root:string,input:{source:SourceRef;itemId:string;handledNote:string;reply:string;expectedFingerprint:string;actor:WriteActor;mutationId:string}):Promise<CommitResult>;
export type BuildInput = {work:WorkRef;source:SourceRef;data:Record<string,Json>;templateVersion:string;mutationId:string};
export function assembleCreationData(data:Record<string,Json>,old?:Record<string,Json>|null,options?:{removeItemIds?:string[];authorDecisionId?:string}):{raw:Record<string,Json>;warnings:string[]};
export function exportCreationData(doc:CreationDocument):Record<string,Json>;
export function renderCreationHtml(raw:Record<string,Json>,options?:{mode?:'standalone-readonly'|'trusted-frame'}):Uint8Array;
export function buildCreationPage(root:string,input:BuildInput):Promise<CommitResult & {pageId:string}>;
export function regenerateCreationPage(root:string,input:BuildInput & {expectedRevision:string;removeItemIds?:string[];authorDecisionId?:string}):Promise<CommitResult>;
export type StructureAction = {kind:'append-suggestion'|'append-item'|'set-locked'|'reorder'|'rebase'|'remove-items';payload:Record<string,Json>};
export function commitCreationStructure(root:string,input:{source:SourceRef;expectedRevision:string;actor:WriteActor;action:StructureAction;mutationId:string;authorDecisionId?:string}):Promise<CommitResult>;
export function noteStatus(item:RawItem):'empty'|'pending'|'handled';
export function buildSuggestionEdits(doc:CreationDocument,input:{suggestionId:string;decision:'采纳'|'不采纳'|'部分采纳';proposed?:string;partialMine?:string}):FieldEdit[];
export function applyKitChanges(current:CreationDocument,changes:KitChange[],actor:WriteActor):{doc:CreationDocument;results:KitResult[]};
/** Trusted author-controller API only; never expose through an assistant command. */
export function saveKitChanges(root:string,source:SourceRef,input:{mutationId:string;page_id:string;token:string;changes:KitChange[]}):Promise<KitSaveResult>;
export type ChangeRecord = {time:string;change_id:string;item:string;field:string;before:string;after:string;origin:string;group?:string};
export function readHistory(root:string,source:SourceRef,itemId?:string):Promise<{changes:ChangeRecord[]}>;

export function loadTrustedCreationTemplate():{parts:{shell:string;style:string;app:string;kit:string};version:string};
export function validateBuildData(data:Record<string,Json>):void;

/** Trusted author-controller only; persists exact revision and item IDs for destructive operations. */
export function confirmCreationRemoval(root:string,input:{source:SourceRef;expectedRevision:string;itemIds:string[];mutationId:string}):Promise<{decisionId:string;decisionHash:string}>;
