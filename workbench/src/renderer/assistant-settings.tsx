import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import Tabs from '@douyinfe/semi-ui-19/lib/es/tabs';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import Typography from '@douyinfe/semi-ui-19/lib/es/typography';
import {invoke} from './client.ts';
import {hasManagedDrafts, ProfileForm} from './library-panels.tsx';
import {ASSISTANTS} from '../shared/cover-contracts.ts';
import type {Assistant, AssistantSetup, CoverResults} from '../shared/cover-contracts.ts';
import type {TemplateAssistantSetup} from '../shared/template-contracts.ts';
import type {SetupView} from '../shared/setup-contracts.ts';
import type {Status} from '../shared/contracts.ts';
import type {WorkspaceLibrarySnapshot} from '../shared/workspace-contracts.ts';
import {PopupSelect} from './semi-controls.tsx';
import './creator-settings.css';

const SettingsHelpTarget = createContext<{actions: HTMLElement | null; guides: HTMLElement | null}>({actions: null, guides: null});
export function SettingsHelp({title, kind = 'guide', className = '', children}: {title: string; kind?: 'action' | 'recovery' | 'guide'; className?: string; children: ReactNode}) {
  const targets = useContext(SettingsHelpTarget);
  const target = kind === 'guide' ? targets.guides : targets.actions;
  if (!target) return null;
  return createPortal(kind === 'guide' ? <details className="creator-settings-help-guide"><summary>{title}</summary><div className="creator-settings-help-guide-body">{children}</div></details> : kind === 'recovery' ? <section className="creator-settings-help-recovery" aria-label={title}>{children}</section> : <Card className={className} title={title}>{children}</Card>, target);
}

