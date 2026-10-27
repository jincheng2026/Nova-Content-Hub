export type ProductionArchiveCategory='调研报告'|'账号拆解'|'创作知识'|'内容项目';
export const PRODUCTION_ARCHIVE_CATEGORIES:readonly ProductionArchiveCategory[];
export function productionArchiveCategory(task:{kind:string;accountId?:string|null;contentId?:string|null}):ProductionArchiveCategory;
