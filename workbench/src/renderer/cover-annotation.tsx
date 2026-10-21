import {useEffect, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import TextArea from '@douyinfe/semi-ui-19/lib/es/input/textarea';
import {ManagementDialog} from './library-panels.tsx';
import {annotationNote, imageAnnotationPoint, readAnnotationNote} from './cover-gallery.ts';
import type {CoverAnnotation} from './cover-gallery.ts';
import type {WorkspaceCandidate} from '../shared/workspace-contracts.ts';
interface Props {
  candidate: WorkspaceCandidate & {url: string}; busy: boolean; disabled: boolean; refinementDisabled: boolean;
  assistant: string; referenceSummary: string; close(): void;
  save(note: string): Promise<void>; refine(note: string): Promise<void>; refinementPrompt(note: string): string;
  run<T>(action: () => Promise<T>): Promise<T | undefined>;
}
export function CoverAnnotationEditor({candidate, busy, disabled, refinementDisabled, refinementPrompt, assistant, referenceSummary, close, save, refine, run}: Props) {
  const [initial] = useState(() => readAnnotationNote(candidate.note));
  const [points, setPoints] = useState(initial.points), [overall, setOverall] = useState(initial.overall), [confirming, setConfirming] = useState(false);
  const [editor, setEditor] = useState<{point: CoverAnnotation; index: number | null} | null>(null);
  const [natural, setNatural] = useState({width: 0, height: 0}), [stageSize, setStageSize] = useState({width: 0, height: 0});
  const stage = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const note = annotationNote(points, overall), hasInstructions = !!overall.trim() || points.some(point => point.text.trim());
  const fullPrompt = refinementPrompt(note), refinementTooLong = fullPrompt.length > 10000;
  const valid = note.length <= 10000 && points.every(point => !!point.text.trim());
  const scale = natural.width && natural.height ? Math.min(Math.max(0, stageSize.width - 32) / natural.width, Math.max(0, stageSize.height - 32) / natural.height) : 0;
  const imageWidth = natural.width * scale, imageHeight = natural.height * scale;
  const pointLeft = editor ? (stageSize.width - imageWidth) / 2 + imageWidth * editor.point.x / 100 : 0;
  const pointTop = editor ? (stageSize.height - imageHeight) / 2 + imageHeight * editor.point.y / 100 : 0;
  const popupWidth = Math.min(280, Math.max(0, stageSize.width - 16)), popupHeight = Math.min(224, Math.max(0, stageSize.height - 16));
  const popupLeft = Math.max(8, Math.min(pointLeft + popupWidth + 26 <= stageSize.width ? pointLeft + 18 : pointLeft - popupWidth - 18, stageSize.width - popupWidth - 8));
  const popupTop = Math.max(8, Math.min(pointTop + popupHeight + 26 <= stageSize.height ? pointTop + 18 : pointTop - popupHeight - 18, stageSize.height - popupHeight - 8));
  useEffect(() => {
    const element = stage.current; if (!element) return;
    const measure = () => setStageSize({width: element.clientWidth, height: element.clientHeight});
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (editor) document.getElementById('annotation-point-text')?.focus({preventScroll: true}); }, [!!editor]);
  function editPoint(point: CoverAnnotation, index: number | null) { setEditor({point: {...point}, index}); setConfirming(false); }
  function confirmPoint() {
    if (!editor || !editor.point.text.trim()) return;
    const next = editor.index === null ? [...points, {...editor.point, text: editor.point.text}] : points.map((point, index) => index === editor.index ? {...editor.point, text: editor.point.text} : point);
    if (annotationNote(next, overall).length > 10000) return;
    setPoints(next); setEditor(null);
  }
  return <ManagementDialog title="封面位置批注" busy={busy} dirty={!!editor || note !== annotationNote(initial.points, initial.overall)} close={close}>
    <form className="cover-annotation-form" onSubmit={event => { event.preventDefault(); if (valid && !editor) void run(() => save(note)); }}>
      <p>点击原图中的位置，在旁边填写要求并确认。已确认的批注会列在右侧，原图和历史候选都会保留。</p>
      <div className="cover-annotation-layout"><div ref={stage} className="cover-annotation-stage">
        <div className="cover-annotation-canvas" style={{width: imageWidth || '100%', height: imageHeight || '100%'}}>
          <button type="button" className="cover-annotation-image" aria-label="点击原图添加位置批注" disabled={disabled || points.length >= 20 || !!editor} onClick={event => {
            const element = image.current; if (!element) return;
            const point = imageAnnotationPoint(event.clientX, event.clientY, element.getBoundingClientRect(), element.naturalWidth, element.naturalHeight);
            if (point) editPoint({...point, text: ''}, null);
          }}><img ref={image} src={candidate.url} alt="待修改的封面原图" draggable={false} onLoad={event => setNatural({width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight})}/></button>
          {points.map((point, index) => <button type="button" key={index} className="cover-annotation-marker" aria-label={`编辑位置 ${index + 1}`} disabled={disabled || !!editor} style={{left: `${point.x}%`, top: `${point.y}%`}} onClick={() => editPoint(point, index)}>{index + 1}</button>)}
          {editor && <span className="cover-annotation-marker is-draft" aria-label="正在编辑的位置" style={{left: `${editor.point.x}%`, top: `${editor.point.y}%`}}>{editor.index === null ? points.length + 1 : editor.index + 1}</span>}
        </div>
        {editor && <div className="cover-annotation-popover" role="region" aria-label="填写位置批注" style={{left: popupLeft, top: popupTop, width: popupWidth, maxHeight: popupHeight}}>
          <label htmlFor="annotation-point-text">位置 {editor.index === null ? points.length + 1 : editor.index + 1} 的修改要求</label>
          <TextArea id="annotation-point-text" aria-label="位置修改要求" value={editor.point.text} disabled={disabled} maxLength={1000} placeholder="例如：把这里的标题放大" onChange={value => setEditor({...editor, point: {...editor.point, text: value}})}/>
          <div className="cover-toolbar"><Button theme="solid" disabled={disabled || !editor.point.text.trim() || annotationNote(editor.index === null ? [...points, editor.point] : points.map((point, index) => index === editor.index ? editor.point : point), overall).length > 10000} onClick={confirmPoint}>确认批注</Button><Button disabled={busy} onClick={() => setEditor(null)}>取消</Button></div>
        </div>}
      </div><div className="cover-annotation-notes"><h3>已确认的位置批注（{points.length}）</h3>{!points.length && <p>点击原图中需要修改的地方，填写后确认。</p>}{points.map((point, index) => <div className="cover-annotation-note" key={index}><button type="button" className="cover-annotation-note-edit" disabled={disabled || !!editor} aria-label={`编辑位置 ${index + 1} 批注`} onClick={() => editPoint(point, index)}><strong>位置 {index + 1}</strong><span>{point.text}</span></button><Button theme="borderless" disabled={disabled || !!editor} onClick={() => { setPoints(old => old.filter((_, i) => i !== index)); setConfirming(false); }}>删除位置 {index + 1}</Button></div>)}<label htmlFor="annotation-overall">整体修改要求（可选）<TextArea id="annotation-overall" value={overall} disabled={disabled} maxLength={9000} placeholder="可留空，例如：保留人物和配色" onChange={value => { setOverall(value); setConfirming(false); }}/></label><p>{points.length} / 20 个位置 · {note.length} / 10000 字</p>{!valid && <p role="alert">请将总字数控制在 10000 字内。</p>}</div></div>
      {refinementTooLong && <p role="alert">批注、补充要求与定位说明合计 {fullPrompt.length} 字，超过 10000 字。请调整后再修改；原输入仍保留，也可以单独保存批注。</p>}
      <div className="cover-toolbar"><Button disabled={disabled || points.length >= 20 || !!editor} onClick={() => editPoint({x: 50, y: 50, text: ''}, null)}>添加中心位置批注</Button><Button htmlType="submit" disabled={disabled || !valid || !!editor}>保存批注</Button><Button theme="solid" disabled={disabled || refinementDisabled || refinementTooLong || !valid || !hasInstructions || !!editor} onClick={() => setConfirming(true)}>按批注修改</Button></div>
      {confirming && <div className="cover-refinement-confirm" role="region" aria-label="确认本次封面修改"><h3>确认本次修改</h3><pre style={{whiteSpace: 'pre-wrap'}}>{fullPrompt}</pre><p>参考上方这张原图与 {points.length} 个位置批注。{referenceSummary}</p><p>当前助手：{assistant}。将保存批注，添加这张原图作为内容参考资料，生成 1 张新候选；已有封面继续保留。</p><Button theme="solid" disabled={disabled || refinementDisabled || refinementTooLong || !valid || !hasInstructions || !!editor} onClick={() => void run(() => refine(note))}>确认并去 {assistant} 修改</Button><Button disabled={busy} onClick={() => setConfirming(false)}>继续调整批注</Button></div>}
    </form>
  </ManagementDialog>;
}