interface SettingsProps {
  status: Status | null; busy: boolean; blocked: boolean;
  run<T>(action: () => Promise<T>): Promise<T | undefined>; close(): void;
  library?: WorkspaceLibrarySnapshot | null; assets?: CoverResults['listCoverAssets'] | null;
  refresh?(confirmed?: WorkspaceLibrarySnapshot): Promise<void>; managePhotos?(): void; manageLibrary?(): void; manageChannels?(): void;
  services?: ReactNode|((active:boolean)=>ReactNode); preferences?: ReactNode; setup?: ReactNode; recovery?: ReactNode; children?: ReactNode;
}
export function AssistantSettings({status, busy, blocked, run, close, library = null, assets = null, refresh, managePhotos, manageLibrary, manageChannels, services, preferences, setup: setupPanel, recovery, children}: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState('settings'), [helpActions, setHelpActions] = useState<HTMLDivElement | null>(null), [helpGuides, setHelpGuides] = useState<HTMLDivElement | null>(null);
  const [closeNotice, setCloseNotice] = useState(''), [editingProfile, setEditingProfile] = useState(false), [showAllPhotos, setShowAllPhotos] = useState(false);
  const requestClose = () => { if (hasManagedDrafts()) setCloseNotice('有尚未保存的设置或编辑，请先保存，或在对应表单中明确放弃修改。'); else close(); };
  const [setup, setSetup] = useState<AssistantSetup | null>(null);
  const [templateSetup, setTemplateSetup] = useState<TemplateAssistantSetup | null>(null);
  const [installation, setInstallation] = useState<SetupView | null>(null);
  const [checking, setChecking] = useState(false), [copying, setCopying] = useState(false);
  const [pluginNotice, setPluginNotice] = useState(''), [showInstall, setShowInstall] = useState(false);
  const checkRequest = useRef(0);
  const [checkFailed, setCheckFailed] = useState(false);
  const [builtinNotice, setBuiltinNotice] = useState('');
  const builtinsBlocked = busy || !status?.currentName || status.needsReselect || status.creating || !!status.pending || status.photoPending || status.coverPending || status.coverActionPending || !!status.workspacePending || !!status.templatePending || !!status.maintenance?.pending;
  const host = status?.assistant ?? 'codex';
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setPluginNotice('');
    void checkConnection();
    return () => { checkRequest.current++; };
  }, [host]);
  async function checkConnection() {
    const request = ++checkRequest.current;
    setSetup(null); setTemplateSetup(null); setInstallation(null); setCheckFailed(false); setChecking(true);
    try {
      const [next, template, installed] = await Promise.all([invoke('readAssistantSetup'), invoke('readTemplateAssistantSetup'), invoke('readSetup')]);
      if (request === checkRequest.current) {setSetup(next); setTemplateSetup(template); setInstallation(installed);}
    } catch {
      if (request === checkRequest.current) setCheckFailed(true);
    } finally {
      if (request === checkRequest.current) setChecking(false);
    }
  }
  const selectedSetup = setup?.host === host ? setup : null;
  const selectedInstallation = installation?.assistant.host === host ? installation : null;
  const marketAvailable = selectedInstallation?.market.state === 'available';
  const marketIssue = checking ? '正在读取配套插件安装信息…' : checkFailed ? '安装信息未能读取，请重新检查后再复制。' : !selectedInstallation ? '尚未读取到当前 AI 助手的安装信息，请重新检查。' : selectedInstallation.market.state === 'mismatch' ? '配套插件与当前应用版本、模式或架构不匹配，请获取完整匹配的安装包。' : !marketAvailable ? '当前安装没有可用的配套插件市场，请获取包含插件的完整安装包。' : '';
  const assistantName = host === 'workbuddy' ? 'WorkBuddy' : 'Codex';
  const profile = library?.settings.profile;
  const photos = assets?.photos.filter(photo => library?.photos.some(item => item.id === photo.id && !item.deletedAt)) ?? [];
  const avatar = photos.find(photo => photo.assetHash === profile?.avatarAssetHash && photo.availability === 'available')?.url;
  const profileMarks = [...['自媒体方向', '目标读者'].filter(key => !profile?.marks.some(mark => mark.key === key)).map(key => ({key, value: '待填写'})), ...(profile?.marks ?? [])];
  const textOverflow = {expandable: true, collapsible: true, expandText: '查看全部', collapseText: '收起'};
  const finishProfile = () => {setEditingProfile(false); setCloseNotice('');};
  const settingsProps = {library, busy: busy || blocked, run, refresh: refresh ?? (async () => {})};
  function openResource(action?: () => void) {
    if (!action) return;
    if (hasManagedDrafts()) { setCloseNotice('请先保存或放弃当前设置修改，再打开资料管理。'); return; }
    setCloseNotice(''); action();
  }
  return <dialog ref={dialog} className="leave-dialog settings-dialog creator-settings-dialog" onCancel={event => {event.preventDefault(); requestClose();}} aria-labelledby="settings-title">
    <header className="creator-settings-heading"><div><h2 id="settings-title">设置</h2><p>资料保存在你的本机内容库</p></div><Button id="close-settings" onClick={requestClose}>关闭设置</Button></header>
    {closeNotice && <p className="creator-settings-notice" role="alert">{closeNotice}</p>}
    <SettingsHelpTarget.Provider value={{actions: helpActions, guides: helpGuides}}><Tabs activeKey={tab} onChange={setTab} keepDOM lazyRender={false} tabPaneMotion={false} aria-label="设置与帮助"><Tabs.TabPane itemKey="settings" tab="常用设置"><div className="creator-settings-columns" hidden={tab !== 'settings'}><div className="creator-settings-column">
      <section className="creator-settings-profile" aria-label="个人信息"><Card title="个人信息" headerExtraContent={!editingProfile && <Button disabled={busy || blocked || !library || !refresh} onClick={() => {setCloseNotice(''); setEditingProfile(true);}}>编辑</Button>}>
        {editingProfile && library ? <ProfileForm props={settingsProps} embedded onSaved={finishProfile} onCancel={finishProfile}/> : <>
          <div className="creator-profile-preview"><span className="creator-profile-avatar">{avatar ? <img src={avatar} alt="个人头像"/> : <span aria-hidden="true">{profile?.name?.slice(0, 1) || '我'}</span>}</span><div><Typography.Title heading={3} ellipsis={{...textOverflow, rows: 2}}>{profile?.name || '添加你的昵称'}</Typography.Title><Typography.Paragraph className="creator-profile-intro" ellipsis={{...textOverflow, rows: 3}}>{profile?.intro || '介绍你自己，让创作更有自己的风格。'}</Typography.Paragraph></div></div>
          <dl className="creator-profile-facts">{profileMarks.map((mark, index) => <div key={index}><dt><Typography.Paragraph ellipsis={{...textOverflow, rows: 2}}>{mark.key}</Typography.Paragraph></dt><dd><Typography.Paragraph ellipsis={{...textOverflow, rows: 3}}>{mark.value || '待填写'}</Typography.Paragraph></dd></div>)}</dl>
        </>}
        <div className="creator-settings-photo-heading"><strong>我的照片</strong><div className="management-actions"><Button theme="borderless" disabled={busy || blocked || !library || !refresh} onClick={() => void run(async () => {await invoke('choosePhoto', {title: '我的照片', isOwnPhoto: false}); await refresh?.();})}>＋ 添加照片</Button><Button theme="borderless" disabled={busy || blocked || !managePhotos} onClick={() => openResource(managePhotos)}>管理</Button></div></div>
        <div className="creator-settings-photos">{(showAllPhotos ? photos : photos.slice(0, 5)).map(photo => <button key={photo.id} disabled={busy || blocked || !managePhotos} onClick={() => openResource(managePhotos)} aria-label={`管理照片：${photo.title}${photo.isOwnPhoto ? '，已声明为本人' : '，未声明为本人'}`}>{photo.url && photo.availability === 'available' ? <img src={photo.url} alt={photo.title}/> : <span>原图不可用</span>}</button>)}{!photos.length && <p>还没有照片，可以先添加一张。</p>}</div>{photos.length > 5 && <Button className="creator-settings-photo-toggle" theme="borderless" aria-expanded={showAllPhotos} onClick={() => setShowAllPhotos(!showAllPhotos)}>{showAllPhotos ? '收起照片' : `查看全部 ${photos.length} 张照片`}</Button>}<p className="creator-settings-hint">照片保存在本机。用于人物参考前，请在照片管理中确认本人声明。</p>
        {!library && <p className="creator-settings-hint">打开内容库后，即可保存个人信息与照片。</p>}
      </Card></section>
      {preferences}
      </div><div className="creator-settings-column">
      <Card className="creator-settings-channels" title="发布渠道"><div className="creator-settings-library"><div><strong>{library ? `${library.settings.channels.filter(channel => !channel.deletedAt).length} 个可用渠道` : '打开内容库后设置渠道'}</strong><p>渠道统一用于内容归档、封面和发布日程。</p></div><Button disabled={busy || blocked || !library || !manageChannels} onClick={() => openResource(manageChannels)}>管理渠道</Button></div><div className="creator-channel-preview">{library?.settings.channels.filter(channel => !channel.deletedAt).map(channel => <span key={channel.id} title={channel.name} style={{color: channel.ink, background: channel.bg}}>{channel.name}</span>)}</div>{library && !library.settings.channels.some(channel => !channel.deletedAt) && <p className="creator-settings-hint">还没有可用渠道，可添加你自己的发布渠道。</p>}</Card>
      <Card className="creator-settings-assistant" title="AI 助手"><div className="creator-settings-row"><label htmlFor="assistant">交给哪个 AI 助手</label><PopupSelect id="assistant" value={host} disabled={busy || blocked || copying || checking || !status} onChange={value => {const host = value as Assistant; void run(() => invoke('setAssistant', {host}));}}>{ASSISTANTS.map(host => <option key={host} value={host}>{host === 'codex' ? 'Codex（默认）' : 'WorkBuddy'}</option>)}</PopupSelect></div><p className="creator-settings-hint">封面、模板及后续 AI 任务共用这里选择的助手。</p>
        <div className="creator-settings-check"><span>检查连接</span><Button id="recheck-assistant" loading={checking} disabled={busy || checking || copying} onClick={() => void run(checkConnection)}>重新检查</Button></div>
        <div className="creator-settings-plugin-actions"><Button id="copy-assistant-plugin" loading={copying} disabled={busy || checking || copying || !marketAvailable} aria-describedby={marketIssue ? 'assistant-market-status' : undefined} onClick={() => void run(async () => {const request = checkRequest.current; setCopying(true); setPluginNotice(''); try {await invoke('copyPluginMarketLocation'); if (request === checkRequest.current) setPluginNotice(`安装位置已复制。请到 ${assistantName} 的插件页面添加本地市场并粘贴。`);} catch (error) {if (request === checkRequest.current) setPluginNotice(`复制安装位置失败：${error instanceof Error ? error.message : '请重试。'}`); throw error;} finally {setCopying(false);}})}>复制安装位置</Button><Button disabled={busy || copying} onClick={() => void run(async () => {try {await invoke('openSetupTarget', {target: 'assistant'}); setPluginNotice(`已请求打开 ${assistantName}，请在助手中完成安装。`);} catch (error) {setPluginNotice(`打开 ${assistantName} 失败：${error instanceof Error ? error.message : '请重试。'}`); throw error;}})}>打开 {assistantName}</Button><Button theme="borderless" aria-expanded={showInstall} aria-controls="assistant-install-guide" onClick={() => setShowInstall(!showInstall)}>怎么装</Button></div>
        {marketIssue && <p id="assistant-market-status" className="creator-settings-check-status" role="status">{marketIssue}</p>}
        {selectedInstallation && <p className="creator-settings-check-status">自媒体工作台 {selectedInstallation.version} · {selectedInstallation.platform === 'darwin' ? 'macOS' : selectedInstallation.platform === 'win32' ? 'Windows' : selectedInstallation.platform} · {selectedInstallation.arch === 'arm64' ? 'ARM64' : 'Intel / AMD 64 位'} · 随包插件同版，非助手实际已启用版本。</p>}
        {selectedInstallation?.mode !== 'disabled' && selectedInstallation && <p role="alert">这是旧的受限内部构建，无法处理业务。请安装当前版本的自媒体工作台。</p>}
        {pluginNotice && <p className="creator-settings-check-status" role="status">{pluginNotice}</p>}
        <div id="assistant-install-guide" className="creator-settings-install-guide" hidden={!showInstall}><ol><li>点击“复制安装位置”。</li><li>在 {assistantName} 的插件页面添加本地市场，粘贴刚复制的位置。</li><li>找到 Nova Content Hub，安装、启用并确认权限，再回这里“重新检查”。</li></ol><Button theme="borderless" onClick={() => setTab('help')}>更多安装说明与诊断</Button></div>
        <p className="creator-settings-check-status" role="status">AI 助手 · 封面制作：{checkFailed ? '检查未完成，请重新检查助手。' : !selectedSetup ? '正在检查助手与配套插件…' : selectedSetup.ready ? '执行插件已准备好。' : selectedSetup.reason === 'protocol-missing' ? '请安装并打开所选助手，再重新检查。' : selectedSetup.reason === 'skill-missing' ? '请先安装并启用工作台配套插件。' : '此构建尚未配置助手检查入口，请检查工作台安装。'}</p>
        <p className="creator-settings-check-status" role="status">模板学习与还原：{checkFailed ? '检查未完成' : templateSetup?.host !== host ? '正在检查…' : templateSetup.ready ? '已准备好。' : '配套模板执行能力尚未准备好，请安装并启用插件。'}</p>
        <SettingsHelp title="交接范围与照片使用"><p>检查本机打开协议与已安装的配套 Skill；实际生图能力、接单和结果仍需在助手中执行确认。</p><p>本人照保存在本机内容库。交给助手时，所选本机助手将获准读取这次固定输入；系统请求打开助手后，仍需在助手中选择模型并手动发送。</p></SettingsHelp>
      </Card>
      <Card className="creator-settings-library-card" title="内容库"><div className="creator-settings-library"><div><strong>{status?.currentName || '尚未打开内容库'}</strong><p>正文、封面、模板与照片都保存在这里。</p></div><Button disabled={busy || !manageLibrary} onClick={() => openResource(manageLibrary)}>管理内容库</Button></div>{status?.currentName && <><Button theme="borderless" disabled={busy} onClick={() => void run(() => invoke('revealLibraryFolder'))}>打开文件夹 →</Button><div className="creator-settings-check"><div><strong>内置模板与提示词</strong><p className="creator-settings-hint">补充新风格和提示词，保留已有修改与删除。</p></div><Button id="update-builtins" disabled={builtinsBlocked} onClick={() => {if (hasManagedDrafts()) {setCloseNotice('请先保存或放弃当前填写，再更新内置资源。'); return;} setBuiltinNotice('正在更新内置资源，请稍候…'); void run(async () => {try {await invoke('retryBuiltins'); setBuiltinNotice('内置模板与提示词已更新，已有修改和删除均已保留。');} catch (error) {setBuiltinNotice('更新尚未完成，原有内容保留；请处理工作台恢复提示后继续。'); throw error;}});}}>{status.seedPending ? '继续更新' : '更新内置资源'}</Button></div><p role="status">{builtinNotice}</p></>}</Card>
      </div>
      {setupPanel}
      {(recovery || children) && <SettingsHelp kind="recovery" title="内容库连接排错与恢复">{recovery}{children}</SettingsHelp>}
    </div></Tabs.TabPane><Tabs.TabPane itemKey="help" tab="帮助与排查"><div className="creator-settings-help" hidden={tab !== 'help'}><section aria-labelledby="settings-troubleshoot-title"><div className="creator-settings-help-heading"><h3 id="settings-troubleshoot-title">常用排查</h3><p>先检查状态，再按需要导出诊断或恢复连接。</p></div><div className="creator-settings-help-actions" ref={setHelpActions}/></section><section aria-labelledby="settings-guides-title"><div className="creator-settings-help-heading"><h3 id="settings-guides-title">使用说明</h3><p>按需展开查看操作步骤与注意事项。</p></div><div className="creator-settings-help-guides" ref={setHelpGuides}/></section></div></Tabs.TabPane><Tabs.TabPane tab="服务与模型" itemKey="services">{typeof services==='function'?services(tab==='services'):services}</Tabs.TabPane></Tabs></SettingsHelpTarget.Provider>
  </dialog>;
}
