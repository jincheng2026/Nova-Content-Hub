import {fixedStageContext,runFixedCLI,fail} from './jincheng-workflow.mjs';
import {readPublicationFacts,proposeReview,proposeKnowledge} from '../lib/publication-runtime/index.mjs';
export function runPublicationHandoff(args){const c=fixedStageContext(args),{operation}=args,{stage,businessSkill}=c.task.request.parameters;
 if(!['closeout','review','patterns'].includes(stage))fail('STAGE_FORBIDDEN');
 if(operation==='read')return readPublicationFacts(args.envelope.binding.root,c.work);
 const input=c.input;if(Object.keys(input).some(k=>['work','authorDecision','decision','root','path','taskId','methodId'].includes(k)))fail('AUTHOR_DECISION_FORBIDDEN','助手只能提交候选，作者决定来自桌面。');
 if(typeof input.mutationId!=='string')fail('INVALID_INPUT','请提供固定mutationId，以便断点重试。');
 const base={...input,work:c.work,methodId:businessSkill,taskId:c.task.id};
 if(operation==='closeout'){if(stage!=='closeout')fail('STAGE_FORBIDDEN');const facts=readPublicationFacts(args.envelope.binding.root,c.work);if(facts.publication.state!=='published')fail('PUBLICATION_REQUIRED');if(facts.archive.state!=='ready')fail('ARCHIVE_FACTS_REQUIRED','原卡已发布仍然有效；请作者在桌面补记真实包装、时间、链接和定稿，再正式收口。');return {archive:facts.archive,observations:facts.observations};}
 if(operation==='review-candidate'&&stage==='review')return proposeReview(args.envelope.binding.root,base);
 if(operation==='knowledge-candidate'&&['review','patterns','closeout'].includes(stage))return proposeKnowledge(args.envelope.binding.root,base);
 fail('STAGE_FORBIDDEN');
}
export const main=argv=>runFixedCLI(argv,['read','closeout','review-candidate','knowledge-candidate'],runPublicationHandoff);
