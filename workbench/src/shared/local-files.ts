import type {Photo} from './cover-contracts.ts';
import type {WorkspaceMaterialImport, WorkspaceTemplateImage} from './workspace-contracts.ts';

export type LocalFileKind = 'material' | 'template' | 'photo';
export interface LocalFileResults {material: WorkspaceMaterialImport; template: WorkspaceTemplateImage[]; photo: Photo}
export interface PhotoImportOptions {title: string; isOwnPhoto: boolean}
const images = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const LOCAL_FILE_RULES = Object.freeze({
    material: {extensions: [...images, 'pdf', 'md', 'markdown', 'txt'], files: 1, bytes: 64 * 1024 * 1024, total: 64 * 1024 * 1024},
    template: {extensions: images, files: 50, bytes: 64 * 1024 * 1024, total: 256 * 1024 * 1024},
    photo: {extensions: images, files: 1, bytes: 64 * 1024 * 1024, total: 64 * 1024 * 1024}
});
export function localFileSelectionError(kind: LocalFileKind, files: readonly {name: string; size: number}[]): string | null {
    const rules = LOCAL_FILE_RULES[kind];
    if (!files.length || files.length > rules.files) return rules.files === 1 ? '请一次选择一个文件。' : '请选择 1–50 张参考样张。';
    let total = 0;
    for (const file of files) {
        const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
        if (!rules.extensions.includes(extension)) return `不支持「${file.name}」。${kind === 'material' ? '请选择 PNG、JPEG、WebP、GIF、PDF、Markdown 或 TXT 文件。' : '请选择 PNG、JPEG、WebP 或 GIF 图片。'}`;
        const limit = ['md', 'markdown', 'txt'].includes(extension) ? 1024 * 1024 : rules.bytes;
        if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > limit) return `「${file.name}」为空或超过大小限制：文字最多 1 MiB，图片和 PDF 最多 64 MiB。`;
        total += file.size;
    }
    return total > rules.total ? '本次参考样张总计不能超过 256 MiB。' : null;
}
