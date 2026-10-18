import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {DesktopController} from './controller.mts';
import type {MaintenancePending, MaintenanceReceipt, MaintenanceStatus} from '../shared/maintenance-contracts.ts';
import {fail} from '../shared/validation.ts';

export class Maintenance {
    owner: DesktopController;
    receipt: MaintenanceReceipt | null = null;
    constructor(owner: DesktopController) { this.owner = owner; }

    readMaintenanceStatus(): MaintenanceStatus {
        const pending = this.owner.binding.maintenancePending;
        return {pending: pending ? {kind: pending.kind, destinationName: path.basename(pending.destination)} : null, receipt: this.receipt};
    }
    async ready() {
        const c = this.owner;
        c.noPending();
        if (c.binding.seedPending) fail('PENDING_MUTATION', '请先完成或处理内置资料初始化。');
        const task = await c.query();
        if (c.binding.started && task?.status !== 'committed') fail('IMPORT_IN_PROGRESS', '请先完成或核验当前导入。');
    }
    async destination(kind: 'backup' | 'restore') {
        const selected = await this.owner.dialogs.maintenanceParent?.();
        if (!selected) return null;
        if (!path.isAbsolute(selected) || selected.includes('\0')) fail('UNSAFE_PATH', '请选择真实的父文件夹。');
        const info = await fs.lstat(selected, {bigint: true});
        if (!info.isDirectory() || info.isSymbolicLink()) fail('UNSAFE_PATH', '请选择真实的父文件夹。');
        const operationId = randomUUID(), stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return {operationId, startedAt: new Date().toISOString(), parentIdentity: {dev: info.dev.toString(), ino: info.ino.toString()}, destination: path.join(selected, `Nova-${kind === 'backup' ? '内容库备份' : '恢复的内容库'}-${stamp}-${operationId}`)};
    }
    async finish(pending: MaintenancePending) {
        const c = this.owner;
        await c.persist({...c.binding, maintenancePending: pending});
        const result = await c.worker.call('runMaintenance', {pending});
        await c.persist({...c.binding, maintenancePending: null});
        this.receipt = result;
        return result;
    }
    backupLibrary() {
        const c = this.owner;
        return c.exclusive(async () => {
            await this.ready();
            const binding = structuredClone(c.current());
            const target = await this.destination('backup');
            if (!target) return null;
            const {descriptorHash} = await c.worker.call('inspectMaintenanceLibrary', {binding});
            return this.finish({...target, kind: 'backup', binding, descriptorHash});
        });
    }
    verifyLibraryBackup() {
        const c = this.owner;
        return c.exclusive(async () => {
            const source = await c.dialogs.libraryBackup?.();
            if (!source) return null;
            const result = await c.worker.call('inspectLibraryBackup', {source});
            this.receipt = {kind: 'verify', destinationName: path.basename(source), counts: result.counts, recovered: false, upgradeRequired: false, interruptedAttempts: 0};
            return this.receipt;
        });
    }
    restoreLibraryBackup() {
        const c = this.owner;
        return c.exclusive(async () => {
            await this.ready();
            const source = await c.dialogs.libraryBackup?.();
            if (!source) return null;
            const {backup} = await c.worker.call('inspectLibraryBackup', {source});
            const target = await this.destination('restore');
            if (!target) return null;
            if (c.binding.current) {
                const relative = path.relative(c.binding.current.root, target.destination);
                if (!relative || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) fail('UNSAFE_PATH', '请选择当前内容库之外的位置，恢复会建立独立的新内容库。');
            }
            return this.finish({...target, kind: 'restore', backup});
        });
    }
    recoverMaintenance() {
        const c = this.owner;
        return c.exclusive(async () => {
            const pending = c.binding.maintenancePending;
            if (!pending) fail('NO_PENDING', '没有需要核验的备份或恢复。');
            // Recovery only recognizes a completed fixed result; it never repeats a copy into a partial folder.
            const result = await c.worker.call('queryMaintenance', {pending});
            await c.persist({...c.binding, maintenancePending: null});
            this.receipt = result;
            return result;
        });
    }
    abandonMaintenance() {
        const c = this.owner;
        return c.exclusive(async () => {
            if (!c.binding.maintenancePending) fail('NO_PENDING', '没有待处理的维护记录。');
            await c.persist({...c.binding, maintenancePending: null});
        });
    }
}
