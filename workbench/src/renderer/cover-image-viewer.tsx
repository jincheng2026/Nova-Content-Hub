import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import './cover-workspace.css';
import Button from '@douyinfe/semi-ui-19/lib/es/button';

export function ImageViewport({url, label}: {url: string; label: string}) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({width: 0, height: 0}), [viewport, setViewport] = useState({width: 0, height: 0});
  const [zoom, setZoom] = useState<number | null>(null), [failed, setFailed] = useState(false);
  const drag = useRef<{id: number; x: number; y: number; left: number; top: number} | null>(null);
  const pending = useRef<{scale: number; x: number; y: number; imageX: number; imageY: number; left: number; top: number} | null>(null);
  const fit = size.width && viewport.width ? Math.min(1, viewport.width / size.width, viewport.height / size.height) : 1;
  const scale = zoom ?? fit, minimum = Math.min(.05, fit);
  const current = useRef({size, scale, fit, minimum, failed});
  current.current = {size, scale, fit, minimum, failed};
  function stopDrag() {
    const element = stage.current, pointer = drag.current;
    drag.current = null;
    element?.classList.remove('is-dragging');
    if (element && pointer && element.hasPointerCapture(pointer.id)) element.releasePointerCapture(pointer.id);
  }
  useLayoutEffect(() => {
    pending.current = null; stopDrag(); setZoom(null); setSize({width: 0, height: 0}); setFailed(false); stage.current?.scrollTo(0, 0);
    return () => {pending.current = null; stopDrag();};
  }, [url]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({width: element.clientWidth, height: element.clientHeight}));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = stage.current, target = pending.current;
    if (!element || !target) return;
    element.scrollTo(target.imageX * scale + Math.max(0, (element.clientWidth - size.width * scale) / 2) - target.x, target.imageY * scale + Math.max(0, (element.clientHeight - size.height * scale) / 2) - target.y);
    if (drag.current) {drag.current.left = element.scrollLeft; drag.current.top = element.scrollTop;}
    pending.current = null;
  });
  function changeZoom(value: number | null, clientX?: number, clientY?: number) {
    const element = stage.current, view = current.current;
    if (!element || !view.size.width || view.failed) return;
    const previous = pending.current, before = previous?.scale ?? view.scale;
    const next = value === null ? view.fit : Math.max(view.minimum, Math.min(8, value));
    const bounds = element.getBoundingClientRect(), x = clientX === undefined ? element.clientWidth / 2 : clientX - bounds.left - element.clientLeft, y = clientY === undefined ? element.clientHeight / 2 : clientY - bounds.top - element.clientTop;
    const imageX = ((previous?.left ?? element.scrollLeft) + x - Math.max(0, (element.clientWidth - view.size.width * before) / 2)) / before;
    const imageY = ((previous?.top ?? element.scrollTop) + y - Math.max(0, (element.clientHeight - view.size.height * before) / 2)) / before;
    const left = Math.max(0, Math.min(Math.max(0, view.size.width * next - element.clientWidth), imageX * next + Math.max(0, (element.clientWidth - view.size.width * next) / 2) - x));
    const top = Math.max(0, Math.min(Math.max(0, view.size.height * next - element.clientHeight), imageY * next + Math.max(0, (element.clientHeight - view.size.height * next) / 2) - y));
    pending.current = next === view.scale ? null : {scale: next, x, y, imageX, imageY, left, top};
    if (next === view.scale) {element.scrollTo(left, top); if (drag.current) {drag.current.left = element.scrollLeft; drag.current.top = element.scrollTop;}}
    if (drag.current && clientX !== undefined && clientY !== undefined) {drag.current.x = clientX; drag.current.y = clientY;}
    setZoom(value === null ? null : next);
  }
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey && !(event.buttons & 1) && !drag.current) return;
      // Chromium reports trackpad pinch as Ctrl+wheel; cancel only inside the image stage.
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientHeight : 1);
      changeZoom((pending.current?.scale ?? current.current.scale) * Math.exp(-delta * .002), event.clientX, event.clientY);
    }
    element.addEventListener('wheel', wheel, {passive: false});
    window.addEventListener('blur', stopDrag);
    return () => {element.removeEventListener('wheel', wheel); window.removeEventListener('blur', stopDrag);};
  }, []);
  return <div className="image-viewport">
    <div className="cover-toolbar image-zoom-controls" role="group" aria-label="图片缩放"><Button size="small" aria-label="缩小图片" disabled={failed || !size.width || scale <= minimum} onClick={() => changeZoom(scale / 1.25)}>−</Button><output aria-live="polite">{Math.round(scale * 100)}%</output><Button size="small" aria-label="放大图片" disabled={failed || !size.width || scale >= 8} onClick={() => changeZoom(scale * 1.25)}>＋</Button><Button size="small" disabled={failed || !size.width} aria-pressed={zoom === null} onClick={() => changeZoom(null)}>适合窗口</Button><Button size="small" disabled={failed || !size.width} aria-pressed={zoom === 1} onClick={() => changeZoom(1)}>原始尺寸</Button><span className="image-zoom-hint">双指捏合、Ctrl / ⌘ + 滚轮或按住左键滚轮缩放；双击切换，拖动查看</span></div>
    <div ref={stage} className="cover-viewer-stage" tabIndex={0} aria-label="图片，可滚动或拖动查看细节；双指捏合、Ctrl 或 Command 加滚轮、按住左键滚轮缩放；双击切换适合窗口与细节；加减键缩放，0 适合窗口，1 原始尺寸" onDoubleClick={event => {event.preventDefault(); changeZoom(zoom === null ? (fit < 1 ? 1 : 2) : null, event.clientX, event.clientY);}} onKeyDown={event => {if (event.key === '+' || event.key === '=') {event.preventDefault(); changeZoom(scale * 1.25);} else if (event.key === '-') {event.preventDefault(); changeZoom(scale / 1.25);} else if (event.key === '0' || event.key === '1') {event.preventDefault(); changeZoom(event.key === '0' ? null : 1);}}} onPointerDown={event => {if (event.button !== 0) return; const element = event.currentTarget; drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop}; element.setPointerCapture(event.pointerId); if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) element.classList.add('is-dragging');}} onPointerMove={event => {if (drag.current?.id === event.pointerId) event.currentTarget.scrollTo(drag.current.left + drag.current.x - event.clientX, drag.current.top + drag.current.y - event.clientY);}} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
      {failed ? <p role="alert">图片暂时无法读取，请关闭后重试。</p> : <div className="cover-viewer-canvas"><img key={url} src={url} alt={label} draggable={false} style={size.width ? {width: size.width * scale, height: size.height * scale} : undefined} onLoad={event => setSize({width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight})} onError={() => {pending.current = null; stopDrag(); setFailed(true);}}/></div>}
    </div>
  </div>;
}

