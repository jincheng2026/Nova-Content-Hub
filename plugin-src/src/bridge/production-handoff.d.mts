import type {ProductionContext, ProductionLibrary, ProductionHost} from '../lib/file-library/production.d.ts';
export interface ProductionBinding {root: string; libraryId: string; rootIdentity: {dev: string; ino: string}}
export interface ProductionLocator {taskId: string; attemptId: string; requestHash: string; host: ProductionHost}
export interface ProductionEnvelope {format: 'nova-content-production-handoff'; schemaVersion: 1; handoffId: string; pairId: string; AUTH_MODE: string; platform: string; arch: string; binding: ProductionBinding; task: ProductionLocator; createdAt: string; serviceDescriptorPath?: string}
export function prepareProductionHandoff(target: string, binding: ProductionBinding, task: ProductionLocator, release: unknown, options?: {installedSkill?: string; serviceDescriptorPath?: string}): Promise<{id: string; url: string; prompt: string; requiresPaste: boolean}>;
export function readProductionHandoff(target: string, id: string, release: unknown): ProductionEnvelope;
export function productionHandoffContext(envelope: ProductionEnvelope, launching?: boolean): {library: ProductionLibrary; context: ProductionContext & {serviceDescriptorPath?: string}};
