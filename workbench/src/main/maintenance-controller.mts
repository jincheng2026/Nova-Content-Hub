import path from 'node:path';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {DesktopController} from './controller.mts';
import type {MaintenancePending, MaintenanceReceipt, MaintenanceStatus, LibraryHealthReport, UpgradePending, UpgradePreview} from '../shared/maintenance-contracts.ts';
import {fail} from '../shared/validation.ts';
import {emptyBinding} from './bindings.mts';

export class Maintenance {
    owner: DesktopController;
    receipt: MaintenanceReceipt | null = null;
    health: LibraryHealthReport | null = null;
    healthBinding: string | null = null;
    private preparedUpgrade: UpgradePending | null = null;
    private completedUpgrade: UpgradePending | null = null;
    private bindingKey() { const binding = this.owner.binding?.current; return binding ? JSON.stringify(binding) : null; }
    currentHealth() { return this.healthBinding === this.bindingKey() ? this.health : null; }
    inspectLibraryHealth() {
        return this.owner.exclusive(async () => {
            const binding = this.owner.binding?.current;
            if (!binding) fail('LIBRARY_NOT_READY', '请先明确打开一个内容库。');
            this.health = await this.owner.worker.call('inspectLibraryHealth', {binding: structuredClone(binding)});
            this.healthBinding = this.bindingKey();
            return this.health;
        });
    }
    constructor(owner: DesktopController) { this.owner = owner; }

    readMaintenanceStatus(): MaintenanceStatus {
        const pending = this.owner.binding.maintenancePending;
        return {pending: pending ? {kind: pending.kind, destinationName: path.basename(pending.destination), ...(pending.kind === 'upgrade' ? {backupName: path.basename(pending.backupDestination), stage: pending.stage} : {})} : null, receipt: this.receipt, health: this.currentHealth()};
    }
    async ready() {
        const c = this.owner;
        c.noPending();
        if (c.binding.seedPending) fail('PENDING_MUTATION', '请先完成或处理内置资料初始化。');
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
    prepareLibraryUpgrade() {
        const c = this.owner;
        return c.exclusive(async (): Promise<UpgradePreview | null> => {
            this.preparedUpgrade = null;
            await this.ready();
            const source = await (c.dialogs.legacyLibrary ?? c.dialogs.library)?.();
            if (!source) return null;
            const inspected = await c.worker.call('inspectLegacyLibrary', {source});
            const target = await this.destination('restore');
            if (!target) return null;
            const relative = path.relative(source, target.destination);
            if (!relative || !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) fail('UNSAFE_PATH', '请选择旧内容库之外的位置，工作台会分别建立完整备份和升级副本。');
            const backupDestination = path.join(path.dirname(target.destination), `Nova-升级前备份-${target.operationId}`);
            const destination = path.join(path.dirname(target.destination), `Nova-升级后的内容库-${target.operationId}`);
            this.preparedUpgrade = {...target, destination, kind: 'upgrade', source: inspected.binding, descriptorHash: inspected.descriptorHash, backupDestination, stage: 'backup', backup: null, targetIdentity: null, resultHash: null};
            return {sourceName: path.basename(source), backupName: path.basename(backupDestination), destinationName: path.basename(destination)};
        });
    }
    private async finishUpgrade(pending: UpgradePending, result: MaintenanceReceipt) {
        await this.owner.persist({...this.owner.binding, maintenancePending: null});
        this.completedUpgrade = pending;
        this.receipt = result;
        return result;
    }
    cancelLibraryUpgrade() { return this.owner.exclusive(async () => { this.preparedUpgrade = null; }); }
    private async advanceUpgrade(pending: UpgradePending) {
        const c = this.owner;
        for (let step = 0; step < 6; step++) {
            await c.persist({...c.binding, maintenancePending: pending});
            const progress = await c.worker.call('runLibraryUpgradeStage', {pending});
            pending = progress.pending;
            await c.persist({...c.binding, maintenancePending: pending});
            if (progress.receipt) return this.finishUpgrade(pending, {...progress.receipt, recovered: false});
        }
        fail('BACKUP_INCOMPLETE', '升级尚未完成，请核验本次结果后继续。');
    }
    confirmLibraryUpgrade() {
        return this.owner.exclusive(async () => {
            await this.ready();
            const pending = this.preparedUpgrade;
            if (!pending) fail('NO_SELECTION', '请先选择旧内容库和新位置，阅读预览后确认。');
            this.preparedUpgrade = null;
            return this.advanceUpgrade(pending);
        });
    }
    queryLibraryUpgrade() {
        const c = this.owner;
        return c.exclusive(async () => {
            const pending = c.binding.maintenancePending;
            if (pending?.kind !== 'upgrade') fail('NO_PENDING', '没有需要核验的升级。');
            const progress = await c.worker.call('queryLibraryUpgrade', {pending});
            await c.persist({...c.binding, maintenancePending: progress.pending});
            if (progress.receipt) await this.finishUpgrade(progress.pending, progress.receipt);
            return {complete: !!progress.receipt, stage: progress.pending.stage};
        });
    }
    continueLibraryUpgrade() {
        const c = this.owner;
        return c.exclusive(async () => {
            const pending = c.binding.maintenancePending;
            if (pending?.kind !== 'upgrade') fail('NO_PENDING', '没有需要继续的升级。');
            // Always inspect fixed artifacts first after interruption; never copy over an existing folder.
            const progress = await c.worker.call('queryLibraryUpgrade', {pending});
            await c.persist({...c.binding, maintenancePending: progress.pending});
            if (progress.receipt) return this.finishUpgrade(progress.pending, progress.receipt);
            return this.advanceUpgrade(progress.pending);
        });
    }
    openUpgradedLibrary() {
        const c = this.owner;
        return c.exclusive(async () => {
            await c.maySwitch();
            const pending = this.completedUpgrade;
            if (!pending) fail('NO_SELECTION', '本次会话没有已核验的升级副本，请使用“打开本机内容库”选择升级后的文件夹。');
            const progress = await c.worker.call('queryLibraryUpgrade', {pending});
            if (!progress.receipt) fail('BACKUP_INCOMPLETE', '升级完成证据不完整，不能打开。');
            const current = await c.worker.call('bindUpgradedLibrary', {pending});
            if (current.root !== pending.destination || current.libraryId !== pending.source.libraryId || current.rootIdentity.dev !== pending.targetIdentity?.dev || current.rootIdentity.ino !== pending.targetIdentity?.ino) fail('SOURCE_CHANGED', '升级副本文件夹已被替换，未切换内容库。');
            await c.persist({...emptyBinding(), assistant: c.binding.assistant, current});
            if (c.authMode === 'disabled') await c.covers.seed();
        });
    }
    recoverMaintenance() {
        const c = this.owner;
        return c.exclusive(async () => {
            const pending = c.binding.maintenancePending;
            if (!pending) fail('NO_PENDING', '没有需要核验的备份或恢复。');
            if (pending.kind === 'upgrade') fail('INVALID_INPUT', '请使用旧库升级的核验与继续入口。');
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
