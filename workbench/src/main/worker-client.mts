import {isRecord} from '../shared/contracts.ts';
import type {Worker, WorkerOperation, WorkerOperations} from '../shared/contracts.ts';
const explanations: Record<string, string> = { PHOTO_SOURCE_MISSING: '照片尚未进入内容库，原文件已不在原位置。请恢复原文件后继续；待处理记录仍保留。', STALE_INPUT: '标题或正文已改变，请用当前内容重新准备封面；原待处理意图仍保留。', INVALID_IMAGE: '图片未通过完整解码校验，请选择完整的PNG、JPEG、WebP或GIF原图。' };
Object.assign(explanations, {
    UPGRADE_ALREADY_CURRENT: '这个内容库已是当前版本，可使用“打开本机内容库”。',
    UPGRADE_FUTURE_FORMAT: '这个内容库来自更新版本，请使用创建它的新版工作台；原文件保留。',
    UPGRADE_LEGACY_FORMAT: '此入口仅支持第4版内容库。第1至3版请先使用兼容工具升级到第4版；原文件保留。'
});

interface Child {
    on(event: 'message', listener: (message: unknown) => void): unknown;

    on(event: 'exit' | 'error', listener: () => void): unknown;

    postMessage(message: unknown): void;

    kill(): unknown;
}

export class WorkerClient implements Worker {
    spawn: () => Child;
    child: Child | null = null;
    sequence = 0;
    stopped = false;
    pending: { id: number; resolve(value: unknown): void; reject(error: unknown): void } | null = null;

    constructor(spawn: () => Child) {
        this.spawn = spawn;
    }

    call<K extends WorkerOperation>(op: K, args: WorkerOperations[K]['args']): Promise<WorkerOperations[K]['result']> {
        if (this.stopped) return Promise.reject(Object.assign(new Error('应用正在关闭，任务将在下次启动时核验。'), {code: 'WORKER_STOPPED'}));
        if (this.pending) return Promise.reject(Object.assign(new Error('工作进程正在处理操作。'), {code: 'BUSY'}));
        if (!this.child) {
            const child = this.child = this.spawn();
            child.on('message', message => {
                if (!isRecord(message) || !this.pending || message.id !== this.pending.id) return;
                const pending = this.pending;
                this.pending = null;
                if (message.ok === true) pending.resolve(message.value);
                else {
                    const code = isRecord(message.error) && typeof message.error.code === 'string' ? message.error.code : 'WORKER_ERROR';
                    pending.reject(Object.assign(new Error(Object.hasOwn(explanations, code) ? explanations[code] : '文件操作未完成，请查询状态后继续；原文件和任务现场会保留。'), {code}));
                }
            });
            const failed = () => {
                if (this.child !== child) return;
                this.child = null;
                if (this.pending) {
                    this.pending.reject(Object.assign(new Error('文件工作进程已退出。请查询磁盘任务，再继续导入。'), {code: 'WORKER_EXIT'}));
                    this.pending = null;
                }
            };
            child.on('exit', failed);
            child.on('error', failed);
        }
        return new Promise((resolve, reject) => {
            this.pending = {
                id: ++this.sequence,
                resolve: value => resolve(value as WorkerOperations[K]['result']),
                reject
            };
            try {
                this.child!.postMessage({id: this.sequence, op, args});
            } catch (error) {
                this.pending = null;
                reject(error);
            }
        });
    }

    stop() {
        this.stopped = true;
        this.child?.kill();
    }
}
