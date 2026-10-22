import {useEffect, useRef, useState, type ReactNode} from 'react';
import './cover-workspace.css';
import Button from '@douyinfe/semi-ui-19/lib/es/button';

export function ImageViewport({url, label}: {url: string; label: string}) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 0, height: 0}), [viewport, setViewport] = useState({width: 0, height: 0});
  const [zoom, setZoom] = useState<number | null>(null), [failed, setFailed] = useState(false);
  const drag = useRef<{x: number; y: number; left: number; top: number} | null>(null);
  const fit = size.width && viewport.width ? Math.min(1, viewport.width / size.width, viewport.height / size.height) : 1;
  const scale = zoom ?? fit, minimum = Math.min(.05, fit);
  useEffect(() => {setZoom(null); setSize({width: 0, height: 0}); setFailed(false); stage.current?.scrollTo(0, 0);}, [url]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({width: element.clientWidth, height: element.clientHeight}));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function changeZoom(value: number | null) {
    const element = stage.current;
    if (!element) return;
    const next = value === null ? fit : Math.max(minimum, Math.min(8, value));
    const x = (element.scrollLeft + element.clientWidth / 2) / Math.max(size.width * scale, element.clientWidth);
    const y = (element.scrollTop + element.clientHeight / 2) / Math.max(size.height * scale, element.clientHeight);
    setZoom(value === null ? null : next);
    requestAnimationFrame(() => element.scrollTo(x * Math.max(size.width * next, element.clientWidth) - element.clientWidth / 2, y * Math.max(size.height * next, element.clientHeight) - element.clientHeight / 2));
  }
  return <div className="image-viewport">
    <div className="cover-toolbar image-zoom-controls" role="group" aria-label="图片缩放"><Button size="small" aria-label="缩小图片" disabled={failed || scale <= minimum} onClick={() => changeZoom(scale / 1.25)}>−</Button><output aria-live="polite">{Math.round(scale * 100)}%</output><Button size="small" aria-label="放大图片" disabled={failed || scale >= 8} onClick={() => changeZoom(scale * 1.25)}>＋</Button><Button size="small" aria-pressed={zoom === null} onClick={() => changeZoom(null)}>适合窗口</Button><Button size="small" aria-pressed={zoom === 1} onClick={() => changeZoom(1)}>原始尺寸</Button><span className="image-zoom-hint">拖动或滚动查看细节</span></div>
    <div ref={stage} className="cover-viewer-stage" tabIndex={0} aria-label="图片，可滚动或拖动查看细节；加减键缩放，0 适合窗口，1 原始尺寸" onKeyDown={event => {if (event.key === '+' || event.key === '=') {event.preventDefault(); changeZoom(scale * 1.25);} else if (event.key === '-') {event.preventDefault(); changeZoom(scale / 1.25);} else if (event.key === '0' || event.key === '1') {event.preventDefault(); changeZoom(event.key === '0' ? null : 1);}}} onPointerDown={event => {if (event.button !== 0) return; const element = event.currentTarget; if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) return; drag.current = {x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop}; element.setPointerCapture(event.pointerId); element.classList.add('is-dragging');}} onPointerMove={event => {if (drag.current) event.currentTarget.scrollTo(drag.current.left + drag.current.x - event.clientX, drag.current.top + drag.current.y - event.clientY);}} onPointerUp={event => {drag.current = null; event.currentTarget.classList.remove('is-dragging');}} onLostPointerCapture={event => {drag.current = null; event.currentTarget.classList.remove('is-dragging');}}>
      {failed ? <p role="alert">图片暂时无法读取，请关闭后重试。</p> : <div className="cover-viewer-canvas"><img src={url} alt={label} draggable={false} style={size.width ? {width: size.width * scale, height: size.height * scale} : undefined} onLoad={event => setSize({width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight})} onError={() => setFailed(true)}/></div>}
    </div>
  </div>;
}

export function ImagePreviewButton({url, label, loading}: {url: string; label: string; loading?: 'lazy' | 'eager'}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="image-preview-trigger" aria-label={`放大查看：${label}`} onClick={() => setOpen(true)}><img src={url} alt={label} loading={loading}/></button>{open && <CoverImageViewer url={url} label={label} close={() => setOpen(false)}/>}</>;
}

export function CoverImageViewer({url, label, close, previous, next, children}: {url: string; label: string; close(): void; previous?(): void; next?(): void; children?: ReactNode}) {
  const dialog = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.current?.showModal(); return () => {returnFocus.current?.focus();};}, []);
  return <dialog ref={dialog} className="image-preview cover-image-viewer" aria-label={label} onCancel={event => {event.preventDefault(); event.stopPropagation(); requestAnimationFrame(close);}} onKeyDown={event => {if (event.key === 'Escape' && !event.nativeEvent.isComposing) {event.preventDefault(); event.stopPropagation(); close(); return;} if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as Element).closest('.cover-viewer-stage')) return; if (event.key === 'ArrowLeft' && previous) {event.preventDefault(); previous();} if (event.key === 'ArrowRight' && next) {event.preventDefault(); next();}}}>
    <div className="dialog-heading"><h3>{label}</h3><div className="cover-toolbar">{(previous || next) && <><Button disabled={!previous} onClick={previous}>上一张</Button><Button disabled={!next} onClick={next}>下一张</Button></>}<Button onClick={close}>关闭预览</Button></div></div>
    <div className={`cover-viewer-layout${children ? ' has-details' : ''}`}><ImageViewport url={url} label={label}/>{children && <div className="cover-viewer-details">{children}</div>}</div>
  </dialog>;
}
