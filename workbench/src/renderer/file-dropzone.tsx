import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {localFileSelectionError, type LocalFileKind, type LocalFileResults, type PhotoImportOptions} from '../shared/local-files.ts';
import {invoke} from './client.ts';
import type {WorkspaceRun} from './library-panels.tsx';
import './file-dropzone.css';

interface Props<K extends LocalFileKind> {
    kind: K; buttonId?: string; showPicker?: boolean; disabled?: boolean; run: WorkspaceRun; label?: string; buttonLabel?: string;
    photo?: PhotoImportOptions; onImported(value: LocalFileResults[K]): void | Promise<void>;
}
const labels = {material: '将内容资料拖到这里', template: '将一组模板参考图拖到这里', photo: '将照片拖到这里'};
const hints = {material: '每次 1 份 · PNG、JPEG、WebP、GIF、PDF、Markdown 或 TXT · 文字最多 1 MiB，其他最多 64 MiB', template: '1–50 张 · PNG、JPEG、WebP 或 GIF · 单张最多 64 MiB，总计最多 256 MiB', photo: '每次 1 张 · PNG、JPEG、WebP 或 GIF · 最多 64 MiB'};
export function FileDropzone<K extends LocalFileKind>({kind, buttonId, showPicker = true, disabled, run, label, buttonLabel = '选择文件', photo = {title: '我的照片', isOwnPhoto: false}, onImported}: Props<K>) {
    const [dragging, setDragging] = useState(false), [working, setWorking] = useState(false), [notice, setNotice] = useState('');
    const active = useRef(false), depth = useRef(0);
    useEffect(() => {
        // Prevent Chromium from navigating to files dropped outside an import target.
        const prevent = (event: DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); };
        window.addEventListener('dragover', prevent); window.addEventListener('drop', prevent);
        return () => {window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent);};
    }, []);
    async function importFiles(files?: File[]) {
        if (disabled || active.current) return;
        if (files) {const error = localFileSelectionError(kind, files); if (error) {setNotice(error); return;}}
        active.current = true; setWorking(true); setNotice('正在校验并导入本机文件…');
        try {
            let started = false;
            await run(async () => {
                started = true;
                try {
                    let value: LocalFileResults[K] | null;
                    if (files) {
                        const reply = await window.contentHub.importLocalFiles(kind, files, kind === 'photo' ? photo : undefined);
                        if (!reply.ok) throw new Error(reply.error.message);
                        value = reply.value;
                    } else {
                        value = (kind === 'template' ? await invoke('chooseTemplateImages') : kind === 'material' ? await invoke('chooseContentMaterial') : await invoke('choosePhoto', photo)) as LocalFileResults[K] | null;
                    }
                    if (value) {await onImported(value); setNotice(kind === 'photo' ? '照片已导入本机内容库。' : '文件已读取，请确认下方导入信息。');}
                    else setNotice('已取消选择，原有填写保留。');
                } catch (error) {setNotice(error instanceof Error ? error.message : '文件导入未完成，原有填写保留。'); throw error;}
            });
            if (!started) setNotice('正在处理其他本机资料，请稍后再试。');
        } catch (error) {setNotice(error instanceof Error ? error.message : '文件导入未完成，原有填写保留。');}
        finally {active.current = false; setWorking(false);}
    }
    return <section className={`file-dropzone${dragging ? ' is-dragging' : ''}${disabled || working ? ' is-disabled' : ''}`} aria-label={label ?? labels[kind]} aria-busy={working} onDragEnter={event => {event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.types.includes('Files') && !disabled && !active.current) {depth.current++; setDragging(true);}}} onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = disabled || working ? 'none' : 'copy';}} onDragLeave={event => {event.preventDefault(); event.stopPropagation(); if (--depth.current <= 0) {depth.current = 0; setDragging(false);}}} onDrop={event => {event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); if (!disabled && !active.current) void importFiles(Array.from(event.dataTransfer.files));}}>
        <span className="file-dropzone-symbol" aria-hidden="true">＋</span><strong>{working ? '正在导入…' : dragging ? '松开即可导入' : label ?? labels[kind]}</strong><p>{hints[kind]}</p>{showPicker && <Button id={buttonId} disabled={disabled || working} onClick={() => void importFiles()}>{working ? '正在导入…' : buttonLabel}</Button>}<span className="file-dropzone-notice" role="status" aria-live="polite">{notice || '原文件保留在本机，不会自动发送给助手。'}</span>
    </section>;
}
