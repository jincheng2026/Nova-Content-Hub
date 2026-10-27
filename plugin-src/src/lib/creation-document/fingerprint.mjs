import {createHash} from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const norm = value => typeof value === 'string' ? value.replace(/\r\n?/g,'\n').normalize('NFC') : value;
// Match kit.js canon, including normalized keys and JavaScript number encoding.
function canon(value) {
 if(typeof value==='string')return JSON.stringify(norm(value));
 if(Array.isArray(value))return '['+value.map(canon).join(',')+']';
 if(value && typeof value==='object')return '{'+Object.keys(value).map(k=>[norm(k),value[k]]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>JSON.stringify(k)+':'+canon(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function itemFingerprint(item) {
 const locked={...(item?.locked??{})}; delete locked.ai_state;
 return sha256(canon(locked)).slice(0,12);
}
