import {useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import {invoke} from './client.ts';
import type {Status} from '../shared/contracts.ts';
import type {MaintenanceReceipt, MaintenanceResults} from '../shared/maintenance-contracts.ts';

export function MaintenancePanel({status, busy, blocked, run}: {
    status: Status | null;
    busy: boolean;
    blocked: boolean;
    run<T>(action: () => Promise<T>): Promise<T | undefined>;
}) {
    const [receipt, setReceipt] = useState<MaintenanceReceipt | null>(null), [notice, setNotice] = useState(''), [confirmKeep, setConfirmKeep] = useState(false);
    const pending = status?.maintenance.pending;
    const completed = receipt ?? status?.maintenance.receipt;
    async function action(method: keyof Pick<MaintenanceResults, 'backupLibrary' | 'verifyLibraryBackup' | 'restoreLibraryBackup' | 'recoverMaintenance'>) {
        await run(async () => {
            setNotice('');
            const result = await invoke(method);
            if (result) { setReceipt(result); setConfirmKeep(false); }
        });
    }
    return <section className="maintenance-panel" aria-label="内容库备份与恢复"><Card title="备份与恢复"><p className="muted">把本机内容库完整备份到另一个位置。恢复时自动建立新文件夹，原内容库和原备份都会保留。</p>
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
            {completed.kind === 'restore' && <><p>如需使用恢复的内容，请点击“打开本机内容库”并选择这个新文件夹。</p>{completed.interruptedAttempts > 0 && <p>{completed.interruptedAttempts} 个未完成的封面尝试已标为中断，可在恢复的内容库中重新开始。</p>}{completed.upgradeRequired && <p>这是旧版内容库，需要支持该版本的工具完成升级后才能打开。</p>}</>}
        </div>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}
