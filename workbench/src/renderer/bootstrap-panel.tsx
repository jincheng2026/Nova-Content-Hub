import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import {invoke} from './client.ts';
import type {BootstrapRecoveryView} from '../shared/bootstrap-contracts.ts';

export function BootstrapRecoveryPanel({busy, run, onRecovered}: {
    busy: boolean;
    run<T>(action: () => Promise<T>): Promise<T | undefined>;
    onRecovered(): void | Promise<void>;
}) {
    const [view, setView] = useState<BootstrapRecoveryView | null>(null), [confirm, setConfirm] = useState(false), [notice, setNotice] = useState('');
    useEffect(() => { let active = true; void invoke('readBootstrapRecovery').then(value => { if (active) setView(value); }, () => { if (active) setNotice('本机连接状态未能读取，请重新检查。'); }); return () => { active = false; }; }, []);
    async function refresh() { setConfirm(false); setView(await invoke('readBootstrapRecovery')); }
    async function recover() {
        if (!view?.confirmationToken) return;
        await run(async () => {
            const result = await invoke('resetMachineBinding', {confirmationToken: view.confirmationToken!, confirmed: true});
            setConfirm(false);
            setNotice(`连接信息已重新建立，旧记录已备份为 ${result.backupName}。请回到内容库入口，重新选择原内容库文件夹。`);
            await refresh();
            await onRecovered();
        });
    }
    return <section aria-label="本机内容库连接恢复"><Card title="本机内容库连接恢复">
        <p className="muted">工作台把“连接哪个内容库”保存在本机。连接记录损坏时，可以先保留旧记录，再重新选择原内容库；不会删除内容库、正文、照片或业务文件，也不会改变登录或使用权限。</p>
        {view?.state === 'binding-unavailable' && <p role="status">本机连接暂时不可用（{view.reasonCode}）。{view.canReset ? '可以备份损坏的连接记录并重新连接。' : '当前记录不能安全自动处理，请保留现场并导出脱敏诊断。'}</p>}
        {view?.state === 'ready' && <p role="status">本机连接记录可读取。如内容库需要恢复，请使用“备份与恢复”。</p>}
        <div className="management-actions" style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
            <Button disabled={busy} onClick={() => void run(refresh)}>重新检查本机连接</Button>
            <Button disabled={busy || !view?.canReset} onClick={() => setConfirm(true)}>重新连接内容库</Button>
            <Button disabled={busy} onClick={() => void run(async () => { const result = await invoke('exportDiagnostics'); if (result.exported) setNotice(`脱敏诊断已导出：${result.name}。请保留本机连接备份，供维护者定位。`); })}>导出脱敏诊断</Button>
        </div>
        {confirm && <div role="group" aria-label="确认恢复本机连接"><p>确认后只会备份并清空本机连接记录。内容库和所有业务文件均保留，待处理任务的旧连接记录也会放在备份里。之后需自己重新选择内容库，不会自动打开或修改业务库。</p><Button disabled={busy} type="danger" onClick={() => void recover()}>确认备份旧记录并重新连接</Button><Button disabled={busy} onClick={() => setConfirm(false)}>保留当前连接</Button></div>}
        {view?.backupName && <p className="muted">旧连接备份：{view.backupName}。如需协助，请导出脱敏诊断；无需上传正文或任意 JSON 文件。</p>}
        {notice && <p role="status">{notice}</p>}
    </Card></section>;
}
