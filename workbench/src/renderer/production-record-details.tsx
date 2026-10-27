import type {ReactNode} from 'react';
import Button from '@douyinfe/semi-ui-19/lib/es/button';
import {ProductionDialog} from './production-dialog.tsx';
export function ProductionRecordDetails({title, busy = false, close, children, notice = '', actions, description}: {title: string; busy?: boolean; close(): void; children: ReactNode; notice?: string; actions?: ReactNode; description?: string}) {
    return <ProductionDialog title={title} busy={busy} close={close} initialFocus="#close-production-details" notice={notice} className="production-record-dialog" description={description??"完整资料保留在这里；关闭后返回原列表位置。"}><div className="production-record-body production-dialog-body">{children}</div><div className="production-dialog-footer">{actions}<Button id="close-production-details" disabled={busy} onClick={close}>关闭详情</Button></div></ProductionDialog>;
}
