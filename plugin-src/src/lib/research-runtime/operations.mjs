import {object,fail} from './common.mjs';
export const RESEARCH_OPERATIONS=Object.freeze(['prepare','status','readiness','normalize-content','collect','derive-samples','download','transcribe','correct','finalize-intake','save-dataset','freeze-findings','personal-advice','render-report']);
export async function executeResearchOperation(runtime,config,operation,input={}){
 if(!RESEARCH_OPERATIONS.includes(operation)||!object(input))fail('INVALID_INPUT');
 const id=config.researchId;
 if(['prepare','status','readiness','derive-samples','freeze-findings','render-report'].includes(operation)&&Object.keys(input).length)fail('INVALID_INPUT','此操作不接受自定义路径或配置。');
 if(operation==='prepare')return runtime.prepare(config);
 if(operation==='status')return runtime.status(id);
 if(operation==='readiness')return runtime.readiness();
 if(operation==='normalize-content')return runtime.normalizeContent(id,input);
 if(operation==='derive-samples')return runtime.deriveSamples(id);
 if(operation==='collect')return runtime.collect(id,input);
 if(operation==='download'||operation==='transcribe'){if(Object.keys(input).join(',')!=='videoId'||typeof input.videoId!=='string')fail('INVALID_INPUT');return runtime[operation](id,input.videoId);}
 if(operation==='correct'){if(Object.keys(input).some(k=>!['videoId','correction'].includes(k))||typeof input.videoId!=='string'||!object(input.correction))fail('INVALID_INPUT');return runtime.correct(id,input.videoId,input.correction);}
 if(operation==='finalize-intake')return runtime.finalizeIntake(id,input);
 if(operation==='save-dataset')return runtime.saveDataset(id,input);
 if(operation==='freeze-findings')return runtime.freeze(id);
 if(operation==='personal-advice'){if(Object.keys(input).some(k=>!['advice','findingsHash','ownSources'].includes(k)))fail('INVALID_INPUT');return runtime.advise(id,input);}
 return runtime.render(id);
}
