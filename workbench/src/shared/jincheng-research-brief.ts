import type {ResearchBrief} from './stage-contracts.ts';
export function researchBriefFromText(value:string,platform:ResearchBrief['platform'],route:'research'|'comments'|'intake'='research'):ResearchBrief|undefined {
 const parts=value.split(/[\s,，]+/).map(v=>v.trim()).filter(Boolean);if(!parts.length)return undefined;
 const videos:string[]=[],targets:string[]=[];let account=false;
 for(const part of parts){let parsed:URL|null=null;try{parsed=new URL(part);}catch{}
  if(parsed){if(platform==='douyin'&&['www.douyin.com','douyin.com'].includes(parsed.hostname)){const v=/^\/video\/(\d{1,32})/.exec(parsed.pathname),a=/^\/user\/([^/]+)/.exec(parsed.pathname);if(v){videos.push(v[1]);targets.push(v[1]);}else if(a){targets.push(decodeURIComponent(a[1]));account=true;}else throw new Error('请提供完整抖音账号主页或 /video/ 作品链接，短链接需先展开。');}
   else if(platform==='xiaohongshu'&&['www.xiaohongshu.com','xiaohongshu.com'].includes(parsed.hostname)){const a=/^\/user\/profile\/([^/]+)/.exec(parsed.pathname);if(!a)throw new Error('小红书自动研究当前需要账号主页；其他资料请选择手工资料。');targets.push(a[1]);account=true;}
   else if(platform==='manual')targets.push(part);else throw new Error('来源链接与选择的平台不一致。');
  }else if(platform==='douyin'&&/^\d{1,32}$/.test(part)&&route!=='research'){videos.push(part);targets.push(part);}else targets.push(part);
 }
 if(videos.length>3)throw new Error('本次明确样本上限为3条原片，请分批研究。');
 if(route!=='research'&&platform!=='manual'&&!videos.length)throw new Error('此环节需要明确作品链接或作品ID；也可选手工资料，只读已有材料。');
 return {route:route==='research'?(account?'account':'topic'):route,platform,targetIds:[...new Set(targets)],...(videos.length?{videoIds:[...new Set(videos)]}:{}),...(route==='comments'?{commentMode:'report'}:{})};
}
