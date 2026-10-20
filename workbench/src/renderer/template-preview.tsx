import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import type {TemplateGroup} from '../shared/cover-contracts.ts';

export function TemplatePreview({template, disabled, preview}: {template: TemplateGroup; disabled: boolean; preview(): void}) {
  const [active, setActive] = useState(0), [browsing, setBrowsing] = useState(false);
  const samples = template.samples, index = active % Math.max(1, samples.length);
  useEffect(() => {setActive(0); setBrowsing(false);}, [template.id, template.version]);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!browsing || disabled || samples.length < 2 || motion.matches) return;
    let changes = 0;
    // A short preview stops by itself; idle cards never keep animation timers alive.
    const timer = window.setInterval(() => {
      setActive(previous => (previous + 1) % samples.length);
      if (++changes >= Math.min(samples.length, 4)) window.clearInterval(timer);
    }, 1400);
    const stop = () => {window.clearInterval(timer); setBrowsing(false);};
    const visibility = () => {if (document.hidden) stop();};
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', stop);
    return () => {window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', stop);};
  }, [browsing, disabled, samples.length]);
  return <div className="creator-template-preview" onPointerEnter={event => {if (event.pointerType !== 'touch') setBrowsing(true);}} onPointerLeave={() => setBrowsing(false)} onFocus={() => setBrowsing(true)} onBlur={event => {if (!event.currentTarget.contains(event.relatedTarget)) setBrowsing(false);}}>
    <Button theme="borderless" className="creator-reference-stack" disabled={disabled} onClick={preview} aria-label={`预览 ${template.name} 的 ${samples.length} 张参考样张`}>
      {samples.length ? <span className="creator-stack-sheets">{Array.from({length: Math.min(3, samples.length)}, (_, layer) => Math.min(2, samples.length - 1) - layer).map(layer => <img key={`${samples[(index + layer) % samples.length].assetHash}:${layer}`} className={`creator-stack-sheet sheet-${layer}${layer === 0 ? ' creator-template-original' : ''}`} src={samples[(index + layer) % samples.length].url} alt={layer === 0 ? `${template.name}参考样张 ${index + 1}` : ''} aria-hidden={layer !== 0} loading="lazy" decoding="async"/> )}</span> : <span className="creator-no-reference">暂无可用参考样张</span>}
      <span className="creator-sample-count">{samples.length} 张样张</span>
      {samples.length > 1 && <span className="creator-stack-preview-label" aria-hidden="true">悬停翻看</span>}
    </Button>
    {samples.length > 1 && <div className="creator-template-thumbnails" aria-label={`${template.name}的样张缩略图`}>{samples.slice(0, 4).map((sample, thumbnail) => <Button key={sample.assetHash} theme="borderless" disabled={disabled} aria-label={`查看${template.name}样张 ${thumbnail + 1}`} aria-pressed={index === thumbnail} onClick={() => {setBrowsing(false); setActive(thumbnail);}}><img src={sample.url} alt="" loading="lazy" decoding="async"/></Button>)}{samples.length > 4 && <Button theme="borderless" disabled={disabled} onClick={preview} aria-label={`查看其余 ${samples.length - 4} 张样张`}>+{samples.length - 4}</Button>}</div>}
  </div>;
}
