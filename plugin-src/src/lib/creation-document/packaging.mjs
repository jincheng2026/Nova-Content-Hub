import {sha256} from './fingerprint.mjs';
import {isRecord} from './parse.mjs';
const SLOTS = Object.freeze({title:'标题',coverText:'封面文字',description:'简介'});

/** Read author-selected values only. Candidates, labels and page titles are not fallbacks. */
export function extractCreationPackaging(doc) {
    const fields = {title:null,coverText:null,description:null};
    const issues = [...(Array.isArray(doc?.issues) ? doc.issues : [])];
    const items = Array.isArray(doc?.items) ? doc.items : [];
    if (!Array.isArray(doc?.items)) issues.push('INVALID_PACKAGING_ITEMS');
    const counts = new Map();
    for (const item of items) if (isRecord(item)) counts.set(item.id,(counts.get(item.id)??0)+1);
    for (const [name,slot] of Object.entries(SLOTS)) {
        const matches = items.filter(item => item?.kind === 'pubslot' && item.locked?.slot === slot);
        if (!matches.length) {issues.push('MISSING_PACKAGING_SLOT:'+slot);continue;}
        if (matches.length !== 1) {issues.push('DUPLICATE_PACKAGING_SLOT:'+slot);continue;}
        const item = matches[0];
        if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || /^\d+$/.test(item.id)) {issues.push('INVALID_PACKAGING_ITEM_ID:'+slot);continue;}
        if (counts.get(item.id) !== 1) {issues.push('DUPLICATE_ITEM_ID:'+item.id);continue;}
        if (!isRecord(item.fields) || typeof item.fields.final !== 'string') {issues.push('INVALID_PACKAGING_FINAL:'+slot);continue;}
        fields[name] = {itemId:item.id,value:item.fields.final,hash:sha256(item.fields.final)};
    }
    return {fields,issues:[...new Set(issues)]};
}
