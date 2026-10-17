'use strict';
const $ = id => document.getElementById(id);
const labels = { prepared: '任务已准备，可继续导入', running: '任务仍在运行；若上次已中断，可点击继续导入核验', blocked: '任务遇到阻断，可修复问题后继续导入', ready: '数据已核验，等待写入新库', publishing: '正在提交新库，可继续导入', committed: '导入已完成' };
let acting = false;
async function invoke(method) {
  const reply = await window.contentHub[method]();
  if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.value;
}
function line(parent, text, tag = 'p') { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; }
function render(value) {
  $('selection').textContent = `旧备份：${value.sourceName || '未选择'}　新内容库：${value.destinationName || '未选择'}`;
  $('preview').replaceChildren();
  if (value.inspection) {
    const c = value.inspection.counts;
    line($('preview'), `预检：内容 ${c.contents} · 合集 ${c.collections} · 模板 ${c.templates} · 照片 ${c.photos} · 提示词 ${c.prompts} · 发布 ${c.publications} · 回收项 ${c.trash}`);
    line($('preview'), '预检只读；存在内嵌图片不代表已经完整解码。');
    for (const warning of value.inspection.warnings) line($('preview'), warning.message);
  }
  const task = value.task;
  $('status').textContent = value.busy ? '文件工作进程正在处理，请稍候。' : task ? `${labels[task.status] || '状态未知'}${task.progress?.steps ? ` · 已记录 ${task.progress.steps} 个步骤` : ''}` : value.started ? '上次操作尚无已接受的磁盘任务，可再次导入同一备份到原位置。' : '选择备份并预检后，使用系统窗口指定新内容库位置。';
  if (task?.targetChanged) $('status').textContent += '。原内容库位置已被替换，请恢复原目录；不会覆盖替代目录。';
  if (task?.descriptorChanged) $('status').textContent += '。内容库格式已变更，旧导入完成事实保留。';
  $('issues').replaceChildren();
  const issues = task?.issues || [];
  if (issues.length) line($('issues'), `有 ${issues.length} 项待确认。缺失或不支持的资源保留了记录；本技术入口暂不提供补文件界面。`, 'li');
  for (const issue of issues.slice(0, 50)) line($('issues'), `${issue.code || '资源待补齐'}${issue.key ? ` · ${issue.key}` : ''}`, 'li');
  $('backup').disabled = acting || value.busy || (!!task && task.status !== 'committed');
  $('destination').disabled = acting || value.busy || !value.sourceName || !!task;
  $('import').disabled = acting || value.busy || !value.destinationName || !!task;
  $('resume').disabled = acting || value.busy || !task || task.status === 'committed' || task.targetChanged;
  $('list').disabled = acting || value.busy || task?.status !== 'committed' || task.targetChanged;
}
async function refresh() { render(await invoke('status')); }
async function act(method) {
  if (acting) return;
  acting = true; $('error').textContent = '';
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  $('status').textContent = '正在处理。中断或退出后可重新查询，再继续同一任务。';
  try {
    const value = await invoke(method);
    if (method === 'chooseBackup') { $('contents').replaceChildren(); line($('contents'), '导入完成后可查看内容。'); }
    if (method === 'listContents') renderContents(value);
    if (method === 'importBackup' || method === 'resumeImport') await showContents();
  } catch (error) { $('error').textContent = `${error.message}（${error.code || 'IO_ERROR'}）`; }
  finally {
    acting = false; $('refresh').disabled = false;
    try { await refresh(); } catch (error) { $('error').textContent = `${error.message}（${error.code || 'IO_ERROR'}）`; }
  }
}
async function showContents() {
  const status = await invoke('status');
  if (status.task?.status === 'committed' && !status.task.targetChanged) {
    renderContents(await invoke('listContents'));
  }
}
function renderContents(value) {
  $('contents').replaceChildren();
  if (!value.length) line($('contents'), '内容库中没有活动内容；合集及回收项由文件核心保留。');
  for (const item of value) { const details = document.createElement('details'); line(details, item.title, 'summary'); line(details, item.body || '（基础正文为空；旧渠道文案保存在各自发布计划中。）', 'pre'); $('contents').append(details); }
}
for (const [id, method] of Object.entries({ backup: 'chooseBackup', destination: 'chooseDestination', import: 'importBackup', resume: 'resumeImport', refresh: 'status', list: 'listContents' })) $(id).addEventListener('click', () => act(method));
refresh().catch(error => { $('error').textContent = `${error.message}（${error.code || 'IO_ERROR'}）`; });
