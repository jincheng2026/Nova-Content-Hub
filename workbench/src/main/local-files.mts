import fs from 'node:fs/promises';
import path from 'node:path';
import {isRecord} from '../shared/contracts.ts';
import {fail, validateInput} from '../shared/validation.ts';
import {localFileSelectionError, type LocalFileKind, type PhotoImportOptions} from '../shared/local-files.ts';

export interface NativeLocalFiles {kind: LocalFileKind; sources: string[]; photo?: PhotoImportOptions}
export async function validateLocalFiles(input: unknown): Promise<NativeLocalFiles> {
    if (!isRecord(input) || !['material', 'template', 'photo'].includes(input.kind as string) || Object.keys(input).some(key => !['kind', 'sources', 'photo'].includes(key)) || !Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > (input.kind === 'template' ? 50 : 1)) fail('INVALID_FILES', '请选择允许数量的本机文件，文件夹不能直接导入。');
    const kind = input.kind as LocalFileKind;
    if (kind === 'photo') validateInput('choosePhoto', input.photo);
    else if (input.photo !== undefined) fail('INVALID_FILES', '此文件导入不接受照片设置。');
    const sources: string[] = [], files: {name: string; size: number}[] = [];
    for (const source of input.sources) {
        if (typeof source !== 'string' || !path.isAbsolute(source) || source.includes('\0') || source.length > 32768 || sources.includes(source)) fail('INVALID_FILES', '请选择不同的本机原文件，文件路径不可用。');
        let info;
        try { info = await fs.lstat(source); } catch { fail('INVALID_FILES', '本机文件无法读取，请恢复原文件或重新选择。'); }
        if (!info.isFile() || info.isSymbolicLink()) fail('INVALID_FILES', '请拖入普通文件；文件夹、快捷方式和符号链接不能导入。');
        sources.push(source); files.push({name: path.basename(source), size: info.size});
    }
    const error = localFileSelectionError(kind, files);
    if (error) fail('INVALID_FILES', error);
    return {kind, sources, ...(kind === 'photo' ? {photo: input.photo as PhotoImportOptions} : {})};
}
