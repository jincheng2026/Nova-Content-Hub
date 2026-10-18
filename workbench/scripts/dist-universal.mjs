import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {snapshotPackage} from '../../plugin-src/scripts/marketplace-builder.mjs';
import {assertDistribution, installerConfig, testingEnvironment} from './dist.mjs';
import {assertSeparatePaths, assertSourceUnchanged, copyNativeArtifact, resolveDestination, sourceIdentity, validateNativeArtifact} from './native-payload.mjs';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function parseUniversalOptions(args, host = process) {
    if (host.platform !== 'darwin' || !['x64', 'arm64'].includes(host.arch)) throw Error('Universal preview assembly requires a native macOS runner');
    const options = {};
    if (args.length !== 4) throw Error('Use npm run dist:preview:universal -- --x64 /absolute/native-artifact --arm64 /absolute/native-artifact');
    for (let index = 0; index < args.length; index += 2) {
        const arch = args[index].slice(2);
        if (!['--x64', '--arm64'].includes(args[index]) || Object.hasOwn(options, arch) || !path.isAbsolute(args[index + 1])) throw Error('Supply exactly two absolute native artifact paths: --x64 and --arm64');
        options[arch] = args[index + 1];
    }
    if (options.x64 === options.arm64) throw Error('Universal preview needs two independent native artifacts');
    return options;
}

export function universalInstallerConfig(shell, output, version) {
    const config = installerConfig({platform: 'darwin', arch: 'universal', channel: 'preview', auth: 'disabled'}, version);
    return {
        ...config,
        directories: {app: shell, output},
        files: ['package.json', 'main.mjs', 'selector.mjs'],
        extraResources: [],
        // shortcut: preview skips sealed payload signing; implement verified Developer ID payload signing before production.
        mac: {...config.mac, target: [{target: 'dmg', arch: ['universal']}], mergeASARs: false, signIgnore: ['[/\\\\]Contents[/\\\\]Resources[/\\\\]native(?:[/\\\\]|$)']}
    };
}

export function createUniversalHooks(artifacts, source, universalArch = 4) {
    if (artifacts.length !== 2 || artifacts.filter(artifact => artifact.arch === 'x64').length !== 1 || artifacts.filter(artifact => artifact.arch === 'arm64').length !== 1) throw Error('Universal assembly requires exactly one x64 and one arm64 artifact');
    let combined;
    let copied = false;
    let shellSnapshot;
    const thinShells = new Set();
    const nativeRoot = context => path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources/native');
    const verify = async directory => {
        for (const artifact of artifacts) await validateNativeArtifact(path.join(directory, `darwin-${artifact.arch}`), source, artifact.arch);
    };
    return {
        async afterPack(context) {
            if (context.electronPlatformName !== 'darwin' || ![1, 3, universalArch].includes(context.arch)) throw Error('Unexpected universal packaging callback');
            const directory = nativeRoot(context);
            const appDirectory = path.join(path.dirname(directory), 'app');
            const shell = await snapshotPackage(appDirectory);
            const pkg = readJSON(path.join(appDirectory, 'package.json'));
            if (!isDeepStrictEqual(Object.keys(shell).sort(), ['main.mjs', 'package.json', 'selector.mjs']) || pkg.type !== 'module' || pkg.main !== 'main.mjs' || shellSnapshot && !isDeepStrictEqual(shell, shellSnapshot)) throw Error('Universal packaging requires identical minimal ESM shells');
            shellSnapshot = shell;
            // Pinned builder calls afterPack for both thin shells, then the merged shell before signing.
            if (context.arch !== universalArch) {
                if (thinShells.has(context.arch)) throw Error('Thin shell callback ran twice');
                thinShells.add(context.arch);
                if (fs.existsSync(directory)) throw Error('Thin Electron shells must not contain native application payloads');
                return;
            }
            if (thinShells.size !== 2) throw Error('Both thin ESM shells must be prepared before universal payload assembly');
            if (copied) throw Error('Universal payload hook ran twice');
            for (const artifact of artifacts) assertSeparatePaths(artifact.path, path.resolve(directory));
            fs.mkdirSync(directory);
            for (const artifact of artifacts) await copyNativeArtifact(artifact, path.join(directory, `darwin-${artifact.arch}`), source);
            await verify(directory);
            combined = directory;
            copied = true;
        },
        async afterSign(context) {
            if (context.arch !== universalArch || nativeRoot(context) !== combined) throw Error('Unexpected universal signing callback');
            await verify(combined);
        },
        async verifyFinished() {
            if (!copied) throw Error('Builder never assembled the universal native payloads');
            await verify(combined);
            for (const artifact of artifacts) await validateNativeArtifact(artifact.path, source, artifact.arch);
        }
    };
}

