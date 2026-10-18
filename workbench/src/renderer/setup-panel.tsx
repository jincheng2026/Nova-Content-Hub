import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import type {SetupView} from '../shared/setup-contracts.ts';
import {invoke} from './client.ts';

export function SetupPanel({busy, run}: {busy: boolean; run<T>(action: () => Promise<T>): Promise<T | undefined>}) {
    const [setup, setSetup] = useState<SetupView | null>(null), [notice, setNotice] = useState('');
    useEffect(() => { let active = true; void invoke('readSetup').then(value => { if (active) setSetup(value); }, () => { if (active) setNotice('安装信息未能读取，请重新检查。'); }); return () => { active = false; }; }, []);
    async function refresh() { setSetup(await invoke('readSetup')); setNotice('安装信息已重新检查。'); }
    const assistant = setup?.assistant.host === 'workbuddy' ? 'WorkBuddy' : 'Codex';
    return <section className="setup-panel" aria-label="安装、插件与升级"><Card title="安装、插件与升级"><p className="muted">{setup ? `当前版本 ${setup.version} · ${setup.platform}/${setup.arch} · ${setup.mode} · 实验构建` : '正在读取当前安装信息…'}</p>
        {setup && <><p role="status">{setup.entitlement === 'not-integrated' ? '此 required 安装包尚未接入可信权益服务，受保护的业务操作会继续拒绝；本页不会提供绕过开关。' : '当前是关闭鉴权的实验模式，尚未接入正式权益服务，不能据此视为商用授权。'}</p>
        <h3>配套助手与插件</h3><p role="status">{assistant}：{setup.assistant.ready ? '检测到匹配的封面执行 Skill。实际接单、生图和回传仍需在助手中完成。' : setup.assistant.reason === 'protocol-missing' ? '尚未发现助手打开入口，请先安装并启动一次。' : setup.assistant.reason === 'skill-missing' ? '配套插件未安装、未启用或未通过匹配检查。' : '当前安装未配置助手检查。'}</p>
        <p role="status">配套插件市场：{setup.market.state === 'available' ? `找到匹配的市场 ${setup.market.name}。` : setup.market.state === 'mismatch' ? '现有文件与此应用的版本、模式或架构不匹配，请获取完整匹配的一套文件。' : '当前安装没有可用的市场文件；请向发行方获取与本版本、系统和架构匹配的完整插件包。'}</p>
        <ol><li>在全局设置中选择实际要使用的助手，并先安装、启动它。</li><li>打开配套市场文件夹。在 Codex 插件界面选择本地市场清单 <code>.agents/plugins/marketplace.json</code>；WorkBuddy 从插件页添加这个完整市场目录。本地市场入口是否受支持，以当前助手界面为准。</li><li>在助手内安装并启用 Nova Content Hub，审阅需要的插件权限或 Hooks 信任，再返回本页重新检查。</li><li>检查通过后回到原内容或模板继续任务；打开助手本身不会创建任务，也不代表已经安装或执行成功。</li></ol>
        <div className="management-actions" style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}><Button disabled={busy} onClick={() => void run(async () => { await invoke('openSetupTarget', {target: 'assistant'}); setNotice('已请求系统打开所选助手，请在助手内继续安装或启用插件。'); })}>打开 {assistant}</Button><Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => { await invoke('openSetupTarget', {target: 'market'}); setNotice('已请求系统打开配套市场文件夹。'); })}>打开配套市场文件夹</Button><Button disabled={busy || setup.market.state !== 'available'} onClick={() => void run(async () => { await invoke('copyPluginMarketLocation'); setNotice('配套市场位置已复制，可粘贴到助手的本地市场入口。'); })}>复制市场位置</Button><Button disabled={busy} onClick={() => void run(refresh)}>重新检查</Button></div>
        <h3>安装与手动升级</h3><ol><li>先在“备份与恢复”中备份当前内容库，并检查备份完整。记住由自己选择的内容库文件夹。</li><li>从可信发行方获取同模式的新版本应用与配套插件，核对 macOS Apple 芯片 / Intel 或 Windows 的架构。</li><li>macOS：退出旧应用，按发行说明将新应用放入“应用程序”，不要直接从磁盘映像内长期运行。Windows：退出旧应用，按发行说明运行匹配的安装程序。安装应用不等于安装助手插件。</li><li>保留原内容库文件夹和备份。安装完成后重新打开原库，再检查配套插件。旧格式或未来格式被拒绝时先保留原件，按版本迁移说明处理。</li></ol>
        <p className="muted">本页提供手动升级步骤，没有自动下载或覆盖用户库。卸载与更换应用时请保留自己选择的内容库目录。当前实验构建的签名、公证和跨平台安装仍需单独验收。</p>
        <details><summary>macOS 提示应用损坏或无法打开</summary><p>先核对下载来源、包是否完整、系统版本和芯片架构，再向发行方提供原始提示与下方脱敏诊断。损坏提示也可能涉及签名、公证、隔离属性或下载不完整；不能一概归因于隔离属性。本页不执行 xattr 命令或关闭系统安全校验。</p></details>
        </>}
        <h3>导出脱敏诊断</h3><p className="muted">只导出版本、平台、构建模式、是否绑定内容库、待恢复状态、可用的数量和有限错误码。不含目录路径、正文、照片、令牌或错误堆栈。诊断保存在本机，由你决定是否分享。</p>
        <Button disabled={busy} onClick={() => void run(async () => { const result = await invoke('exportDiagnostics'); if (result.exported) setNotice(`脱敏诊断已导出：${result.name}`); })}>选择位置并导出诊断</Button>
        {!setup && <Button disabled={busy} onClick={() => void run(refresh)}>重新读取安装信息</Button>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}
