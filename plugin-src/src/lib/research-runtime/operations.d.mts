import type {ResearchConfig} from './common.mjs';
import type {ResearchRuntime} from './index.mjs';
export const RESEARCH_OPERATIONS:readonly string[];
export function executeResearchOperation(runtime:ResearchRuntime,config:ResearchConfig,operation:string,input?:Record<string,unknown>):Promise<unknown>;
