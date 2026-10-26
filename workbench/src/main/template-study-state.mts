import {isDeepStrictEqual} from 'node:util';
import {LibraryError} from '../../../plugin-src/src/lib/file-library/index.mjs';
import type {TemplateCoreDocument, TemplateCoreContext} from '../shared/template-core.d.ts';

type Package = TemplateCoreDocument & {definition: Record<string, unknown>; resources: Record<string, unknown>};
type Reader = {readTemplate(id: string, version?: number): Package; readTemplateContext(templateId: string, requestId: string, attemptId: string): TemplateCoreContext};
const evidence = (pkg: Package): [string, unknown[]] => [typeof pkg.definition.designNotes === 'string' ? pkg.definition.designNotes.trim() : '', Array.isArray(pkg.definition.ruleEvidence) ? pkg.definition.ruleEvidence : []];
function material(pkg: Package) {
    const {accepted: _accepted, aiTested: _aiTested, ...definition} = pkg.definition;
    return {definition, resources: pkg.resources};
}
function unavailableHistory(error: unknown): boolean {
    return error instanceof LibraryError && (error.code === 'CORRUPT' || error.code === 'IO_ERROR' && ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOTDIR'].includes((error.cause as NodeJS.ErrnoException | undefined)?.code ?? ''));
}
// 拆解资料与人工验收是不同事实；沿用旧资料不能把改过的样张或规则标成已拆解。
export function templateStudyComplete(library: Reader, current: Package): boolean {
    const currentHash = current.versions.find(v => v.version === current.currentVersion)?.packageHash;
    for (const job of current.templateJobs ?? []) {
        const accepted = job.acceptance?.acceptedTemplate;
        if (accepted?.id === current.id && accepted.version === current.currentVersion && accepted.packageHash === currentHash) return true;
        for (const attempt of job.attempts) {
            if (attempt.status !== 'committed') continue;
            let context: TemplateCoreContext;
            try {context = library.readTemplateContext(current.id, job.id, attempt.attemptId);}
            catch (error) {
                if (unavailableHistory(error)) continue;
                throw error;
            }
            if (context.request.template.version === current.currentVersion && context.request.template.packageHash === currentHash && context.results.some(result => result.attemptId === attempt.attemptId && result.result)) return true;
        }
    }
    const [notes, rules] = evidence(current);
    if (!notes && !rules.length) return false;
    for (const version of [...current.versions].sort((a, b) => a.version - b.version)) {
        let baseline: Package;
        try {baseline = version.version === current.currentVersion ? current : library.readTemplate(current.id, version.version);}
        catch (error) {if (unavailableHistory(error)) return false; throw error;}
        if (isDeepStrictEqual(evidence(baseline), evidence(current))) return isDeepStrictEqual(material(baseline), material(current));
    }
    return false;
}
