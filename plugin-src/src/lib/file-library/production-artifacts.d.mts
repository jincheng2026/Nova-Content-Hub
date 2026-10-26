import type {ProductionTask, ProductionCreation} from './production.js';
export function productionArtifactDraft(input: {task: ProductionTask; attemptId: string; artifactId: string; creation: ProductionCreation; body: string; bodyHash: string}): {creationPatch: Partial<ProductionCreation>; body: string; stale: boolean; action: string};
