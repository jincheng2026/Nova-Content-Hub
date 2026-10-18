import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateBuildConfig, validateRelease} from '../src/main/boundary.mts';
import {assertSourceUnchanged, exportNativePayload, sourceIdentity} from './native-payload.mjs';

const workbench = fileURLToPath(new URL('../', import.meta.url));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const usage = 'Use npm run dist:local|dist:preview|dist:testing|dist:production -- --platform darwin|win32 --arch arm64|x64';
const channelAuth = {local: 'disabled', preview: 'disabled', testing: 'required', production: 'disabled'};

export function parseOptions(args, host = process) {
    const exportPayload = args[0] === '--export-payload';
    if (exportPayload) args = args.slice(1);
    const options = {};
    if (args.length !== 8) throw new Error(usage);
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index].slice(2);
        if (!['--channel', '--auth', '--platform', '--arch'].includes(args[index]) || Object.hasOwn(options, key)) throw new Error(usage);
        options[key] = args[index + 1];
    }
    if (!Object.hasOwn(channelAuth, options.channel) || options.auth !== channelAuth[options.channel] || !['darwin', 'win32'].includes(options.platform) || !['arm64', 'x64'].includes(options.arch)) throw new Error(usage);
    if (options.platform !== host.platform || options.arch !== host.arch) throw new Error('Use a native runner with matching process.platform and process.arch; cross-platform/architecture packaging is refused.');
    if (exportPayload) {
        if (options.platform !== 'darwin' || options.channel !== 'preview') throw Error('Native payload export is available only for free macOS preview builds');
        options.exportPayload = true;
    }
    return options;
}

export function assertProductionSigning(platform, env) {
    if (platform === 'darwin') {
        const certificate = env.CSC_LINK && env.CSC_KEY_PASSWORD || env.CSC_NAME?.startsWith('Developer ID Application:');
        const notarization = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER || env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
        if (!certificate || !notarization) throw new Error('Production requires a Developer ID signing certificate and notarization configuration.');
    } else if (!(env.WIN_CSC_LINK && env.WIN_CSC_KEY_PASSWORD || env.CSC_LINK && env.CSC_KEY_PASSWORD)) {
        throw new Error('Production requires Windows code-signing certificate configuration.');
    }
}

export function assertDistribution(options, config, packageJSON, env = process.env) {
    validateBuildConfig(config);
    if (!Object.hasOwn(channelAuth, options.channel) || options.auth !== channelAuth[options.channel]) throw new Error('AUTH_MODE must be disabled for local/preview/production and required only for restricted testing.');
    if (['preview', 'production'].includes(options.channel) && config.AUTH_MODE !== 'disabled') throw new Error('Free preview and production commands require AUTH_MODE=disabled in release.config.json.');
    if (packageJSON.version !== config.version || packageJSON.devDependencies?.electron !== '44.9.0' || packageJSON.devDependencies?.['electron-builder'] !== '26.15.3') throw new Error('Installer version or pinned packaging toolchain mismatch.');
    if (options.channel === 'production') {
        assertProductionSigning(options.platform, env);
        throw new Error('Production is blocked: full functional and native installer acceptance, signing/notarization verification and experimental release gates are incomplete; productionReady=false.');
    }
}

export function assertStage(release, config, auth = 'required') {
    validateRelease(release);
    if (!['required', 'disabled'].includes(auth) || release.AUTH_MODE !== auth || Object.keys(config).some(key => release[key] !== (key === 'AUTH_MODE' ? auth : config[key]))) throw new Error('Desktop stage does not match release.config.json and the explicitly selected authentication mode.');
}

export function testingEnvironment(parent = process.env) {
    const env = {...parent};
    // Empty CSC_LINK is still a certificate path to builder; absence is the safe testing value.
    for (const key of Object.keys(env)) if (/^(?:WIN_)?CSC_/i.test(key)) delete env[key];
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    return env;
}

