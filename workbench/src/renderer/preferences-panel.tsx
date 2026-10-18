import {useEffect, useState} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import Card from '@douyinfe/semi-ui-19/lib/es/card';
import {invoke} from './client.ts';
import {useManagedDraftGuard} from './library-panels.tsx';
import type {LocalPreferences, PreferencesView, ReminderStatus} from '../shared/preferences-contracts.ts';

const reminderLabels: Record<ReminderStatus['state'], string> = {
    disabled: '每天提醒尚未开启。', scheduled: '已安排每天提醒，等待本机设定时间。', checking: '正在读取本机发布安排。',
    'waiting-for-library': '当前没有可读取的内容库，请打开可用的本机内容库。', empty: '今天没有待发布的内容或合集。',
    requested: '已请求系统显示通知，正在等待反馈。', sent: '系统已返回通知显示事件。',
    unconfirmed: '未收到通知显示确认。请检查系统通知权限或专注模式；今天的自动提醒不会重复试发。',
    failed: '提醒没有完成，请检查系统通知设置后手动试发。', unsupported: '当前系统环境不支持原生通知。',
};
export function PreferencesPanel({busy, run}: {busy: boolean; run<T>(action: () => Promise<T>): Promise<T | undefined>}) {
    const [view, setView] = useState<PreferencesView | null>(null), [draft, setDraft] = useState<LocalPreferences | null>(null), [reminder, setReminder] = useState<ReminderStatus | null>(null), [notice, setNotice] = useState('');
    useManagedDraftGuard(!!draft && !!view && JSON.stringify(draft) !== JSON.stringify(view.values));
    useEffect(() => {
        let active = true;
        void Promise.all([invoke('readPreferences'), invoke('readReminderStatus')]).then(([preferences, status]) => {
            if (active) { setView(preferences); setDraft(preferences.values); setReminder(status); }
        }, () => { if (active) setNotice('本机设置未能读取，原文件会保留。请重启后重新查看。'); });
        return () => { active = false; };
    }, []);
    async function refresh() { setReminder(await invoke('readReminderStatus')); }
    return <section className="preferences-panel" aria-label="本机偏好与提醒"><Card title="本机偏好"><p className="muted">设置只保存在这台电脑。更改后点击保存才生效。</p>
        {draft && view && <form className="management-form" onSubmit={event => { event.preventDefault(); void run(async () => {
            const saved = await invoke('savePreferences', draft);
            setView(saved); setDraft(saved.values);
            document.documentElement.dataset.reducedMotion = String(saved.values.reducedMotion);
            setNotice(['failed', 'mismatch', 'requires-approval'].includes(saved.login.state) ? '偏好已保存；开机启动尚未生效，请查看下方系统反馈。' : '本机偏好已保存。');
            await refresh();
        }); }}>
            <label className="check-label"><input type="checkbox" disabled={busy} checked={draft.reducedMotion} onChange={event => setDraft({...draft, reducedMotion: event.target.checked})}/>减少界面动画</label>
            <label className="check-label"><input type="checkbox" disabled={busy} checked={draft.remindersEnabled} onChange={event => setDraft({...draft, remindersEnabled: event.target.checked})}/>每天提醒今天的待发布安排</label>
            <label>每天提醒时间（使用本机当前时区）<input required type="time" disabled={busy || !draft.remindersEnabled} value={draft.reminderTime} onChange={event => setDraft({...draft, reminderTime: event.target.value})}/></label>
            <label className="check-label"><input type="checkbox" disabled={busy || !view.login.supported} checked={draft.startAtLogin} onChange={event => setDraft({...draft, startAtLogin: event.target.checked})}/>登录电脑后自动打开工作台</label>
            <p className="muted">系统开机启动反馈：{view.login.state === 'on' ? '已开启' : view.login.state === 'off' ? '已关闭' : view.login.state === 'unsupported' ? '当前平台不支持，未修改系统设置' : view.login.state === 'unavailable' ? '请先安装打包的桌面应用；开发运行模式不配置开机启动' : view.login.state === 'requires-approval' ? '等待你在系统登录项设置中批准' : view.login.state === 'mismatch' ? `系统实际为${view.login.enabled ? '开启' : '关闭'}，与保存的偏好不同；系统可能未批准此更改` : '读取或设置未成功，请到系统登录项设置中检查'}。</p>
            <Button theme="solid" htmlType="submit" disabled={busy}>保存本机偏好</Button>
            <Button disabled={busy} onClick={() => { setDraft({...view.values}); setNotice('已放弃尚未保存的本机偏好修改。'); }}>放弃修改</Button>
        </form>}
        {notice && <p role="status">{notice}</p>}
        <div style={{marginTop: 20}}><h3>原生通知</h3><p role="status">{reminder ? reminder.reason === 'storage-unavailable' ? '提醒记录无法安全读取或保存，已暂停提醒并保留原文件。' : reminderLabels[reminder.state] : '正在读取通知状态…'}{reminder?.lastDay ? ` 上次自动提醒记录：${reminder.lastDay}。` : ''}</p>
            <div className="management-actions" style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}><Button disabled={busy || !reminder?.supported} onClick={() => void run(async () => { setReminder(await invoke('testReminder')); })}>试发一条本机通知</Button><Button disabled={busy} onClick={() => void run(refresh)}>刷新通知状态</Button></div>
        </div>
        <p className="muted">只有开启提醒后，工作台才会在设定时间汇总当天待发布的内容与合集；通知显示数量，点击返回工作台。试发使用固定文字，不读取内容，也不占用当天自动提醒。</p>
        <p className="muted">通知能力可用不代表系统已授予显示权限。请在系统通知设置中允许此应用；专注模式可能隐藏通知。应用须保持运行，睡眠或退出期间无法准时提醒，恢复运行后仅检查当天安排。托盘不可用时，关闭窗口会退出应用。这里不会自动发布内容。</p>
    </Card></section>;
}
