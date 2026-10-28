const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=2000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\0');
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
export function validateSynthesisBrief(v){return keys(v,['depth','question','purpose','timeBoundary','scopeBoundary'])&&['orientation','issue','generative'].includes(v.depth)&&['question','purpose','timeBoundary','scopeBoundary'].every(k=>text(v[k],2000));}

export const validMethodRatio=value=>typeof value==='string'&&/^[1-9]\d{0,7}:[1-9]\d{0,7}$/.test(value);
