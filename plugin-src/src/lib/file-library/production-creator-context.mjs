import fs from 'node:fs';
import {createHash} from 'node:crypto';

const registryURL = new URL('../../../resources/business-skills.json', import.meta.url);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A task keeps the creator version it was started with; later edits do not change its request. */
export function freezeCreatorContext(profile, vaultContext) {
    const publicProfile = {
        name: typeof profile?.name === 'string' ? profile.name : '',
        intro: typeof profile?.intro === 'string' ? profile.intro : '',
        marks: Array.isArray(profile?.marks) ? structuredClone(profile.marks) : []
    };
    const context = {schemaVersion: 1, profile: publicProfile, vault: vaultContext ?? null};
    const bytes = JSON.stringify(context);
    if (bytes.length > 65_000) throw Object.assign(new Error('本次定位资料过长，请先整理定位摘要后开始任务；原资料已保留。'), {code: 'INPUT_TOO_LARGE'});
    return {...context, sha256: digest(context)};
}

export function businessSkillForTask(kind, parameters = {}, accountId = null) {
    let registry;
    try {
        const bytes = fs.readFileSync(registryURL);
        if (bytes.length > 256 * 1024) throw Error('registry too large');
        registry = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw Object.assign(new Error('配套业务方法目录不可读取，请修复匹配版本的插件。'), {code: 'CORRUPT'});
    }
    if (registry?.format !== 'nova-business-skill-registry' || registry.schemaVersion !== 1 || !Array.isArray(registry.methods)) throw Object.assign(new Error('配套业务方法目录格式不匹配。'), {code: 'CORRUPT'});
    const explicit = parameters.businessSkill ?? parameters.businessMethod;
    const methods = registry.methods.filter(method => plain(method) && method.role === 'business-method' && method.status !== 'disabled');
    const executor=kind==='research'||kind==='analysis'&&accountId?'nova-content-research-execution':'nova-content-writing-execution';
    if (explicit !== undefined) {
        const selected = methods.find(method => method.id === explicit);
        if (!selected) throw Object.assign(new Error('本次业务方法未包含在配套插件中，请更新插件后重试。'), {code: 'SKILL_NOT_AVAILABLE'});
        if(selected.executor!==executor)throw Object.assign(new Error('业务方法与本次任务的执行能力不匹配，请选择适用方法。'),{code:'INVALID_INPUT'});
        return {id: selected.id, version: selected.version, registryVersion: registry.version};
    }
    const preferred = parameters.workflow === 'positioning-interview' ? 'xindao-interview'
        : parameters.workflow === 'topic-suggestion' ? 'xindao-xuanti'
        : parameters.workflow === 'content-creation' ? 'jc-content-writer'
        : kind === 'research'||kind==='analysis'&&accountId ? 'jc-media-research'
        : kind === 'packaging' ? 'jc-cover-copy'
        : kind === 'transcription' ? 'jc-benchmark-intake'
        : kind === 'analysis' ? 'jc-video-analysis'
        : kind === 'writing' ? 'nova-workbench-writing-method' : null;
    const selected = methods.find(method => method.id === preferred);
    return selected ? {id: selected.id, version: selected.version, registryVersion: registry.version} : null;
}
