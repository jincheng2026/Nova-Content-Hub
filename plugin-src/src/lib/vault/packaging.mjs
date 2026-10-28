import path from 'node:path';
import fs from 'node:fs';
import {bindingForRuntime,contentSources,digest,identity,readBytes,safe,scan,withVaultReadLock} from './core.mjs';
import {orderedSegments,parseCreationHtml,protocolError} from '../creation-document/parse.mjs';
import {assertUniqueCreationPage} from '../creation-document/store.mjs';
import {extractCreationPackaging} from '../creation-document/packaging.mjs';

const empty = (kind,issues=[],extra={}) => ({kind,source:null,selectionToken:null,fields:null,script:null,issues,...extra});
const unavailable = (...issues) => empty('unavailable',issues);
const code = error => typeof error?.code === 'string' ? error.code : 'PACKAGING_READ_FAILED';
function optionalBytes(root,relative) {
    try {return readBytes(root,relative);} catch (error) {if(error.code==='ENOENT')return null;throw error;}
}
function checkedBytes(root,document) {
    const bytes = readBytes(root,document.relativePath);
    if (digest(bytes) !== document.hash) protocolError('PACKAGING_SOURCE_CHANGED');
    return bytes;
}
function journalIdentity(root,vaultId) {
    const marker = optionalBytes(root,'.workbench/pending-mutations-index.json');
    if (!marker) protocolError('PACKAGING_RECOVERY_UNVERIFIED');
    let value;
    try {value = JSON.parse(marker.toString('utf8'));} catch {protocolError('PACKAGING_RECOVERY_UNVERIFIED');}
    if (value?.format !== 'nova-vault-pending-index' || value.schemaVersion !== 1 || value.vaultId !== vaultId) protocolError('PACKAGING_RECOVERY_UNVERIFIED');
    // The migration marker certifies legacy history has been indexed. Inspect
    // one active directory entry only; never replay or scan historical receipts.
    let directory;
    try {directory = fs.opendirSync(safe(root,'.workbench/pending-mutations'));}
    catch (error) {if(error.code==='ENOENT')protocolError('PACKAGING_RECOVERY_UNVERIFIED');throw error;}
    try {if(directory.readSync())protocolError('PACKAGING_RECOVERY_REQUIRED');}
    finally {directory.closeSync();}
    return digest(marker);
}