export function installerConfig(options, version) {
    const output = path.join(workbench, 'release', `${options.platform}-${options.arch}`, options.channel);
    const icons = path.join(workbench, 'resources/brand/desktop');
    return {
        appId: options.channel === 'local' ? 'com.novaisland.nova-content-hub.local' : options.channel === 'testing' ? 'com.novaisland.nova-content-hub.testing' : 'com.novaisland.nova-content-hub',
        productName: '自媒体工作台',
        electronVersion: '44.9.0',
        directories: {app: path.join(workbench, `dist-desktop/auth-${options.auth}`), output},
        extraMetadata: {version, description: options.channel === 'local' ? '自媒体工作台 local development build; no login required; not for distribution' : options.channel === 'testing' ? '自媒体工作台 restricted testing build; authentication unavailable' : '自媒体工作台 free preview; no login required; non-production build', author: 'Nova Content Hub'},
        artifactName: `Nova-Content-Hub-${version}-${options.platform}-${options.arch}-${options.channel}.\${ext}`,
        publish: null,
        // Real-path file tools and sharp already run from a checked stage; keep their layout unchanged.
        asar: false,
        npmRebuild: false,
        files: [
            'package.json', 'workbench/package.json', 'workbench/dist/**/*',
            'plugin-src/src/lib/**/*', 'plugin-src/src/bridge/**/*', 'plugin-src/src/content.mjs',
            'plugin-src/resources/**/*', 'plugin-src/references/**/*', 'plugin-src/schemas/**/*',
            '!**/{test,tests,__tests__,scripts,runtime,release}/**/*', '!**/*{.test,.spec}.*', '!**/*probe.mjs',
            '!**/*.map', '!**/.DS_Store', '!package-lock.json'
        ],
        // Separate resources preserve the plugin's launch scripts and bundled Node from app-source exclusions.
        extraResources: [{from: path.join(workbench, `dist-desktop/auth-${options.auth}/workbench/plugin-marketplace`), to: 'plugin-marketplace', filter: ['**/*']}],
        mac: {
            target: [{target: 'dmg', arch: [options.arch]}],
            icon: path.join(icons, 'icon.icns'),
            category: 'public.app-category.productivity',
            identity: '-', hardenedRuntime: false, notarize: false,
            minimumSystemVersion: '13.0'
        },
        dmg: {sign: false},
        win: {
            target: [{target: 'nsis', arch: [options.arch]}],
            icon: path.join(icons, 'icon.ico'),
            requestedExecutionLevel: 'asInvoker'
        },
        nsis: {
            oneClick: true, perMachine: false, allowElevation: false,
            packElevateHelper: false,
            createDesktopShortcut: 'always', createStartMenuShortcut: true,
            deleteAppDataOnUninstall: false, runAfterFinish: false
        }
    };
}

export async function distribute(args = process.argv.slice(2)) {
    const options = parseOptions(args);
    const packageJSON = readJSON(path.join(workbench, 'package.json'));
    const config = readJSON(path.join(workbench, '../release.config.json'));
    assertDistribution(options, config, packageJSON);
    const npmCLI = process.env.npm_execpath;
    if (!npmCLI || !fs.statSync(npmCLI).isFile()) throw new Error('Run distribution through npm with an explicit Node/npm runtime.');
    for (const [name, version] of [['electron', '44.9.0'], ['electron-builder', '26.15.3']]) {
        if (readJSON(path.join(workbench, 'node_modules', name, 'package.json')).version !== version) throw new Error(`Run npm ci --include=optional to install pinned ${name}.`);
    }
    const exportPayload = options.exportPayload === true;
    const source = exportPayload ? sourceIdentity(path.dirname(workbench), npmCLI) : undefined;
    execFileSync(process.execPath, [npmCLI, 'run', 'build', '--', '--auth', options.auth], {cwd: workbench, stdio: 'inherit'});
    assertStage(readJSON(path.join(workbench, `dist-desktop/auth-${options.auth}/workbench/dist/release.json`)), config, options.auth);
    if (source) {
        assertSourceUnchanged(source, sourceIdentity(path.dirname(workbench), npmCLI));
        const parent = path.join(workbench, 'release/native-payloads', source.commit);
        fs.mkdirSync(parent, {recursive: true});
        const payload = await exportNativePayload(path.join(workbench, 'dist-desktop/auth-disabled'), path.join(parent, `darwin-${options.arch}-${randomUUID()}`), source, options.arch);
        assertSourceUnchanged(source, sourceIdentity(path.dirname(workbench), npmCLI));
        console.log(`Fresh portable native payload for universal preview assembly: ${payload}`);
    }
    const builderConfig = installerConfig(options, config.version);
    fs.mkdirSync(builderConfig.directories.output, {recursive: true});
    const configFile = path.join(builderConfig.directories.output, 'electron-builder.json');
    fs.writeFileSync(configFile, JSON.stringify(builderConfig, null, 2) + '\n');
    const env = testingEnvironment();
    execFileSync(process.execPath, [path.join(workbench, 'node_modules/electron-builder/cli.js'), options.platform === 'darwin' ? '--mac' : '--win', `--${options.arch}`, '--publish', 'never', '--config', configFile], {cwd: workbench, stdio: 'inherit', env});
    console.log(`Non-production ${options.channel} installer: ${builderConfig.directories.output}; AUTH_MODE=${options.auth}, experimental=true, productionReady=false. ${options.auth === 'disabled' ? 'No login required.' : 'Restricted testing; authentication unavailable.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await distribute(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
