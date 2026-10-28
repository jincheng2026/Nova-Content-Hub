import {useEffect, useId, useRef, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {TemplateGroup} from '../shared/cover-contracts.ts';
import './template-preview.css';

export function TemplatePreview({template, disabled, preview, select, selected = false, previewLabel = '查看整组'}: {template: TemplateGroup; disabled: boolean; preview(): void; select?(): void; selected?: boolean; previewLabel?: string}) {
  const [active, setActive] = useState(0), [browsing, setBrowsing] = useState(false);
  const owner = useId(), root = useRef<HTMLDivElement>(null);
  // Reference viCard keeps up to eight real images; only positions 0–2 are visible.
  const samples = template.samples.filter((sample, index, all) => all.findIndex(item => item.assetHash === sample.assetHash) === index).slice(0, 8);
  const sampleKey = samples.map(sample => sample.assetHash).join(':');
  const turn = (next: number) => {if (!samples.length) return; setBrowsing(false); setActive((next + samples.length) % samples.length);};
  const showPreview = () => {setBrowsing(false); preview();};
  const start = () => {if (!disabled && !document.hidden) {window.dispatchEvent(new CustomEvent('template-preview-active', {detail: owner})); setBrowsing(true);}};
  useEffect(() => {setActive(0); setBrowsing(false);}, [template.id, template.version, sampleKey]);
  useEffect(() => {
    const stop = (event: Event) => {if ((event as CustomEvent).detail !== owner) setBrowsing(false);};
    window.addEventListener('template-preview-active', stop);
    return () => window.removeEventListener('template-preview-active', stop);
  }, [owner]);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!browsing || disabled || samples.length < 2 || motion.matches) return;
    let timer: number;
    const advance = () => {setActive(previous => (previous + 1) % samples.length); timer = window.setTimeout(advance, 2400);};
    timer = window.setTimeout(advance, 1100);
    const stop = () => {window.clearTimeout(timer); setBrowsing(false);};
    const visibility = () => {if (document.hidden) stop();};
    const observer = new IntersectionObserver(entries => {if (!entries[0]?.isIntersecting) stop();});
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', stop);
    motion.addEventListener('change', stop);
    return () => {window.clearTimeout(timer); observer.disconnect(); window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', stop);};
  }, [browsing, disabled, samples.length]);
  return <div ref={root} className={`creator-template-preview${browsing ? ' is-browsing' : ''}${selected ? ' is-selected' : ''}`} onPointerEnter={event => {if (event.pointerType !== 'touch') start();}} onPointerLeave={() => setBrowsing(false)} onFocus={start} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setBrowsing(false);}}>
    <div className="creator-template-stage">
    <Button theme="borderless" className="creator-reference-stack" disabled={disabled} onClick={select ?? showPreview} aria-pressed={select ? selected : undefined} onKeyDown={event => {
      if (disabled || samples.length < 2) return;
      const next = event.key === 'ArrowRight' ? active + 1 : event.key === 'ArrowLeft' ? active - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? samples.length - 1 : null;
      if (next !== null) {event.preventDefault(); turn(next);}
    }} aria-label={select ? `选择模板：${template.name}` : `预览 ${template.name} 的 ${template.samples.length} 张参考样张`}>
      {samples.length ? <span className="creator-stack-sheets">{samples.map((sample, index) => {const layer = (index - active + samples.length) % samples.length; return <span key={sample.assetHash} className={`creator-stack-sheet sheet-${layer}`} aria-hidden={layer > 2}><img className={layer === 0 ? 'creator-template-original' : undefined} src={sample.url} alt={layer === 0 ? `${template.name}参考样张 ${index + 1}` : ''} aria-hidden={layer !== 0} loading="eager" decoding="async"/></span>;})}</span> : <span className="creator-no-reference">暂无可用参考样张</span>}
      <span className="creator-sample-count">整组 {template.samples.length} 张</span>
      {select && selected && <span className="creator-template-check" aria-hidden="true">✓</span>}
    </Button>
    {samples.length > 1 && <div className="creator-template-turn-controls" role="group" aria-label={`${template.name}样张翻阅，当前第 ${active + 1} 张，预览共 ${samples.length} 张`}>
      <Button theme="borderless" size="small" disabled={disabled} aria-label={`上一张样张：${template.name}`} onClick={() => turn(active - 1)}>‹</Button>
      <Button theme="borderless" size="small" disabled={disabled} aria-label={`下一张样张：${template.name}`} onClick={() => turn(active + 1)}>›</Button>
    </div>}
    </div>
    {select ? <><Button className="creator-template-select-name" theme="borderless" disabled={disabled} onClick={select} aria-pressed={selected}>{template.name}</Button><div className="creator-template-choice-meta"><span>{template.builtin ? '内置' : '我的模板'}</span><Button size="small" theme="borderless" disabled={disabled} onClick={showPreview} aria-label={`${previewLabel}：${template.name}`}>{previewLabel}</Button></div></> : samples.length > 1 && <div className="creator-template-thumbnails" aria-label={`${template.name}的样张缩略图`}>{samples.slice(0, 3).map((sample, thumbnail) => <Button key={sample.assetHash} theme="borderless" disabled={disabled} aria-label={`查看${template.name}样张 ${thumbnail + 1}`} aria-pressed={active === thumbnail} onClick={() => {setBrowsing(false); setActive(thumbnail);}}><img src={sample.url} alt="" loading="eager" decoding="async"/></Button>)}{template.samples.length > 3 && <Button theme="borderless" disabled={disabled} onClick={showPreview} aria-label={`查看全部 ${template.samples.length} 张样张`}>+{template.samples.length - 3}</Button>}</div>}
  </div>;
}
