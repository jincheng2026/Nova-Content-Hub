import {useEffect, useRef} from 'react';
import type {Attempt} from '../shared/cover-contracts.ts';
export function useTaskProgress(key: string, read: () => Promise<void>) {
    const latest = useRef(read); latest.current = read;
    useEffect(() => {
        if (!key) return;
        let stopped = false, reading = false;
        const refresh = async () => {
            if (stopped || reading || document.hidden) return;
            reading = true;
            try {await latest.current();} catch {} finally {reading = false;}
        };
        const timer = window.setInterval(() => void refresh(), 2000);
        const unsubscribe = window.contentHub.onWorkspaceChanged?.(change => {if (change === 'progress') void refresh();});
        return () => {stopped = true; window.clearInterval(timer); unsubscribe?.();};
    }, [key]);
}
export function TaskProgressDetails({attempt}: {attempt: Attempt}) {
    const p = ['created', 'claimed'].includes(attempt.status) ? attempt.progress : null;
    return <>{p && <><p>{p.message}</p><p className="muted">助手上次报告：<time dateTime={p.updatedAt}>{new Date(p.updatedAt).toLocaleString()}</time></p></>}{attempt.progressUnavailable && <p role="status">进度记录暂不可读；可取消本次后重试，原输入和产物保留。</p>}{['created', 'claimed'].includes(attempt.status) && p?.state.startsWith('waiting-') && <p>请到助手中回复或确认；打开助手不会代你同意。</p>}</>;
}
