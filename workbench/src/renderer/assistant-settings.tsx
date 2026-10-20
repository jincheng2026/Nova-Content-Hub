import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import Tabs from '@douyinfe/semi-ui-19/lib/es/tabs';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import {invoke} from './client.ts';
import {hasManagedDrafts, ProfileForm} from './library-panels.tsx';
import {ASSISTANTS} from '../shared/cover-contracts.ts';
import type {Assistant, AssistantSetup, CoverResults} from '../shared/cover-contracts.ts';
import type {TemplateAssistantSetup} from '../shared/template-contracts.ts';
import type {Status} from '../shared/contracts.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {PopupSelect} from './semi-controls.tsx';
import './creator-settings.css';

const SettingsHelpTarget = createContext<HTMLElement | null>(null);
export function SettingsHelp({title, children}: {title: string; children: ReactNode}) {
  const target = useContext(SettingsHelpTarget);
  return target ? createPortal(<Card title={title}>{children}</Card>, target) : null;
}

interface SettingsProps {
  status: Status | null; busy: boolean; blocked: boolean;
  run<T>(action: () => Promise<T>): Promise<T | undefined>; close(): void;
  library?: WorkspaceLibrarySnapshot | null; assets?: CoverResults['listCoverAssets'] | null;
  refresh?(): Promise<void>; managePhotos?(): void; manageLibrary?(): void; manageChannels?(): void;
  preferences?: ReactNode; setup?: ReactNode; recovery?: ReactNode; children?: ReactNode;
}
export function AssistantSettings({status, busy, blocked, run, close, library = null, assets = null, refresh, managePhotos, manageLibrary, manageChannels, preferences, setup: setupPanel, recovery, children}: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState('settings'), [helpTarget, setHelpTarget] = useState<HTMLDivElement | null>(null);
  const [closeNotice, setCloseNotice] = useState(''), [editingProfile, setEditingProfile] = useState(false);
  const requestClose = () => { if (hasManagedDrafts()) setCloseNotice('有尚未保存的设置或编辑，请先保存，或在对应表单中明确放弃修改。'); else close(); };
  const [setup, setSetup] = useState<AssistantSetup | null>(null);
  const [templateSetup, setTemplateSetup] = useState<TemplateAssistantSetup | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [builtinNotice, setBuiltinNotice] = useState('');
  const builtinsBlocked = busy || !status?.currentName || status.needsReselect || status.creating || !!status.pending || status.photoPending || status.coverPending || status.coverActionPending || !!status.workspacePending || !!status.templatePending || !!status.maintenance?.pending || status.started && status.task?.status !== 'committed';
  const host = status?.assistant ?? 'codex';
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let current = true;
    setSetup(null); setTemplateSetup(null); setCheckFailed(false);
    void Promise.all([invoke('readAssistantSetup'), invoke('readTemplateAssistantSetup')]).then(([next, template]) => { if (current) { setSetup(next); setTemplateSetup(template); } }, () => { if (current) setCheckFailed(true); });
    return () => { current = false; };
  }, [host]);
  const selectedSetup = setup?.host === host ? setup : null;
  const profile = library?.settings.profile;
  const photos = assets?.photos.filter(photo => library?.photos.some(item => item.id === photo.id && !item.deletedAt)) ?? [];
  const avatar = photos.find(photo => photo.assetHash === profile?.avatarAssetHash && photo.availability === 'available')?.url;
  const settingsProps = {library, busy: busy || blocked, run, refresh: refresh ?? (async () => {})};
  function openResource(action?: () => void) {
    if (!action) return;
    if (hasManagedDrafts()) { setCloseNotice('请先保存或放弃当前设置修改，再打开资料管理。'); return; }
    setCloseNotice(''); action();
  }
  return <dialog ref={dialog} className="leave-dialog settings-dialog creator-settings-dialog" onCancel={event => {event.preventDefault(); requestClose();}} aria-labelledby="settings-title">
    <header className="creator-settings-heading"><div><h2 id="settings-title">设置</h2><p>免费体验 · 资料保存在你的本机内容库</p></div><Button id="close-settings" onClick={requestClose}>关闭设置</Button></header>
    {closeNotice && <p className="creator-settings-notice" role="alert">{closeNotice}</p>}
    <SettingsHelpTarget.Provider value={helpTarget}><Tabs activeKey={tab} onChange={setTab} keepDOM lazyRender={false} tabPaneMotion={false} aria-label="设置与帮助"><Tabs.TabPane itemKey="settings" tab="常用设置"><div className="creator-settings-columns" hidden={tab !== 'settings'}>
      <Card className="creator-settings-assistant" title="全局助手"><div className="creator-settings-row"><label htmlFor="assistant">交给哪个 AI 助手</label><PopupSelect id="assistant" value={host} disabled={busy || blocked || !status} onChange={value => {const host = value as Assistant; void run(() => invoke('setAssistant', {host}));}}>{ASSISTANTS.map(host => <option key={host} value={host}>{host === 'codex' ? 'Codex（默认）' : 'WorkBuddy'}</option>)}</PopupSelect></div><p className="creator-settings-hint">制作封面和学习模板时，统一交给这里选择的助手。</p>
        <div className="creator-settings-check"><span>检查连接</span><Button id="recheck-assistant" disabled={busy} onClick={() => void run(async () => {try {const [next, template] = await Promise.all([invoke('readAssistantSetup'), invoke('readTemplateAssistantSetup')]); setSetup(next); setTemplateSetup(template); setCheckFailed(false);} catch (error) {setCheckFailed(true); throw error;}})}>重新检查</Button></div>
        <p className="creator-settings-check-status" role="status">{checkFailed ? '检查未完成，请重新检查助手。' : !selectedSetup ? '正在检查助手与配套插件…' : selectedSetup.ready ? '封面助手已准备好。' : selectedSetup.reason === 'protocol-missing' ? '请安装并打开所选助手，再重新检查。' : selectedSetup.reason === 'skill-missing' ? '请先安装并启用工作台配套插件。' : '此构建尚未配置助手检查入口，请检查工作台安装。'}</p>
        <p className="creator-settings-check-status" role="status">模板学习与还原：{checkFailed ? '检查未完成' : templateSetup?.host !== host ? '正在检查…' : templateSetup.ready ? '已准备好。' : '配套模板执行能力尚未准备好，请安装并启用插件。'}</p>
        <SettingsHelp title="交接范围与照片使用"><p>检查本机打开协议与已安装的配套 Skill；实际生图能力、接单和结果仍需在助手中执行确认。</p><p>本人照保存在本机内容库。交给助手时，所选本机助手将获准读取这次固定输入；系统请求打开助手后，仍需在助手中确认执行。</p></SettingsHelp>
      </Card>
      <Card className="creator-settings-library-card" title="内容库"><div className="creator-settings-library"><div><strong>{status?.currentName || '尚未打开内容库'}</strong><p>正文、封面、模板与照片都保存在这里。</p></div><Button disabled={busy || !manageLibrary} onClick={() => openResource(manageLibrary)}>管理内容库</Button></div>{status?.currentName && <><Button theme="borderless" disabled={busy} onClick={() => void run(() => invoke('revealLibraryFolder'))}>打开文件夹 →</Button><div className="creator-settings-check"><div><strong>内置模板与提示词</strong><p className="creator-settings-hint">补充新风格和提示词，保留已有修改与删除。</p></div><Button id="update-builtins" disabled={builtinsBlocked} onClick={() => {if (hasManagedDrafts()) {setCloseNotice('请先保存或放弃当前填写，再更新内置资源。'); return;} setBuiltinNotice('正在更新内置资源，请稍候…'); void run(async () => {try {await invoke('retryBuiltins'); setBuiltinNotice('内置模板与提示词已更新，已有修改和删除均已保留。');} catch (error) {setBuiltinNotice('更新尚未完成，原有内容保留；请处理工作台恢复提示后继续。'); throw error;}});}}>{status.seedPending ? '继续更新' : '更新内置资源'}</Button></div><p role="status">{builtinNotice}</p></>}</Card>
      {setupPanel}
      {preferences}
      <section className="creator-settings-profile" aria-label="个人信息"><Card title="个人信息" headerExtraContent={<Button disabled={busy || blocked || !library || !refresh} onClick={() => {if (editingProfile && hasManagedDrafts()) {setCloseNotice('个人信息有未保存修改，请先保存，或选择“放弃修改并重新读取”。'); return;} setCloseNotice(''); setEditingProfile(!editingProfile);}}>{editingProfile ? '返回预览' : '编辑'}</Button>}>
        <div className="creator-profile-preview"><span className="creator-profile-avatar">{avatar ? <img src={avatar} alt="个人头像"/> : <span aria-hidden="true">{profile?.name?.slice(0, 1) || '我'}</span>}</span><div><h3>{profile?.name || '添加你的昵称'}</h3><p>{profile?.intro || '介绍你自己，让创作更有自己的风格。'}</p></div></div>
        <dl className="creator-profile-facts"><div><dt>自媒体方向</dt><dd>{profile?.marks.find(mark => mark.key === '自媒体方向')?.value || '待填写'}</dd></div><div><dt>目标读者</dt><dd>{profile?.marks.find(mark => mark.key === '目标读者')?.value || '待填写'}</dd></div></dl>
        <div className="creator-settings-photo-heading"><strong>我的照片</strong><div className="management-actions"><Button theme="borderless" disabled={busy || blocked || !library || !refresh} onClick={() => void run(async () => {await invoke('choosePhoto', {title: '我的照片', isOwnPhoto: false}); await refresh?.();})}>＋ 添加照片</Button><Button theme="borderless" disabled={busy || blocked || !managePhotos} onClick={() => openResource(managePhotos)}>管理</Button></div></div>
        <div className="creator-settings-photos">{photos.slice(0, 5).map(photo => <button key={photo.id} disabled={busy || blocked || !managePhotos} onClick={() => openResource(managePhotos)} aria-label={`管理照片：${photo.title}${photo.isOwnPhoto ? '，已声明为本人' : '，未声明为本人'}`}>{photo.url && photo.availability === 'available' ? <img src={photo.url} alt={photo.title}/> : <span>原图不可用</span>}</button>)}{!photos.length && <p>还没有照片，可以先添加一张。</p>}</div><p className="creator-settings-hint">照片保存在本机。用于人物参考前，请在照片管理中确认本人声明。</p>
        {!library && <p className="creator-settings-hint">打开内容库后，即可保存个人信息与照片。</p>}
      </Card>{editingProfile && library && <ProfileForm props={settingsProps}/>}</section>
      <Card className="creator-settings-channels" title="发布渠道"><div className="creator-settings-library"><div><strong>{library ? `${library.settings.channels.filter(channel => !channel.deletedAt).length} 个可用渠道` : '打开内容库后设置渠道'}</strong><p>渠道统一用于内容归档、封面和发布日程。</p></div><Button disabled={busy || blocked || !library || !manageChannels} onClick={() => openResource(manageChannels)}>管理渠道</Button></div><div className="creator-channel-preview">{library?.settings.channels.filter(channel => !channel.deletedAt).map(channel => <span key={channel.id} style={{color: channel.ink, background: channel.bg}}>{channel.name}</span>)}</div>{library && !library.settings.channels.some(channel => !channel.deletedAt) && <p className="creator-settings-hint">还没有可用渠道，可添加你自己的发布渠道。</p>}</Card>
      {(recovery || children) && <SettingsHelp title="内容库连接排错与恢复">{recovery}{children}</SettingsHelp>}
    </div></Tabs.TabPane><Tabs.TabPane itemKey="help" tab="帮助与排查"><div className="creator-settings-help" ref={setHelpTarget} hidden={tab !== 'help'}/></Tabs.TabPane></Tabs></SettingsHelpTarget.Provider>
  </dialog>;
}