/** Synchronous read scope only: no openLibrary, source projection, HTML evaluation or source selection mutation. */
export function readVaultPackaging(runtimeRoot,input) {return readPackaging(runtimeRoot,input,false);}
/** Cover-only compatibility does not relax the publication manuscript contract. */
export function readVaultCoverPackaging(runtimeRoot,input) {return readPackaging(runtimeRoot,input,true);}
function readPackaging(runtimeRoot,input,coverOnly) {
    const contentId = typeof input?.contentId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(input.contentId) ? input.contentId : null;
    if (!input || typeof input !== 'object' || Array.isArray(input) || !contentId || Object.keys(input).some(key => !['contentId','documentId'].includes(key)) || input.documentId !== undefined && (typeof input.documentId !== 'string' || !/^doc-[a-f0-9]{32}$/.test(input.documentId))) return {...unavailable('INVALID_PACKAGING_INPUT'),contentId};
    try {
        const binding = bindingForRuntime(runtimeRoot);
        if (!binding) return {...empty('legacy'),contentId};
        return {...withVaultReadLock(binding.vaultRoot,() => readBoundPackaging(binding,input,coverOnly)),contentId};
    } catch (error) {return {...unavailable(code(error)),contentId};}
}
function readBoundPackaging(binding,input,coverOnly) {
    const root = binding.vaultRoot, descriptorBytes = readBytes(root,'.workbench/vault.json');
    const descriptor = JSON.parse(descriptorBytes.toString('utf8')), actualRoot = identity(root);
    if (descriptor.format !== 'nova-knowledge-vault' || descriptor.schemaVersion !== 1 || descriptor.vaultId !== binding.vaultId || descriptor.rootIdentity?.dev !== actualRoot.dev || descriptor.rootIdentity?.ino !== actualRoot.ino) return unavailable('PACKAGING_VAULT_IDENTITY');
    const journalBefore = journalIdentity(root,binding.vaultId);
    const indexBefore = optionalBytes(root,'.workbench/current-drafts.json');
    const snapshot = {root,vaultId:binding.vaultId,...scan(root,binding.vaultId)};
    const work = contentSources(snapshot).find(source => source.contentId === input.contentId);
    if (!work) return unavailable('CURRENT_SOURCE_UNAVAILABLE');
    if (work.sourceResolution !== 'resolved' || work.document.sourceConflict) return unavailable('CURRENT_SOURCE_'+work.sourceResolution.toUpperCase());
    const current = work.document;
    const topicOnly = coverOnly && current.section === 'topics' && current.format === 'markdown';
    if (!topicOnly && (current.section !== 'drafts' || !['html','markdown','text'].includes(current.format))) return unavailable('CURRENT_MANUSCRIPT_UNAVAILABLE');
    const workId = work.tNumber, parsed = new Map();
    const ref = document => ({sourceId:'drafts',documentId:document.id,relativePath:document.relativePath,vaultId:binding.vaultId});
    function parse(document) {
        if (parsed.has(document.id)) return parsed.get(document.id);
        const bytes = checkedBytes(root,document);
        let entry;
        try {
            const doc = parseCreationHtml(bytes,ref(document));
            if (doc.raw.schema !== 1 || doc.raw.content_id !== undefined && doc.raw.content_id !== workId) protocolError('PACKAGING_WORK_IDENTITY');
            if (!doc.writable) protocolError('INVALID_CREATION_DOCUMENT');
            assertUniqueCreationPage(root,ref(document),doc.pageId);
            entry = {document,doc,issues:[]};
        } catch (error) {entry = {document,doc:null,ordinary:error.code==='JC_DOC_COUNT' && error.message==='JC_DOC_COUNT:0',issues:[code(error)]};}
        parsed.set(document.id,entry);
        return entry;
    }
    const pages = work.documents.filter(document => document.section === 'drafts' && document.format === 'html').map(parse);
    const rejected = snapshot.issues.filter(issue => issue.code !== 'HTML_READ_ONLY' && issue.relativePath && /\.html?$/i.test(issue.relativePath) && (issue.relativePath.startsWith(work.contentDirectory+'/') || new RegExp('(?:^|/)'+workId+'(?=[_ /.-]|$)').test(issue.relativePath)));
    const candidates = pages.filter(entry => entry.doc).map(entry => ({documentId:entry.document.id,relativePath:entry.document.relativePath,pageId:entry.doc.pageId,revision:entry.doc.revision,issues:entry.doc.issues}));
    const sourceIdentity = (document,pageId=null) => ({vaultId:binding.vaultId,workId,documentId:document.id,pageId,revision:document.hash});
    let script = null;
    if (current.format === 'html') {
        const entry = parse(current);
        if (!entry.doc && !entry.ordinary) return unavailable(...entry.issues);
        if (entry.doc) {
            if (entry.doc.issues.some(issue => /^(?:MISSING_ORDER|DUPLICATE_ORDER):/.test(issue))) return unavailable('CURRENT_MANUSCRIPT_ORDER');
            const segments = orderedSegments(entry.doc);
            if (!segments.length || segments.some(item => typeof item.fields?.mine !== 'string')) return unavailable('CURRENT_MANUSCRIPT_UNAVAILABLE');
            const text = segments.map(item => item.fields.mine).join('\n\n');
            script = {text,hash:digest(text),manuscriptSource:{...sourceIdentity(current,entry.doc.pageId),relativePath:current.relativePath,format:current.format}};
        }
    } else if (!topicOnly) {
        let text;
        try {text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(checkedBytes(root,current));} catch (error) {return unavailable(error.code??'CURRENT_MANUSCRIPT_UTF8');}
        script = {text,hash:digest(text),manuscriptSource:{...sourceIdentity(current),relativePath:current.relativePath,format:current.format}};
    }
    function verifyRead() {
        if (journalIdentity(root,binding.vaultId) !== journalBefore) protocolError('PACKAGING_RECOVERY_UNVERIFIED');
        if (digest(readBytes(root,'.workbench/vault.json')) !== digest(descriptorBytes)) protocolError('PACKAGING_VAULT_CHANGED');
        const indexAfter = optionalBytes(root,'.workbench/current-drafts.json');
        if (digest(indexAfter??'') !== digest(indexBefore??'')) protocolError('CURRENT_SOURCE_CHANGED');
        const selectionFiles = snapshot.documents.filter(document => document.relativePath === '05_内容草稿/00_草稿总览.md' || document.contentId === input.contentId && (document.section === 'topics' || path.posix.basename(document.relativePath) === '创作过程.json'));
        for (const document of new Map([current,...selectionFiles,...pages.map(entry => entry.document)].map(document => [document.id,document])).values()) checkedBytes(root,document);
    }
    const selected = input.documentId ? pages.find(entry => entry.document.id === input.documentId) : current.format === 'html' ? parse(current) : null;
    if (input.documentId && !selected) return unavailable('PACKAGING_SOURCE_NOT_IN_WORK');
    if (topicOnly) {
        // Source resolution already distinguishes manuscripts from supporting
        // material. Existing creation originals still require their own guards.
        if (input.documentId || rejected.length || pages.some(entry => !entry.ordinary)) return unavailable('CURRENT_MANUSCRIPT_UNAVAILABLE');
        let text;
        try {text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(checkedBytes(root,current));} catch (error) {return unavailable(error.code??'CURRENT_TOPIC_UTF8');}
        if (!text.trim() || !work.title?.trim()) return unavailable('CURRENT_TOPIC_UNAVAILABLE');
        verifyRead();
        return empty('legacy',[],{context:{kind:'topic',text,hash:digest(text),source:{...sourceIdentity(current),relativePath:current.relativePath,format:current.format}}});
    }
    if (coverOnly && !input.documentId && script && !script.text.trim() && work.title?.trim() && ['markdown','text'].includes(current.format) && !candidates.length && !rejected.length && pages.every(entry => entry.ordinary)) {
        verifyRead();
        return empty('legacy',[],{context:{kind:'title-only',text:script.text,hash:script.hash,source:script.manuscriptSource}});
    }
    if (coverOnly && (!input.documentId || selected?.doc) && script?.text.trim() && !rejected.length && pages.every(entry => entry.ordinary || entry.doc && !entry.doc.items.some(item => item.kind === 'pubslot'))) {
        verifyRead();
        return empty('legacy',[],{script,context:{kind:'manuscript',text:script.text,hash:script.hash,source:script.manuscriptSource}});
    }
    if (!candidates.length) {
        const damaged = pages.filter(entry => !entry.ordinary);
        if (damaged.length || rejected.length) return unavailable('PACKAGING_SOURCE_UNREADABLE',...damaged.flatMap(entry => entry.issues));
        if (input.documentId) return unavailable('PACKAGING_SOURCE_INVALID');
        if (script && !script.text.trim()) return unavailable('CURRENT_MANUSCRIPT_UNAVAILABLE');
        verifyRead();
        return empty('legacy',[],{script});
    }
    if (selected && !selected.doc) return unavailable(...selected.issues,'PACKAGING_SOURCE_INVALID');
    if (!script || !script.text.trim()) return unavailable('CURRENT_MANUSCRIPT_UNAVAILABLE');
    if (!selected) {verifyRead();return empty('choose-source',['PACKAGING_SOURCE_SELECTION_REQUIRED'],{script,candidates});}
    const {fields,issues} = extractCreationPackaging(selected.doc), source = sourceIdentity(selected.document,selected.doc.pageId);
    // Portable business identity excludes physical descriptor/root identity. The
    // binding checks above and verifyRead below still guard the actual IO root.
    const selectionToken = digest(JSON.stringify({version:2,contentId:input.contentId,source,fields:Object.fromEntries(Object.entries(fields).map(([name,field]) => [name,field?{itemId:field.itemId,hash:field.hash}:null])),manuscriptSource:script.manuscriptSource,scriptHash:script.hash}));
    verifyRead();
    return {kind:'jc-doc',source,selectionToken,fields,script,issues};
}
