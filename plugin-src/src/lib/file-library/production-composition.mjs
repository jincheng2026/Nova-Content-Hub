// This factory is also injected into the controlled creation page. Keep it browser-safe.
export function productionCompositionRuntime() {
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,hash=/^[a-f0-9]{64}$/;
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const fields=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
    const text=value=>typeof value==='string'&&value.length<=100000;
    const error=(code,message)=>{throw Object.assign(new Error(message),{code});};
    function bodyHash(body) {
        // SHA-256 over UTF-8, identical to the content store; no asynchronous rebase.
        const bytes=new TextEncoder().encode(body),length=Math.ceil((bytes.length+9)/64)*64,data=new Uint8Array(length);
        data.set(bytes);data[bytes.length]=128;const view=new DataView(data.buffer),bits=bytes.length*8;view.setUint32(length-8,Math.floor(bits/4294967296));view.setUint32(length-4,bits>>>0);
        const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),rotr=(v,n)=>(v>>>n)|(v<<(32-n));
        for(let offset=0;offset<length;offset+=64){for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10));}let [a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const first=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,second=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+first)|0;d=c;c=b;b=a;a=(first+second)|0;}[a,b,c,d,e,f,g,j].forEach((value,i)=>{h[i]=(h[i]+value)|0;});}
        return h.map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
    }
    const position=(body,quote)=>{if(!quote)return -1;const at=body.indexOf(quote);return at>=0&&body.indexOf(quote,at+1)<0?at:-1;};
    const boundary=(body,index)=>index===0||index===body.length||!(body.charCodeAt(index-1)>=0xD800&&body.charCodeAt(index-1)<=0xDBFF&&body.charCodeAt(index)>=0xDC00&&body.charCodeAt(index)<=0xDFFF);
    function validComposition(value,body,expectedHash,referenceIds) {
        if(!fields(value,['version','bodyHash','segments'])||value.version!==1||!hash.test(value.bodyHash)||!Array.isArray(value.segments)||value.segments.length>2000)return false;
        if(expectedHash!==undefined&&value.bodyHash!==expectedHash)return false;
        let end=0;const ids=new Set();
        return value.segments.every(segment=>{
            if(!fields(segment,['id','start','end','title','purpose','references','visual'])||!uuid.test(segment.id)||ids.has(segment.id)||!Number.isSafeInteger(segment.start)||!Number.isSafeInteger(segment.end)||segment.start<end||segment.end<=segment.start||!['title','purpose','visual'].every(key=>text(segment[key]))||!Array.isArray(segment.references)||segment.references.length>1000)return false;
            if(body!==undefined&&(segment.end>body.length||!boundary(body,segment.start)||!boundary(body,segment.end)))return false;
            ids.add(segment.id);end=segment.end;
            return segment.references.every(ref=>fields(ref,['referenceId','role','quote','startMs','endMs','visual'])&&uuid.test(ref.referenceId)&&(!referenceIds||referenceIds.includes(ref.referenceId))&&['primary','support','example'].includes(ref.role)&&text(ref.quote)&&text(ref.visual)&&(ref.startMs===null&&ref.endMs===null||Number.isFinite(ref.startMs)&&ref.startMs>=0&&Number.isFinite(ref.endMs)&&ref.endMs>=ref.startMs));
        });
    }
    function assertComposition(value,body) {if(!validComposition(value,body,bodyHash(body)))error('STALE_INPUT','段落对应的正文版本已变化，或段落范围无效；请核对后继续。');}
    function createComposition(body,createId=()=>globalThis.crypto.randomUUID()) {
        const segments=[];for(const match of body.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g)){if(!match[0].trim())continue;segments.push({id:createId(),start:match.index,end:match.index+match[0].length,title:`第 ${segments.length+1} 段`,purpose:'',references:[],visual:''});}
        return {version:1,bodyHash:bodyHash(body),segments};
    }
    function migrateComposition(composition,previousBody,body) {
        assertComposition(composition,previousBody);const segments=[],unmatchedSegments=[];
        for(const segment of composition.segments){const quote=previousBody.slice(segment.start,segment.end),start=position(body,quote);if(start<0){unmatchedSegments.push({...segment,quote});continue;}segments.push({...segment,start,end:start+quote.length});}
        segments.sort((a,b)=>a.start-b.start);const overlaps=new Set();for(let i=1;i<segments.length;i++)if(segments[i].start<segments[i-1].end){overlaps.add(segments[i].id);overlaps.add(segments[i-1].id);}for(const segment of segments.filter(value=>overlaps.has(value.id)))unmatchedSegments.push({...segment,quote:previousBody.slice(composition.segments.find(value=>value.id===segment.id).start,composition.segments.find(value=>value.id===segment.id).end)});
        return {composition:{version:1,bodyHash:bodyHash(body),segments:segments.filter(value=>!overlaps.has(value.id))},unmatchedSegments};
    }
    function replaceSegment({body,composition,segmentId,replacement}) {
        assertComposition(composition,body);const segment=composition.segments.find(value=>value.id===segmentId);if(!segment||typeof replacement!=='string'||!replacement.length)error('INVALID_INPUT','段落不存在，或修改后的段落为空。');
        const nextBody=body.slice(0,segment.start)+replacement+body.slice(segment.end),delta=replacement.length-(segment.end-segment.start);
        return {body:nextBody,composition:{...composition,bodyHash:bodyHash(nextBody),segments:composition.segments.map(value=>value.id===segmentId?{...value,end:value.start+replacement.length}:value.start>=segment.end?{...value,start:value.start+delta,end:value.end+delta}:value)}};
    }
    function knownSegment(body,composition,segmentId) {
        assertComposition(composition,body);const index=composition.segments.findIndex(value=>value.id===segmentId);if(index<0)error('INVALID_INPUT','找不到要编辑的段落，原稿保留。');return {segment:composition.segments[index],index};
    }
    function splitSegment({body,composition,segmentId,offset,filming,createId=()=>globalThis.crypto.randomUUID()}) {
        const {segment,index}=knownSegment(body,composition,segmentId);
        if(!Number.isSafeInteger(offset)||offset<=segment.start||offset>=segment.end||!boundary(body,offset))error('INVALID_INPUT','请将光标放在段落中间的完整字符边界，再拆分。');
        if(composition.segments.length>=2000)error('INVALID_INPUT','段落数量已达到上限。');
        const id=createId();if(!uuid.test(id)||composition.segments.some(value=>value.id===id))error('INVALID_INPUT','新段落编号无效或重复。');
        const first={...segment,end:offset},second={...segment,id,start:offset,title:segment.title?segment.title+'（续）':'接续段落',references:segment.references.map(value=>({...value}))},segments=[...composition.segments.slice(0,index),first,second,...composition.segments.slice(index+1)];
        // A uniquely located shot fully inside the second half follows that half. Spanning
        // shots keep their original identity for explicit review in the recording view.
        const nextFilming=filming?{...filming,shots:filming.shots.map(shot=>{if(shot.segmentId!==segment.id)return {...shot};const at=position(body,shot.quote);return at>=offset&&at+shot.quote.length<=segment.end?{...shot,segmentId:id}:{...shot};})}:undefined;
        return {body,composition:{...composition,segments},...(nextFilming?{filming:nextFilming}:{})};
    }
    function mergeSegment({body,composition,segmentId,filming}) {
        const {segment,index}=knownSegment(body,composition,segmentId),next=composition.segments[index+1];if(!next)error('INVALID_INPUT','当前段落之后没有可合并的段落。');
        const references=[...segment.references.map(value=>({...value}))];for(const reference of next.references)if(!references.some(value=>JSON.stringify(value)===JSON.stringify(reference)))references.push({...reference});
        if(references.length>1000)error('INVALID_INPUT','合并后的来源关联超过上限，请先核对来源。');
        const join=(a,b)=>[a,b].filter(Boolean).join('\n'),merged={...segment,end:next.end,references,purpose:join(segment.purpose,next.purpose),visual:join(segment.visual,next.visual)};if(merged.purpose.length>100000||merged.visual.length>100000)error('INVALID_INPUT','合并后的用途或画面超出长度限制。');
        return {body,composition:{...composition,segments:[...composition.segments.slice(0,index),merged,...composition.segments.slice(index+2)]},...(filming?{filming:{...filming,shots:filming.shots.map(shot=>({...shot,...(shot.segmentId===next.id?{segmentId:segment.id}:{})}))}}:{})};
    }
    function deleteSegment({body,composition,segmentId,filming}) {
        const {segment}=knownSegment(body,composition,segmentId),length=segment.end-segment.start,nextBody=body.slice(0,segment.start)+body.slice(segment.end),segments=composition.segments.filter(value=>value.id!==segmentId).map(value=>value.start>=segment.end?{...value,start:value.start-length,end:value.end-length}:{...value});
        // Orphaned shots intentionally remain available for reassignment or explicit removal.
        return {body:nextBody,composition:{...composition,bodyHash:bodyHash(nextBody),segments},...(filming?{filming:{...filming,shots:filming.shots.map(shot=>({...shot})),readThroughBodyHash:null,recordedBodyHash:null}}:{})};
    }
    function filmingScript(body,composition,filming) {
        assertComposition(composition,body);const cell=value=>String(value??'').replaceAll('\t',' ').replace(/\r?\n/g,' / '),rows=[['段落','口播','画面','制作分工','录屏步骤']];
        for(const segment of composition.segments){const shots=(filming?.shots??[]).filter(shot=>shot.segmentId===segment.id||!shot.segmentId&&position(body,shot.quote)>=segment.start&&position(body,shot.quote)+shot.quote.length<=segment.end);rows.push([segment.title,body.slice(segment.start,segment.end),[segment.visual,...shots.map(shot=>shot.visual)].filter(Boolean).join('\n'),shots.map(shot=>({screen:'录屏',self:'本人口播',editing:'后期'})[shot.owner]).join('、'),shots.flatMap(shot=>(shot.steps??[]).map(step=>[step.where,step.prompt,step.expect,step.caution].filter(Boolean).join('；'))).join('\n')]);}
        return rows.map(row=>row.map(cell).join('\t')).join('\n');
    }
    function validAdoptions(values) {return Array.isArray(values)&&values.length<=10000&&values.every(value=>fields(value,['taskId','attemptId','receiptHash','bodyHash','at','artifactIds'])&&uuid.test(value.taskId)&&uuid.test(value.attemptId)&&hash.test(value.receiptHash)&&hash.test(value.bodyHash)&&typeof value.at==='string'&&(()=>{try{return new Date(value.at).toISOString()===value.at;}catch{return false;}})()&&(value.artifactIds===undefined||Array.isArray(value.artifactIds)&&value.artifactIds.length>0&&new Set(value.artifactIds).size===value.artifactIds.length&&value.artifactIds.every(id=>uuid.test(id))));}
    return {bodyHash,position,validComposition,assertComposition,createComposition,migrateComposition,replaceSegment,splitSegment,mergeSegment,deleteSegment,filmingScript,validAdoptions};
}
export const {bodyHash:compositionBodyHash,validComposition:validProductionComposition,createComposition:createProductionComposition,migrateComposition:migrateProductionComposition,replaceSegment:replaceProductionSegment,splitSegment:splitProductionSegment,mergeSegment:mergeProductionSegment,deleteSegment:deleteProductionSegment,filmingScript:productionFilmingScript,validAdoptions:validProductionAdoptions}=productionCompositionRuntime();
