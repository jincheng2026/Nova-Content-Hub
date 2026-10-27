import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parse} from 'smol-toml';
import {isRecord, type Release} from '../shared/contracts.ts';
import type {Assistant} from '../shared/cover-contracts.ts';
import {validateRelease} from './boundary.mts';
import {assistantNotReady, type AssistantFailureReason} from './assistant-failure.mts';

const SKILLS = {cover: 'nova-content-cover-execution', template: 'nova-content-template-execution', research: 'nova-content-research-execution', writing: 'nova-content-writing-execution'} as const;
type SkillOptions = {env?: NodeJS.ProcessEnv; home?: string};
const notReady = assistantNotReady;

// Read host metadata only; never execute installed plugin code to discover a Skill.
function read(file: string, limit = 2 * 1024 * 1024): Buffer {
    if (!path.isAbsolute(file) || file.includes('\0')) throw notReady();
    let current = path.parse(file).root;
    const parts = path.relative(current, file).split(path.sep);
    for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.size > limit)) throw notReady();
    }
    const named = fs.lstatSync(file), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(fd);
        if (!before.isFile() || before.ino !== named.ino || before.dev !== named.dev || before.size > limit) throw notReady();
        const bytes = Buffer.alloc(limit + 1);
        let size = 0;
        while (size < bytes.length) {
            const count = fs.readSync(fd, bytes, size, bytes.length - size, null);
            if (!count) break;
            size += count;
        }
        const after = fs.fstatSync(fd), entry = fs.lstatSync(file);
        if (size > limit || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || entry.ino !== before.ino || entry.dev !== before.dev || entry.isSymbolicLink()) throw notReady();
        return bytes.subarray(0, size);
    } finally { fs.closeSync(fd); }
}

export {read as readAssistantFile};

function json(file: string): Record<string, unknown> {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(read(file)));
    if (!isRecord(value)) throw notReady();
    return value;
}

export function installedAssistantSkill(host: Assistant, release: Release, options?: SkillOptions & {capability?: 'cover'}): typeof SKILLS.cover;
export function installedAssistantSkill<C extends keyof typeof SKILLS>(host: Assistant, release: Release, options: SkillOptions & {capability: C}): typeof SKILLS[C];
export function installedAssistantSkill(host: Assistant, release: Release, {env = process.env, home = os.homedir(), capability = 'cover'}: SkillOptions & {capability?: keyof typeof SKILLS} = {}): typeof SKILLS[keyof typeof SKILLS] {
    let reason: AssistantFailureReason = 'validation-failed';
    try {
        if (!Object.hasOwn(SKILLS, capability)) throw notReady();
        const SKILL = SKILLS[capability], skillFile = `skills/${SKILL}/SKILL.md`;
        validateRelease(release);
        if (!['codex', 'workbuddy'].includes(host) || release.AUTH_MODE !== 'disabled' || release.platform !== process.platform || release.arch !== process.arch) throw notReady();
        const market = `nova-content-hub-auth-${release.AUTH_MODE}-${release.platform}-${release.arch}`;
        const key = `nova-content-hub@${market}`;
        const config = host === 'codex' ? env.CODEX_HOME || path.join(home, '.codex') : env.WORKBUDDY_CONFIG_DIR || env.CODEBUDDY_CONFIG_DIR || path.join(home, '.workbuddy');
        if (!path.isAbsolute(config)) throw notReady();
        const root = path.join(config, 'plugins', 'cache', market, 'nova-content-hub', release.version);
        reason = 'plugin-missing';
        if (!fs.lstatSync(root).isDirectory()) throw notReady(reason);
        reason = 'plugin-disabled';
        if (host === 'codex') {
            const settings = parse(new TextDecoder('utf-8', {fatal: true}).decode(read(path.join(config, 'config.toml'))));
            if (!isRecord(settings.plugins) || !isRecord(settings.plugins[key]) || settings.plugins[key].enabled !== true) throw notReady();
            const overrides = isRecord(settings.skills) ? settings.skills.config : undefined;
            const samePath = (value: string) => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value);
            if (Array.isArray(overrides) && overrides.some(entry => isRecord(entry) && entry.enabled === false && typeof entry.path === 'string' && path.isAbsolute(entry.path) && samePath(entry.path) === samePath(path.join(root, skillFile)))) throw notReady();
        } else {
            const installed = json(path.join(config, 'plugins', 'installed_plugins.json'));
            const settings = json(path.join(config, 'settings.json'));
            if (installed.version !== 2 || !isRecord(installed.plugins) || !isRecord(settings.enabledPlugins) || settings.enabledPlugins[key] !== true) throw notReady();
            const copies = installed.plugins[key];
            if (!Array.isArray(copies) || copies.length !== 1 || !isRecord(copies[0]) || copies[0].scope !== 'user' || copies[0].version !== release.version || copies[0].installPath !== root) throw notReady();
        }
        reason = 'plugin-mismatch';
        const manifest = json(path.join(root, host === 'codex' ? '.codex-plugin/plugin.json' : '.codebuddy-plugin/plugin.json'));
        if (manifest.name !== 'nova-content-hub' || manifest.version !== release.version || typeof manifest.description !== 'string' || !manifest.description.includes(release.pairId)) throw notReady();
        reason = 'skill-not-supported';
        if (host === 'codex' ? manifest.skills !== './skills/' : !Array.isArray(manifest.skills) || !manifest.skills.includes(`./skills/${SKILL}`)) throw notReady();
        reason = 'plugin-mismatch';
        const installedRelease = json(path.join(root, 'plugin-src/src/release.json'));
        if (!isDeepStrictEqual(installedRelease, {...release, format: 'nova-content-plugin-release'})) throw notReady();
        reason = 'skill-missing';
        const bytes = read(path.join(root, skillFile), 64 * 1024);
        reason = 'integrity-failed';
        const integrity = json(path.join(root, 'integrity.json'));
        const capabilities = isRecord(integrity.skills) ? integrity.skills[SKILL] : null;
        if (integrity.format !== 'nova-content-plugin-integrity' || integrity.schemaVersion !== 1 || integrity.pairId !== release.pairId || integrity.AUTH_MODE !== release.AUTH_MODE || !isRecord(capabilities) || capabilities.namespace !== capability || capabilities.executable !== true || !isRecord(integrity.hashes)) throw notReady();
        if (integrity.hashes[skillFile] !== createHash('sha256').update(bytes).digest('hex') || !new RegExp(`^---\\r?\\nname: ${SKILL}\\r?\\n`).test(new TextDecoder('utf-8', {fatal: true}).decode(bytes))) throw notReady();
        return SKILL;
    } catch { throw notReady(reason); }
}
