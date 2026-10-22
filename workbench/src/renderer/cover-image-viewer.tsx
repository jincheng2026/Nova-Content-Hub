import {useEffect, useRef, useState, type ReactNode} from 'react';
import './cover-workspace.css';
import Button from '@douyinfe/semi-ui-19/lib/es/button';

export function CoverImageViewer({url, label, close, previous, next, children}: {url: string; label: string; close(): void; previous?(): void; next?(): void; children?: ReactNode}) {
  const [actualSize, setActualSize] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null), stage = useRef<HTMLDivElement>(null);
  useEffect(() => {returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal(); return () => {returnFocus.current?.focus();};}, []);
  useEffect(() => {stage.current?.scrollTo(0, 0);}, [url]);
  return <dialog ref={dialog} className="image-preview cover-image-viewer" aria-label={label} onCancel={event => {event.preventDefault(); close();}} onKeyDown={event => {if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; if (event.key === 'ArrowLeft' && previous) {event.preventDefault(); previous();} if (event.key === 'ArrowRight' && next) {event.preventDefault(); next();}}}>
    <div className="dialog-heading"><h3>{label}</h3><div className="cover-toolbar"><Button aria-pressed={actualSize} onClick={() => setActualSize(value => !value)}>{actualSize ? '适合窗口' : '原始尺寸'}</Button>{(previous || next) && <><Button disabled={!previous} onClick={previous}>上一张</Button><Button disabled={!next} onClick={next}>下一张</Button></>}<Button onClick={close}>关闭预览</Button></div></div>
    <div className={`cover-viewer-layout${children ? ' has-details' : ''}`}><div ref={stage} className={`cover-viewer-stage${actualSize ? ' is-actual-size' : ''}`} tabIndex={0} aria-label="封面原图，可横向和纵向滚动"><img src={url} alt={label}/></div>
    {children && <div className="cover-viewer-details">{children}</div>}</div>
  </dialog>;
}
