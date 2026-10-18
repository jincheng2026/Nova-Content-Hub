import { useEffect, useRef, useState } from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type { Content, DesktopResults } from '../shared/contracts.ts';
import type { CoverResults, TemplateGroup } from '../shared/cover-contracts.ts';
import { invoke } from './client.ts';
import { dayDate, fillPrompt, localDay, promptFields, shiftDay } from './workspace-model.ts';
export type Page = 'overview' | 'templates' | 'content' | 'calendar' | 'prompts';
export const pageNames: Record<Page, string> = { overview: '总览', templates: '模板', content: '内容', calendar: '日历', prompts: '提示词' };
type Snapshot = DesktopResults['readWorkspace'];
type WorkspaceContent = Snapshot['contents'][number];
type Prompt = Snapshot['prompts'][number];
interface Props { workspace: Snapshot | null; open(item: Content): void; busy: boolean }
function scheduled(workspace: Snapshot | null) {
  return (workspace?.contents ?? []).filter(item => !item.deletedAt).flatMap(content => content.plans.map(plan => {
    const day = plan.schedule.precision !== 'instant' ? plan.schedule.date : new Intl.DateTimeFormat('sv-SE', { timeZone: plan.schedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(plan.schedule.at));
    return { content, plan, day, channel: workspace?.channels.find(channel => channel.id === plan.channelId)?.name ?? '原渠道已不可用' };
  })).filter(item => item.plan.status !== 'cancelled').sort((a, b) => a.day.localeCompare(b.day));
}
function ContentLink({ item, open, busy }: { item: WorkspaceContent; open: Props['open']; busy: boolean }) {
  return <button className="text-link" disabled={busy} onClick={() => open(item)}>{item.title || '未命名内容'}</button>;
}
export function Overview({ workspace, open, busy }: Props) {
  const items = workspace?.contents.filter(item => !item.deletedAt) ?? [];
  const plans = scheduled(workspace);
  const upcoming = plans.filter(item => item.plan.status === 'planned' && item.day >= localDay(new Date()));
  return <section className="workspace-page"><div className="page-intro"><p className="eyebrow">YOUR CREATIVE WORKSPACE</p><h2>每一份灵感，都有下一步</h2><p>从真实内容库了解创作进度，继续今天想完成的内容。</p></div>
    <div className="stat-grid">{[['内容', items.length, '当前库中的活动内容'], ['待发布计划', plans.filter(item => item.plan.status === 'planned').length, '人工记录的发布安排'], ['封面候选', items.reduce((sum, item) => sum + item.candidateCount, 0), '已回库的图片'], ['提示词', workspace?.prompts.filter(prompt => prompt.enabled).length ?? 0, '当前可使用的提示词']].map(([label, count, note]) => <Card key={label}><span className="muted">{label}</span><strong className="stat-value">{workspace ? count : '—'}</strong><span className="muted">{note}</span></Card>)}</div>
    <div className="overview-columns"><Card title="接下来发布"><p className="muted">按记录的日期排序；这里不会自动发布到任何平台。</p>{upcoming.length ? upcoming.slice(0, 8).map(({ content, plan, day, channel }) => <div className="workspace-list-row" key={`${content.id}:${plan.id}`}><span className="date-badge">{day.slice(5)}</span><div><ContentLink item={content} open={open} busy={busy}/><p>{channel} · 待发布</p></div></div>) : <div className="blank-state">还没有接下来的发布计划。日历会显示库中已有的安排。</div>}</Card>
    <Card title="最近更新">{[...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map(item => <div className="workspace-list-row" key={item.id}><div><ContentLink item={item} open={open} busy={busy}/><p>{item.body ? `${item.body.slice(0, 62)}${item.body.length > 62 ? '…' : ''}` : '正文待补充'}</p></div><span className="tag">{item.selectedCandidateId ? '已选封面' : '创作中'}</span></div>)}{!items.length && <div className="blank-state">内容库还没有内容，从“内容”页新建第一篇。</div>}</Card></div></section>;
}
export function CalendarPage({ workspace, open, busy }: Props) {
  const [selected, setSelected] = useState(localDay(new Date()));
  const [mode, setMode] = useState<'month' | 'week' | 'date'>('month');
  const date = dayDate(selected), today = localDay(new Date());
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = mode === 'month' ? shiftDay(localDay(first), -(first.getDay() + 6) % 7) : mode === 'week' ? shiftDay(selected, -(date.getDay() + 6) % 7) : selected;
  const days = Array.from({ length: mode === 'month' ? 42 : mode === 'week' ? 7 : 1 }, (_, index) => shiftDay(start, index));
  const plans = scheduled(workspace);
  function move(direction: number) { if (mode === 'month') { const next = new Date(date.getFullYear(), date.getMonth() + direction, 1, 12); setSelected(localDay(next)); } else setSelected(shiftDay(selected, direction * (mode === 'week' ? 7 : 1))); }
  return <section className="workspace-page"><div className="page-intro"><h2>把发布节奏，放进日历</h2><p>展示内容库中的发布计划与已发布记录。仅人工安排、记录，不会自动发布。</p></div><Card><div className="calendar-toolbar"><div className="actions"><Button onClick={() => move(-1)} aria-label="上一个周期">‹</Button><h3>{mode === 'month' ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : selected}</h3><Button onClick={() => move(1)} aria-label="下一个周期">›</Button><Button onClick={() => setSelected(today)}>今天</Button></div><div className="actions">{(['month', 'week', 'date'] as const).map(value => <Button key={value} theme={mode === value ? 'solid' : 'borderless'} aria-pressed={mode === value} onClick={() => setMode(value)}>{{ month: '月', week: '周', date: '日' }[value]}</Button>)}</div></div>
    <label className="calendar-date">查看日期<input aria-label="日历日期" type="date" value={selected} onChange={event => { if (event.target.value) setSelected(event.target.value); }}/></label>
    {mode !== 'date' && <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>周{day}</span>)}</div>}
    <div className={`calendar-grid calendar-${mode}`}>{days.map(day => <section key={day} className={`calendar-cell${day === today ? ' today' : ''}${dayDate(day).getMonth() !== date.getMonth() ? ' outside' : ''}`}><button className="day-number" onClick={() => { setSelected(day); setMode('date'); }} aria-label={`查看 ${day}`}>{mode === 'date' ? day : dayDate(day).getDate()}</button>{plans.filter(item => item.day === day).map(({ content, plan, channel }) => <button className={`calendar-plan ${plan.status}`} key={`${content.id}:${plan.id}`} disabled={busy} onClick={() => open(content)}><strong>{content.title}</strong><span>{channel} · {plan.status === 'published' ? '已发布' : '待发布'}{plan.schedule.precision === 'instant' ? ` · ${new Intl.DateTimeFormat('zh-CN', { timeZone: plan.schedule.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(plan.schedule.at))} (${plan.schedule.timezone})` : plan.schedule.precision === 'local-minute' ? ` · ${plan.schedule.time}${plan.schedule.timezone ? ` (${plan.schedule.timezone})` : ''}` : ''}</span></button>)}{mode === 'date' && !plans.some(item => item.day === day) && <p className="muted">这一天没有发布记录。</p>}</section>)}</div></Card></section>;
}
export function PromptsPage({ workspace }: Pick<Props, 'workspace'>) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Prompt | null>(null);
  const prompts = workspace?.prompts.filter(prompt => prompt.enabled) ?? [];
  const categories = [...new Set(prompts.map(prompt => prompt.category).filter(Boolean))];
  const matching = prompts.filter(prompt => (!category || prompt.category === category) && `${prompt.title} ${prompt.body} ${prompt.summary} ${prompt.when} ${prompt.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="workspace-page"><div className="page-intro"><h2>好问题，让灵感继续</h2><p>找到适合当下的提示词，填入你的情况，再复制到助手中使用。</p></div><input className="page-search" type="search" aria-label="搜索提示词" placeholder="搜你遇到的情况，比如：标题、拆解、写作" value={query} onChange={event => setQuery(event.target.value)}/><div className="category-tabs"><Button theme={!category ? 'solid' : 'borderless'} onClick={() => setCategory('')}>全部 · {prompts.length}</Button>{categories.map(value => <Button key={value} theme={category === value ? 'solid' : 'borderless'} onClick={() => setCategory(value)}>{value}</Button>)}</div><div className="prompt-grid">{matching.map(prompt => <button className="prompt-card" key={prompt.id} onClick={() => setSelected(prompt)}><span className="tag">{prompt.category || '未分类'}</span><h3>{prompt.title}</h3><p>{prompt.when || prompt.summary || prompt.body.slice(0, 140)}</p><div className="prompt-tags">{prompt.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><span className="card-cta">{promptFields(prompt.body).length ? '填写并使用 ↗' : '查看并复制 ↗'}</span></button>)}</div>{!matching.length && <Card><div className="blank-state">{prompts.length ? '没有匹配的提示词，试试其他关键词或分类。' : '当前内容库还没有可用提示词。导入已有备份后可在这里使用。'}</div></Card>}{selected && <PromptDialog key={selected.id + selected.editToken} prompt={selected} close={() => setSelected(null)}/>}</section>;
}
function PromptDialog({ prompt, close }: { prompt: Prompt; close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null), [values, setValues] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [copying, setCopying] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const fields = promptFields(prompt.body), preview = fillPrompt(prompt.body, values);
  const missing = fields.filter(field => typeof values[field.key] !== 'string' || !values[field.key].trim());
  async function copy() { if (copying) return; if (missing.length) { setNotice(`请先填写：${missing.map(field => field.key).join('、')}`); return; } setCopying(true); try { await invoke('copyPrompt', {text: preview}); setNotice('已复制完整提示词，可以粘贴到助手。'); } catch { setNotice('复制失败，请在左侧预览中全选后手动复制。'); } finally { setCopying(false); } }
  return <dialog ref={dialog} className="prompt-dialog" aria-labelledby="prompt-dialog-title" onCancel={close}><div className="dialog-heading"><div><span className="eyebrow">{prompt.category || '提示词'}</span><h2 id="prompt-dialog-title">{prompt.title}</h2><p>{prompt.when || prompt.summary || '填写后复制到助手中使用。'}</p></div><Button aria-label="关闭提示词" onClick={close}>关闭</Button></div><div className={`prompt-use-grid${fields.length ? '' : ' no-fields'}`}><section><h3>提示词预览</h3><p className="muted">填写后实时更新，复制的就是这段完整内容。</p><textarea className="prompt-preview" value={preview} readOnly aria-label="最终提示词预览"/></section>{fields.length > 0 && <section className="prompt-fields"><h3>填入你的情况</h3><p className="muted">本次填写仅留在窗口中，不写入内容库。</p>{fields.map((field, index) => <div key={field.key}><label htmlFor={`prompt-field-${index}`}>{field.key}</label>{field.hint && <p className="field-hint">{field.hint}</p>}<textarea id={`prompt-field-${index}`} aria-required="true" value={typeof values[field.key] === 'string' ? values[field.key] : ''} onChange={event => { setValues(old => ({ ...old, [field.key]: event.target.value })); setNotice(''); }} placeholder={`填写${field.key}`}/></div>)}</section>}</div><footer className="dialog-footer"><span role="status" aria-live="polite">{notice || (fields.length ? `已填 ${fields.length - missing.length} / ${fields.length} 项` : '这条提示词无需填写。')}</span><Button theme="solid" disabled={copying} onClick={() => void copy()}>{copying ? '复制中…' : '复制完整提示词'}</Button></footer></dialog>;
}
export function TemplatesPage({ assets, busy, useTemplate }: { assets: CoverResults['listCoverAssets'] | null; busy: boolean; useTemplate(template: TemplateGroup): void }) {
  const [query, setQuery] = useState(''), [preview, setPreview] = useState<TemplateGroup | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  const matching = assets?.templates.filter(template => `${template.name} ${template.description}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <section className="workspace-page"><div className="page-intro"><h2>找到这一次的封面风格</h2><p>一组样张，共同定义一种风格。先选模板，再为自己的内容准备封面。</p></div><input className="page-search" type="search" aria-label="搜索模板" value={query} placeholder="搜索模板名称、风格与适用内容" onChange={event => setQuery(event.target.value)}/><div className="gallery-grid">{matching.map(template => <Card key={template.id} className="gallery-card"><button className="gallery-preview" onClick={() => setPreview(template)} aria-label={`预览 ${template.name} 整组样张`}>{template.samples.length ? <img src={template.samples[0].url} alt={`${template.name}首张样张`}/> : <span>此模板尚无可用样张</span>}<span>{template.samples.length} 张一组</span></button><div className="gallery-caption"><div><h3>{template.name}</h3><p>{template.description}</p></div><div className="gallery-footer"><span className="muted">{template.accepted && template.aiTested ? '已记录验收' : '生图待验收'}</span><Button disabled={busy || !template.samples.length} onClick={() => useTemplate(template)}>使用这组模板</Button></div></div></Card>)}</div>{!matching.length && <Card><div className="blank-state">{assets?.templates.length ? '没有匹配的模板，换个关键词试试。' : '打开内容库后，会显示库中可用的模板组。'}</div></Card>}{preview && <dialog ref={dialog} className="image-preview" onCancel={() => setPreview(null)} aria-label={preview.name}><div className="dialog-heading"><div><h2>{preview.name}</h2><p>{preview.samples.length} 张风格样张 · 同一模板组</p></div><Button onClick={() => setPreview(null)}>关闭预览</Button></div><div className="preview-grid">{preview.samples.map((sample, index) => <img key={sample.assetHash} src={sample.url} alt={`${preview.name}样张 ${index + 1}`}/>)}</div></dialog>}</section>;
}
