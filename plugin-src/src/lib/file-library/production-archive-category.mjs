/** Shared deterministic classification; independent of hosts, filesystems and UI. */
export const PRODUCTION_ARCHIVE_CATEGORIES=Object.freeze(['调研报告','账号拆解','创作知识','内容项目']);
export function productionArchiveCategory(task){
 if(task.kind==='research')return '调研报告';
 if(task.kind==='analysis'&&task.accountId)return '账号拆解';
 if(task.contentId)return '内容项目';
 return '创作知识';
}