export async function distributeUniversal(args = process.argv.slice(2)) {
    const options = parseUniversalOptions(args);
    const npmCLI = process.env.npm_execpath;
    if (!npmCLI || !fs.statSync(npmCLI).isFile()) throw Error('Run universal assembly through npm with an explicit Node/npm runtime');
    const root = path.dirname(workbench);
    const pkg = readJSON(path.join(workbench, 'package.json'));
    const config = readJSON(path.join(root, 'release.config.json'));
    assertDistribution({platform: 'darwin', arch: 'universal', channel: 'preview', auth: 'disabled'}, config, pkg);
    for (const [name, expected] of [['electron', '44.9.0'], ['electron-builder', '26.15.3']]) if (readJSON(path.join(workbench, 'node_modules', name, 'package.json')).version !== expected) throw Error(`Install pinned ${name} before assembling`);
    const source = sourceIdentity(root, npmCLI);
    const artifacts = [];
    for (const arch of ['x64', 'arm64']) artifacts.push(await validateNativeArtifact(options[arch], source, arch));
    const parent = resolveDestination(path.join(workbench, 'release/darwin-universal/preview'));
    // Check overlap before creating output; copying can never overwrite or recurse into an input artifact.
    for (const artifact of artifacts) assertSeparatePaths(artifact.path, parent);
    fs.mkdirSync(parent, {recursive: true});
    const run = fs.mkdtempSync(path.join(parent, `${source.commit}-`));
    const shell = path.join(run, 'shell');
    const output = path.join(run, 'installers');
    fs.mkdirSync(shell);
    fs.writeFileSync(path.join(shell, 'package.json'), JSON.stringify({name: pkg.name, version: config.version, type: 'module', main: 'main.mjs', dependencies: {}}, null, 2) + '\n', {flag: 'wx'});
    for (const name of ['main.mjs', 'selector.mjs']) fs.copyFileSync(fileURLToPath(new URL(`./universal-bootstrap/${name}`, import.meta.url)), path.join(shell, name), fs.constants.COPYFILE_EXCL);
    const hooks = createUniversalHooks(artifacts, source);
    const builderConfig = {...universalInstallerConfig(shell, output, config.version), afterPack: hooks.afterPack, afterSign: hooks.afterSign};
    const environment = {...process.env};
    try {
        for (const key of Object.keys(process.env)) if (/^(?:WIN_)?CSC_/i.test(key)) delete process.env[key];
        Object.assign(process.env, testingEnvironment(environment));
        const {build, Platform, Arch} = await import('electron-builder');
        await build({projectDir: workbench, targets: Platform.MAC.createTarget('dmg', Arch.universal), publish: 'never', config: builderConfig});
        await hooks.verifyFinished();
        assertSourceUnchanged(source, sourceIdentity(root, npmCLI));
        console.log(`Universal free preview installer: ${output}; both native payloads preserved; experimental=true, productionReady=false. Native Mac/Intel, Apple Silicon, host and installer acceptance remain required.`);
    } catch (error) {
        fs.rmSync(run, {recursive: true, force: true});
        throw error;
    } finally {
        for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
        Object.assign(process.env, environment);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await distributeUniversal(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
