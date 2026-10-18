import {isRecord} from '../shared/contracts.ts';
import type {Worker, WorkerOperation, WorkerOperations} from '../shared/contracts.ts';

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
                else pending.reject(Object.assign(new Error('文件操作未完成，请查询状态后继续；原文件和任务现场会保留。'), {code: isRecord(message.error) && typeof message.error.code === 'string' ? message.error.code : 'WORKER_ERROR'}));
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
