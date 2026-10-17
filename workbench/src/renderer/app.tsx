import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@douyinfe/semi-ui-19/react19-adapter';
import Banner from '@douyinfe/semi-ui-19/lib/es/banner';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import '@douyinfe/semi-ui-19/lib/es/_base/base.css';
import './style.css';
import { errorInfo } from '../shared/contracts.ts';
import type { Content, DesktopMethod, DesktopResults, Status, TaskStatus } from '../shared/contracts.ts';

const labels: Record<TaskStatus, string> = { prepared: '任务已准备，可继续导入', running: '任务仍在运行；若上次已中断，可点击继续导入核验', blocked: '任务遇到阻断，可修复问题后继续导入', ready: '数据已核验，等待写入新库', publishing: '正在提交新库，可继续导入', committed: '导入已完成' };
async function invoke<K extends DesktopMethod>(method: K): Promise<DesktopResults[K]> {
  const reply = await window.contentHub[method]();
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.value as DesktopResults[K];
}
function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [contents, setContents] = useState<Content[] | null>(null);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const active = useRef(false);
  const report = (failure: unknown) => { const value = errorInfo(failure); setError(`${value.message}（${value.code}）`); };
  useEffect(() => { invoke('status').then(setStatus).catch(report); }, []);
  async function act(method: DesktopMethod) {
    if (active.current) return;
    active.current = true; setActing(true); setError('');
    try {
      if (method === 'listContents') setContents(await invoke('listContents'));
      else {
        await invoke(method);
        if (method === 'chooseBackup') setContents(null);
        if (method === 'importBackup' || method === 'resumeImport') {
          const next = await invoke('status');
          if (next.task?.status === 'committed' && !next.task.targetChanged) setContents(await invoke('listContents'));
        }
      }
    } catch (failure) { report(failure); }
    finally {
      try { setStatus(await invoke('status')); } catch (failure) { report(failure); }
      active.current = false; setActing(false);
    }
  }
  const task = status?.task;
  const busy = acting || !status || status.busy;
  let message = !status ? '正在读取机器绑定…' : acting ? '正在处理。中断或退出后可重新查询，再继续同一任务。' : status.busy ? '文件工作进程正在处理，请稍候。' : task ? `${labels[task.status]}${task.progress.steps ? ` · 已记录 ${task.progress.steps} 个步骤` : ''}` : status.started ? '上次操作尚无已接受的磁盘任务，可再次导入同一备份到原位置。' : '选择备份并预检后，使用系统窗口指定新内容库位置。';
  if (task?.targetChanged) message += '。原内容库位置已被替换，请恢复原目录；不会覆盖替代目录。';
  if (task?.descriptorChanged) message += '。内容库格式已变更，旧导入完成事实保留。';
  const counts = status?.inspection?.counts;
  return <main data-app="ready" data-loaded={status ? 'true' : 'false'} data-busy={acting ? 'true' : 'false'}>
    <header><p className="eyebrow">NOVA CONTENT HUB / 本地内容工作台</p><Typography.Title heading={1}>从旧工作台开始</Typography.Title><Typography.Paragraph>选择备份，检查数量，再导入到一个新内容库。导入中断后，下次打开可继续同一任务。</Typography.Paragraph></header>
    <Banner type="info" closeIcon={null} description="此入口仅验证本地导入与读取；正式授权和助手生成尚未接入。" />
    <Card title={<h2 id="import-heading">导入旧备份</h2>} aria-labelledby="import-heading">
      <div className="actions"><Button id="backup" theme="solid" disabled={busy || (!!task && task.status !== 'committed')} onClick={() => void act('chooseBackup')}>选择旧备份</Button><Button id="destination" disabled={busy || !status?.sourceName || !!task} onClick={() => void act('chooseDestination')}>选择新库位置</Button></div>
      <p id="selection">旧备份：{status?.sourceName || '未选择'}　新内容库：{status?.destinationName || '未选择'}</p>
      <div id="preview">{counts && <><p>预检：内容 {counts.contents} · 合集 {counts.collections} · 模板 {counts.templates} · 照片 {counts.photos} · 提示词 {counts.prompts} · 发布 {counts.publications} · 回收项 {counts.trash}</p><p>预检只读；存在内嵌图片不代表已经完整解码。</p>{status.inspection?.warnings.map(warning => <p key={warning.code}>{warning.message}</p>)}</>}</div>
      <div className="actions"><Button id="import" theme="solid" disabled={busy || !status?.destinationName || !!task} onClick={() => void act('importBackup')}>导入并打开</Button><Button id="resume" disabled={busy || !task || task.status === 'committed' || task.targetChanged} onClick={() => void act('resumeImport')}>继续导入</Button><Button id="refresh" disabled={acting} onClick={() => void act('status')}>查询状态</Button><Button id="list" disabled={busy || task?.status !== 'committed' || task.targetChanged} onClick={() => void act('listContents')}>查看内容</Button></div>
      <p id="status" role="status" aria-live="polite">{message}</p><p id="error" role="alert">{error}</p>
      <ul id="issues">{!!task?.issues.length && <li>有 {task.issues.length} 项待确认。缺失或不支持的资源保留了记录；本技术入口暂不提供补文件界面。</li>}{task?.issues.slice(0, 50).map((issue, index) => <li key={index}>{issue.code || '资源待补齐'}{issue.key ? ` · ${issue.key}` : ''}</li>)}</ul>
    </Card>
    <Card title={<h2 id="content-heading">内容列表</h2>} aria-labelledby="content-heading"><div id="contents">{contents === null ? <p>导入完成后可查看内容。</p> : contents.length === 0 ? <p>内容库中没有活动内容；合集及回收项由文件核心保留。</p> : contents.map(item => <details key={item.id}><summary>{item.title}</summary><pre>{item.body || '（基础正文为空；旧渠道文案保存在各自发布计划中。）'}</pre></details>)}</div></Card>
  </main>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Renderer root is missing');
createRoot(root).render(<App />);
