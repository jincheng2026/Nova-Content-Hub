import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type {SetupView} from '../shared/setup-contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';
import {invoke} from './client.ts';

export function SetupPanel({busy, run, host}: {busy: boolean; host?: Assistant; run<T>(action: () => Promise<T>): Promise<T | undefined>}) {
    const [setup, setSetup] = useState<SetupView | null>(null), [notice, setNotice] = useState('');
    useEffect(() => { let active = true; setSetup(null); void invoke('readSetup').then(value => { if (active) setSetup(value); }, () => { if (active) setNotice('安装信息未能读取，请重新检查。'); }); return () => { active = false; }; }, [host]);
    async function refresh() { setSetup(await invoke('readSetup')); setNotice('安装信息已更新。'); }
    const assistant = setup?.assistant.host === 'workbuddy' ? 'WorkBuddy' : 'Codex';
    return <section className="setup-panel" aria-label="版本与使用帮助"><Card title="版本与使用帮助">
        <p>{setup ? `自媒体工作台 ${setup.version} · ${setup.platform === 'darwin' ? 'macOS' : setup.platform === 'win32' ? 'Windows' : setup.platform} · ${setup.arch === 'arm64' ? 'ARM64' : 'Intel / AMD 64 位'}` : '正在读取安装信息…'}</p>
        {setup && <>
            <p className="muted">{setup.mode === 'disabled' ? '免费体验版，无需注册或登录。内容与图片保存在你选择的本机内容库中。' : '这是旧的受限内部构建，无法处理业务。请安装一期免费体验版；本页不切换构建模式。'}</p>
            <h3>连接你的 AI 助手</h3>
            <p role="status">{assistant}：{setup.assistant.ready ? '已找到匹配的配套插件，可以回到内容中制作封面。' : setup.assistant.reason === 'protocol-missing' ? '请先安装并打开一次，再回这里检查。' : '需要安装或启用配套插件，按下方说明完成一次即可。'}</p>
            <div className="management-actions"><Button disabled={busy} onClick={() => void run(async () => { await invoke('openSetupTarget', {target: 'assistant'}); setNotice(`已请求打开 ${assistant}。`); })}>打开 {assistant}</Button><Button disabled={busy} onClick={() => void run(refresh)}>重新检查连接</Button></div>
            {!setup.assistant.ready && <details open><summary>第一次连接：安装配套插件</summary>
                <ol><li>打开 {assistant} 的插件页面，选择添加本地插件市场。</li><li>点击下方“复制插件位置”，粘贴到助手的添加窗口。Codex 选择市场中的 <code>.agents/plugins/marketplace.json</code> 文件；WorkBuddy 选择整个市场文件夹。</li><li>找到 Nova Content Hub，按助手提示安装、启用并确认插件权限，然后回这里重新检查连接。</li></ol>
                <div className="management-actions"><Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => { await invoke('copyPluginMarketLocation'); setNotice('插件位置已复制，可粘贴到助手的添加窗口。'); })}>复制插件位置</Button><Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => { await invoke('openSetupTarget', {target: 'market'}); setNotice('已请求打开配套插件文件夹。'); })}>打开插件文件夹</Button></div>
                {setup.market.state !== 'available' && <p role="alert">{setup.market.state === 'mismatch' ? '配套插件与当前应用版本不匹配，请获取完整安装包。' : '当前安装没有配套插件，请获取包含插件的完整安装包。'}</p>}
            </details>}
            <p className="muted">选择哪位助手统一在设置顶部调整。封面由助手生成，可能使用你已有的助手额度；打开助手不代表已经生成成功。</p>
            <details><summary>安装与升级</summary><ol><li>升级前，在“内容库 → 备份与维护”备份你的内容库。</li><li>macOS：退出工作台，将新版本拖入“应用程序”。Windows：退出工作台，运行新版本安装程序。</li><li>保留原内容库文件夹，重新打开工作台后继续使用；如配套插件有更新，一并安装再检查连接。</li></ol><p className="muted">请选择与你系统及芯片匹配的安装包。内容库独立于应用安装目录；更换或卸载应用时不要删除内容库。</p></details>
            <details><summary>macOS 提示无法打开或应用损坏</summary><p>先保留安装包，核对下载来源、系统及芯片版本。如系统允许，可在“系统设置 → 隐私与安全性”查看原始拦截提示并选择系统提供的打开入口；仍无法打开时请提供提示原文与下方诊断。</p><p className="muted">安装包尚未完成正式签名、公证及多平台验收。这里不会自动修改系统安全设置；损坏提示也可能来自下载不完整。</p></details>
        </>}
        <details><summary>遇到问题：导出诊断</summary><p className="muted">只包含版本、系统、数量和有限错误码，不含目录路径、正文、照片或凭据。保存到本机后，由你决定是否分享。</p><Button disabled={busy} onClick={() => void run(async () => { const result = await invoke('exportDiagnostics'); if (result.exported) setNotice(`诊断已保存：${result.name}`); })}>保存诊断文件</Button></details>
        {!setup && <Button disabled={busy} onClick={() => void run(refresh)}>重新读取安装信息</Button>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}
