/** Public documentation metadata only. Presence here never enables a service operation. */
export const PLATFORM_CATALOG_SOURCE = 'https://api.tikhub.io/openapi.json';
export const PLATFORM_CATALOG_SNAPSHOT_AT = '2026-10-26T16:43:16.946Z';
export interface PlatformCatalogEntry {id: string; name: string; aliases: string[]}
export interface PlatformCatalog {platforms: PlatformCatalogEntry[]; source: string; checkedAt: string; version: string; status: 'live'|'snapshot'; origin: 'live'|'builtin'; notice?: string}
const names: Record<string, [string, ...string[]]> = {
 douyin: ['抖音', 'Douyin'], tiktok: ['TikTok'], xiaohongshu: ['小红书', 'Xiaohongshu', 'RedNote'], instagram: ['Instagram'], twitter: ['X', 'Twitter'], youtube: ['YouTube'], threads: ['Threads'], linkedin: ['领英', 'LinkedIn'], reddit: ['Reddit'], bilibili: ['哔哩哔哩', 'Bilibili', 'B站'], weibo: ['微博', 'Weibo'], lemon8: ['Lemon8'], zhihu: ['知乎', 'Zhihu'], wechat_mp: ['微信公众号', 'WeChat Official Accounts'], wechat_channels: ['微信视频号', 'WeChat Channels'], kuaishou: ['快手', 'Kuaishou'], pipixia: ['皮皮虾', 'PiPiXia'], xigua: ['西瓜视频', 'Xigua'], toutiao: ['今日头条', 'Toutiao'], telegram: ['Telegram'],
};
const excludedRoots = new Set(['health', 'tikhub', 'hybrid', 'ios_shortcut', 'demo', 'wechat_search']);
const entry = (id: string): PlatformCatalogEntry => ({id, name: names[id]?.[0] ?? id, aliases: names[id]?.slice(1) ?? []});
export function platformCatalogSnapshot(): PlatformCatalog {
 return {platforms: Object.keys(names).map(entry), source: PLATFORM_CATALOG_SOURCE, checkedAt: PLATFORM_CATALOG_SNAPSHOT_AT, version: 'V5.3.2', status: 'snapshot', origin: 'builtin'};
}
export function parsePlatformCatalog(document: unknown, checkedAt: string): PlatformCatalog {
 if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid public catalog');
 const spec = document as {openapi?: unknown; info?: {version?: unknown}; paths?: unknown};
 if (typeof spec.openapi !== 'string' || !spec.paths || typeof spec.paths !== 'object' || Array.isArray(spec.paths)) throw new Error('Invalid OpenAPI document');
 const roots = new Set<string>();
 for (const [path, methods] of Object.entries(spec.paths)) {
  const match = /^\/api\/v\d+\/([a-z][a-z0-9_]{0,63})\//.exec(path);
  if (!match || excludedRoots.has(match[1]) || !methods || typeof methods !== 'object' || Array.isArray(methods)) continue;
  if (Object.keys(methods).some(method => ['get', 'post', 'put', 'delete', 'patch'].includes(method))) roots.add(match[1]);
 }
 if (!roots.size || roots.size > 100) throw new Error('Invalid platform directory');
 return {platforms: [...roots].map(entry), source: PLATFORM_CATALOG_SOURCE, checkedAt, version: typeof spec.info?.version === 'string' ? spec.info.version.slice(0, 100) : '未知版本', status: 'live', origin: 'live'};
}
/** Only the explicitly integrated Douyin operations count; never infer from catalog entries. */
export function platformCollectionCapability(platform: string): 'douyin'|'manual' {
 return ['抖音', 'douyin'].includes(platform.trim().toLocaleLowerCase()) ? 'douyin' : 'manual';
}
export function accountAnalysisPrompt(account: {name: string; platform: string; url: string}) {
 const scope = platformCollectionCapability(account.platform) === 'douyin' ? '仅可使用已接入的抖音操作，并遵守服务配置、预算与本次授权。' : '本工作台尚未接入此平台采集。仅分析已保存或用户手工提供的资料，不得调用抖音或其他平台采集工具，不得把此账号映射为抖音。缺少资料时等待用户补充。';
 return `分析${account.platform}账号 ${account.name}（${account.url || '未提供主页'}）的定位、选题与叙事表达，保留可核验来源。${scope}`;
}
export const DEFAULT_REPORT_TYPES = ['调研', '账号拆解', '选题研究', '内容分析', '行业趋势', '竞品分析', '复盘'];
export function reportTypeOptions(existing: string[]) {return [...new Set([...existing, ...DEFAULT_REPORT_TYPES].filter(Boolean))];}
