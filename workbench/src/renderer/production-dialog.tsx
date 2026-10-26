import {useEffect, useRef, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './production-dialog.css';

// The workspace owns the single managed-draft guard; the native dialog owns focus
// containment and Semi controls reuse their existing dialog popup host/Escape guard.
export function ProductionDialog({title, busy, close, initialFocus, notice, children}: {title: string; busy: boolean; close(): void; initialFocus: string; notice: string; children: ReactNode}) {
    const dialog = useRef<HTMLDialogElement>(null), escapeFromNested = useRef(false), currentBusy = useRef(busy);
    currentBusy.current = busy;
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // Chromium can send another native cancel after a nested viewer unmounts
        // during this Escape. Remember the layer at keydown, before it disappears.
        const keydown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) return;
            if (currentBusy.current) {event.preventDefault(); event.stopPropagation(); return;}
            const nested = dialog.current?.querySelector<HTMLDialogElement>('dialog[open]');
            escapeFromNested.current = !!nested;
            if (!nested) return;
            // Keep the browser from also cancelling the ancestor after the child
            // disappears. Let the child's own key handler run when it has focus.
            event.preventDefault();
            if (!(event.target instanceof Node) || !nested.contains(event.target)) {
                event.stopPropagation();
                nested.dispatchEvent(new Event('cancel', {cancelable: true}));
            }
        };
        const keyup = (event: KeyboardEvent) => {if (event.key === 'Escape') escapeFromNested.current = false;};
        document.addEventListener('keydown', keydown, true);
        document.addEventListener('keyup', keyup, true);
        dialog.current?.showModal();
        dialog.current?.querySelector<HTMLElement>(initialFocus)?.focus({preventScroll: true});
        return () => {document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup, true); dialog.current?.close(); if (opener?.isConnected) opener.focus({preventScroll: true});};
    }, []);
    return createPortal(<dialog ref={dialog} className="production-dialog" aria-label={title} aria-busy={busy} onCancel={event => {event.preventDefault(); event.stopPropagation(); if (event.target === event.currentTarget && !escapeFromNested.current && !busy) close();}}><header className="production-dialog-heading"><h2>{title}</h2><p>取消或按 Esc 会保留本次填写，重新打开可继续。</p>{notice && <p className="production-notice" role="status">{notice}</p>}</header>{children}</dialog>, document.body);
}