export function ImagePreviewButton({url, label, loading}: {url: string; label: string; loading?: 'lazy' | 'eager'}) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} type="button" className="image-preview-trigger" aria-label={`放大查看：${label}`} onClick={() => setOpen(true)}><img src={url} alt={label} loading={loading}/></button>{open && <CoverImageViewer url={url} label={label} returnFocusTo={trigger.current} close={() => setOpen(false)}/>}</>;
}

export function CoverImageViewer({url, label, close, previous, next, children, returnFocusTo}: {url: string; label: string; close(): void; previous?(): void; next?(): void; children?: ReactNode; returnFocusTo?: HTMLElement | null}) {
  const dialog = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {returnFocus.current = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); dialog.current?.showModal(); return () => {const target = returnFocus.current; requestAnimationFrame(() => {if (target?.isConnected) target.focus({preventScroll: true});});};}, []);
  return <dialog ref={dialog} className="image-preview cover-image-viewer" aria-label={label} onCancel={event => {event.preventDefault(); event.stopPropagation(); requestAnimationFrame(close);}} onKeyDown={event => {if (event.key === 'Escape' && !event.nativeEvent.isComposing) {event.preventDefault(); event.stopPropagation(); close(); return;} if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as Element).closest('.cover-viewer-stage')) return; if (event.key === 'ArrowLeft' && previous) {event.preventDefault(); previous();} if (event.key === 'ArrowRight' && next) {event.preventDefault(); next();}}}>
    <div className="dialog-heading"><h3>{label}</h3><div className="cover-toolbar">{(previous || next) && <><Button disabled={!previous} onClick={previous}>上一张</Button><Button disabled={!next} onClick={next}>下一张</Button></>}<Button onClick={close}>关闭预览</Button></div></div>
    <div className={`cover-viewer-layout${children ? ' has-details' : ''}`}><ImageViewport url={url} label={label}/>{children && <div className="cover-viewer-details">{children}</div>}</div>
  </dialog>;
}
