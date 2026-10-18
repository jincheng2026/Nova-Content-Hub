import {useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import {invoke} from './client.ts';
import type {Status} from '../shared/contracts.ts';
import type {MaintenanceReceipt, MaintenanceResults, LibraryHealthReport} from '../shared/maintenance-contracts.ts';

export function MaintenancePanel({status, busy, diagnosticsBusy = busy, blocked, run}: {
    status: Status | null;
    busy: boolean;
    diagnosticsBusy?: boolean;
    blocked: boolean;
    run<T>(action: () => Promise<T>): Promise<T | undefined>;
}) {
    const [receipt, setReceipt] = useState<MaintenanceReceipt | null>(null), [notice, setNotice] = useState(''), [confirmKeep, setConfirmKeep] = useState(false);
    const [health, setHealth] = useState<LibraryHealthReport | null>(null);
    const pending = status?.maintenance.pending;
    const completed = receipt ?? status?.maintenance.receipt;
    async function action(method: keyof Pick<MaintenanceResults, 'backupLibrary' | 'verifyLibraryBackup' | 'restoreLibraryBackup' | 'recoverMaintenance'>) {
        await run(async () => {
            setNotice('');
            const result = await invoke(method);
            if (result) { setReceipt(result); setConfirmKeep(false); }
        });
    }
    return <section className="maintenance-panel" aria-label="内容库备份与恢复"><Card title="检查当前内容库"><p className="muted">检查当前连接的目录、对象与引用，不修改正文、图片或业务记录。检查会取得内容库协调锁；发现问题后，请保留原文件，从完整备份恢复到新文件夹。</p><div className="management-actions"><Button disabled={diagnosticsBusy} onClick={() => void run(async () => { setHealth(await invoke('inspectLibraryHealth')); })}>检查当前内容库</Button><Button disabled={diagnosticsBusy} onClick={() => void run(async () => { const result = await invoke('exportDiagnostics'); if (result.exported) setNotice(`脱敏诊断已导出：${result.name}`); })}>导出脱敏诊断</Button></div>{(health ?? status?.maintenance.health) && <LibraryHealthSummary report={(health ?? status?.maintenance.health)!}/>}</Card><Card title="备份与恢复"><p className="muted">把本机内容库完整备份到另一个位置。恢复时自动建立新文件夹，原内容库和原备份都会保留。</p>
        <div className="management-actions" style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
            <Button disabled={busy || blocked || !!pending || !status?.currentName} onClick={() => void action('backupLibrary')}>备份当前内容库</Button>
            <Button disabled={busy} onClick={() => void action('verifyLibraryBackup')}>检查一份备份</Button>
            <Button disabled={busy || blocked || !!pending} onClick={() => void action('restoreLibraryBackup')}>从备份恢复到新文件夹</Button>
        </div>
        <p className="muted">备份和恢复只需选择存放位置的父文件夹，工作台会自动生成唯一的新文件夹名。检查备份时，请选择包含 COMPLETE.json 的备份文件夹。</p>
        {pending && <div role="status" style={{marginTop: 16}}><strong>{pending.kind === 'backup' ? '上次备份' : '上次恢复'}的结果需要确认</strong><p>目标：{pending.destinationName}。请先核验结果；未完成的文件会保留，不会接着覆盖它们。核验未通过时，可保留现场并重新选择位置。</p>
            <div className="management-actions"><Button disabled={busy} onClick={() => void action('recoverMaintenance')}>核验上次结果</Button><Button disabled={busy} onClick={() => setConfirmKeep(true)}>保留文件，重新开始</Button></div>
            {confirmKeep && <div><p>仅清除这次待处理记录，已有文件仍保留。下一次会使用另一个新文件夹。</p><Button disabled={busy} onClick={() => void run(async () => { await invoke('abandonMaintenance'); setConfirmKeep(false); setNotice('已保留原文件，可以重新备份或恢复到新文件夹。'); })}>确认保留文件并清除记录</Button><Button disabled={busy} onClick={() => setConfirmKeep(false)}>返回</Button></div>}
        </div>}
        {completed && <div role="status" style={{marginTop: 16}}><strong>{completed.kind === 'backup' ? '备份完成' : completed.kind === 'verify' ? '备份检查通过' : '已恢复到新文件夹'}{completed.recovered ? '（已核验上次结果）' : ''}</strong><p>{completed.destinationName} · {completed.kind === 'restore' ? '原备份内 ' : ''}{completed.counts.files} 个文件 · {completed.counts.directories} 个文件夹 · {completed.counts.bytes.toLocaleString()} 字节</p>
            {completed.kind === 'restore' && <><p>如需使用恢复的内容，请点击“打开本机内容库”并选择这个新文件夹。</p>{completed.interruptedAttempts > 0 && <p>{completed.interruptedAttempts} 个未完成的助手尝试已标为中断，可在恢复的内容库中重新开始。</p>}{completed.upgradeRequired && <p>这是旧版内容库，需要支持该版本的工具完成升级后才能打开。</p>}</>}
        </div>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}

const rootAdvice: Record<LibraryHealthReport['root'], string> = {
    matched: '目录身份匹配。逐项结果如下；不会自动修复文件。',
    missing: '原文件夹当前不存在。请重新连接磁盘或恢复原位置后再检查；这不能证明文件已被删除。',
    unreadable: '当前无法读取原文件夹。请检查磁盘连接和本机权限，再重新检查。',
    replaced: '同一路径的文件夹已被替换。请明确重新打开需要使用的内容库；不会自动接受替换。',
    unsafe: '所选路径包含链接或无法安全核验的节点。请保留现场并选择真实文件夹。',
    'identity-unverified': '暂时无法确认这是不是原内容库。请保留文件，检查目录身份或从完整备份恢复。'
};
const healthReasons: Record<string, string> = {
    ROOT_MISSING: '文件夹当前不存在', ROOT_UNREADABLE: '文件夹无法读取', ROOT_REPLACED: '目录身份已改变', ROOT_UNSAFE: '路径无法安全读取', ROOT_IDENTITY_UNVERIFIED: '库身份未确认', LIBRARY_DESCRIPTOR_INVALID: '内容库描述文件不可用', FORMAT_UNSUPPORTED: '需要兼容此格式的工作台版本', LOCK_BUSY: '其他进程正在使用内容库，请稍后检查', LOCK_UNCERTAIN: '锁记录需要维护者核验，勿自行删除', STRUCTURE_INVALID: '必要目录结构不完整', OBJECT_INVALID: '对象格式或内容校验未通过', OBJECT_UNREADABLE: '对象文件无法读取', OBJECT_UNSAFE: '对象路径无法安全读取', ASSET_INVALID: '引用图片或附件缺失或校验未通过', TRANSACTION_INVALID: '保存日志校验未通过', TRANSACTION_PENDING: '存在尚待核验的保存，未将暂时不一致定为损坏', STAGING_UNVERIFIED: '保留的未完成暂存目录尚未核验', TEMPLATE_UNREGISTERED: '存在未登记模板文件，已保留', REQUEST_INVALID: '助手请求或结果证据不可用', PUBLICATION_INVALID: '发布快照不可用', REFERENCE_INVALID: '引用对象不可用', LIMIT_REACHED: '达到本次检查预算，未完成全量检查', SOURCE_CHANGED: '检查期间文件改变，请稍后重查'
};
function LibraryHealthSummary({report}: {report: LibraryHealthReport}) {
    const kinds = {workspace: '工作空间设置', collection: '合集', content: '内容', prompt: '提示词', photo: '照片', template: '模板'};
    return <section aria-label="内容库检查结果" role="status"><h3>{{healthy: '本次检查范围内未发现异常', issues: '发现需要处理的项目', blocked: '检查暂时无法继续', incomplete: '检查尚未完整完成'}[report.state]}</h3><p>{rootAdvice[report.root]}</p><p className="muted">检查时间：{report.checkedAt} · 对象 {report.checked.objects} · 资产 {report.checked.assets} · 事务 {report.checked.transactions} · 请求 {report.checked.requests}</p>{!report.complete && <p>结果不完整，不能据此认定内容库健康。可以保留现场并导出诊断。</p>}<ul>{report.issues.map((issue, index) => <li key={index}>{issue.kind ? `${kinds[issue.kind]} · ` : ''}{issue.id ? `${issue.id} · ` : ''}{healthReasons[issue.code] ?? '该项目需要维护者进一步核验'}（{issue.availability === 'unavailable' ? '不可用' : '未核实'}）</li>)}</ul><p className="muted">下方可检查完整备份并恢复到独立新文件夹。原待处理操作未确认时，继续使用对应恢复入口；不会借检查自动清除它。</p></section>;
}
