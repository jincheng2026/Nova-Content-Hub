import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type {SetupView} from '../shared/setup-contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';
import {invoke} from './client.ts';
import {SettingsHelp} from './assistant-settings.tsx';

export function SetupPanel({busy, run, host}: {busy: boolean; host?: Assistant; run<T>(action: () => Promise<T>): Promise<T | undefined>}) {
    const [setup, setSetup] = useState<SetupView | null>(null), [notice, setNotice] = useState(''), [diagnosticNotice, setDiagnosticNotice] = useState('');
    useEffect(() => {let active = true; setSetup(null); void invoke('readSetup').then(value => {if (active) setSetup(value);}, () => {if (active) setNotice('安装信息未能读取，请重新检查。');}); return () => {active = false;};}, [host]);
    async function refresh() {setSetup(await invoke('readSetup')); setNotice('安装信息已更新。');}
    const assistant = setup?.assistant.host === 'workbuddy' ? 'WorkBuddy' : 'Codex';
    return <section className="setup-panel" aria-label="配套插件与使用帮助"><Card title="配套插件与版本">
        <p className="setup-version">{setup ? `自媒体工作台 ${setup.version} · ${setup.platform === 'darwin' ? 'macOS' : setup.platform === 'win32' ? 'Windows' : setup.platform} · ${setup.arch === 'arm64' ? 'ARM64' : 'Intel / AMD 64 位'}` : '正在读取安装信息…'}</p>
        {setup && <>
            {setup.mode !== 'disabled' && <p role="alert">这是旧的受限内部构建，无法处理业务。请安装一期免费体验版；本页不切换构建模式。</p>}
            <p role="status">{assistant}：{setup.assistant.ready ? '配套插件已连接，实际 AI 任务需在助手中执行确认。' : setup.assistant.reason === 'protocol-missing' ? '请先安装并打开一次，再回这里检查。' : '需要安装或启用配套插件。'}</p>
            <div className="management-actions">{!setup.assistant.ready && <Button theme="solid" disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => {await invoke('copyPluginMarketLocation'); setNotice(`完整安装位置已复制。若 ${assistant} 未打开，可点击“打开 ${assistant}”重试。`); await invoke('openSetupTarget', {target: 'assistant'}); setNotice(`安装位置已复制，已请求打开 ${assistant}。请到插件页面添加本地市场并粘贴。`);})}>准备安装插件</Button>}<Button disabled={busy} onClick={() => void run(async () => {await invoke('openSetupTarget', {target: 'assistant'}); setNotice(`已请求打开 ${assistant}。`);})}>打开 {assistant}</Button><Button disabled={busy} onClick={() => void run(refresh)}>检查插件</Button></div>
            {setup.market.state !== 'available' && <p role="alert">{setup.market.state === 'mismatch' ? '配套插件与当前应用版本不匹配，请获取完整安装包。' : '当前安装没有配套插件，请获取包含插件的完整安装包。'}</p>}
            <SettingsHelp title="插件怎么安装"><ol><li>在“常用设置 → AI 助手”中点击“复制安装位置”。也可点击“准备安装插件”，复制位置并打开助手。</li><li>在助手的插件页面选择添加本地市场，粘贴刚复制的位置即可，无需查找文件或修改路径。</li><li>找到 Nova Content Hub，按助手提示安装、启用并确认插件权限，然后回 AI 助手卡中“重新检查”。</li></ol><div className="management-actions">{setup.assistant.ready && <Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => {await invoke('copyPluginMarketLocation'); setNotice('完整安装位置已复制。'); await invoke('openSetupTarget', {target: 'assistant'});})}>复制安装位置并打开助手</Button>}<Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => {await invoke('openSetupTarget', {target: 'market'}); setNotice('已请求打开配套插件文件夹。');})}>查看插件文件</Button></div>{notice && <p role="status">{notice}</p>}<p>选择助手在“常用设置 → AI 助手”中调整。封面、模板及后续 AI 任务共用此选择，可能使用你已有的助手额度；打开助手不代表任务已经执行成功。</p></SettingsHelp>
            <SettingsHelp title="安装与升级"><ol><li>升级前，在“内容库 → 备份与维护”备份你的内容库。</li><li>macOS：退出工作台，将新版本拖入“应用程序”。Windows：退出工作台，运行新版本安装程序。</li><li>保留原内容库文件夹，重新打开工作台后继续使用；如配套插件有更新，一并安装再检查连接。</li></ol><p>请选择与你系统及芯片匹配的安装包。内容库独立于应用安装目录；更换或卸载应用时不要删除内容库。</p></SettingsHelp>
            <SettingsHelp title="macOS 提示无法打开或应用损坏"><p>先保留安装包，核对下载来源、系统及芯片版本。如系统允许，可在“系统设置 → 隐私与安全性”查看原始拦截提示并选择系统提供的打开入口；仍无法打开时请提供提示原文，并在“导出诊断”中保存诊断文件。</p><p>此安装包尚未完成 Apple Developer ID 签名与公证。请保留系统保护设置；损坏提示也可能来自下载不完整。</p></SettingsHelp>
        </>}
        <SettingsHelp kind="action" className="creator-settings-help-diagnostics" title="导出诊断"><p>只包含版本、系统、数量和有限错误码，不含目录路径、正文、照片或凭据。保存到本机后，由你决定是否分享。</p><Button disabled={busy} onClick={() => void run(async () => {const result = await invoke('exportDiagnostics'); if (result.exported) setDiagnosticNotice(`诊断已保存：${result.name}`);})}>保存诊断文件</Button>{diagnosticNotice && <p role="status">{diagnosticNotice}</p>}</SettingsHelp>
        {!setup && <Button disabled={busy} onClick={() => void run(refresh)}>重新读取安装信息</Button>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}
