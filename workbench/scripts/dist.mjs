import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {FileMatcher} from 'app-builder-lib/out/fileMatcher.js';
import {buildDemoLibrary} from './build-demo-library.mjs';
import {releaseModes} from '../../plugin-src/scripts/build.mjs';
import {snapshotPackage, validateRuntime} from '../../plugin-src/scripts/marketplace-builder.mjs';
import {validateBuildConfig, validateRelease} from '../src/main/boundary.mts';
import {assertSourceUnchanged, exportNativePayload, sourceIdentity} from './native-payload.mjs';
import {assertArtifactSafe} from '../../plugin-src/scripts/artifact-safety.mjs';
import {discoverMediaCodecRuntime} from '../src/main/media-codec-runtime.mts';

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

export async function validateInstallerMarketplace(input, release, sealed) {
    await assertArtifactSafe(input);
    const entries = await snapshotPackage(input);
    if (sealed && !isDeepStrictEqual(entries, sealed)) throw Error('Packaged marketplace changed from the sealed desktop stage');
    const plugin = path.join(input, release.appScope);
    const runtime = await validateRuntime(plugin, release);
    const files = readJSON(path.join(input, 'package-files.json'));
    if (files.format !== 'nova-content-marketplace-package-files' || files.schemaVersion !== 1 || !isDeepStrictEqual(files.release, readJSON(path.join(plugin, 'plugin-src/src/release.json'))) || !isDeepStrictEqual(files.entries, runtime)) throw Error('Marketplace package-files integrity mismatch');
    if (!isDeepStrictEqual(entries, await snapshotPackage(input))) throw Error('Marketplace changed during installer validation');
    return entries;
}

export const reportRuntimeRoots = ['plugin-src/skills/jc-media-research/upstream/current','plugin-src/skills/jc-comment-visualize/upstream/current'];
export const reportRuntimeFiles = [
    ...['assets/account-template.html','assets/shared/reading.css','assets/vendor/echarts.min.js','assets/account-charts.mjs','scripts/account_report.py','assets/page-template.html','scripts/render_report.py'].map(file=>`${reportRuntimeRoots[0]}/${file}`),
    ...['assets/report-template.html','assets/reading.css','assets/report.js'].map(file=>`${reportRuntimeRoots[1]}/${file}`)
];
const digestFile = async file => {const digest=createHash('sha256');for await(const bytes of fs.createReadStream(file))digest.update(bytes);return digest.digest('hex');};
export async function validateReportRuntimeAssets(directory, sourceRoot = path.resolve(workbench,'..')) {
    const result=[];
    for(const relative of reportRuntimeFiles){const file=path.join(directory,relative),source=path.join(sourceRoot,relative);if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())throw Error(`Required report runtime asset is missing: ${relative}`);const sha256=await digestFile(file);if(sha256!==await digestFile(source))throw Error(`Report runtime asset changed: ${relative}`);result.push({path:relative,bytes:fs.statSync(file).size,sha256});}
    return result;
}
export function validateReportPackagingRules(config) {
    const root=config.directories.app,selected=new FileMatcher(root,path.resolve('unused-package-target'),value=>value,config.files).createFilter();
    for(const relative of reportRuntimeFiles)if(!selected(path.join(root,relative),{isDirectory:()=>false}))throw Error(`Installer excludes required report runtime asset: ${relative}`);
}
export async function validateLocalAsrPayload(directory, target, sealedManifestSha256) {
    const manifestPath=path.join(directory,'payload-manifest.json'),stat=fs.lstatSync(manifestPath);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('Invalid local ASR payload manifest');
    const manifestSha256=await digestFile(manifestPath);if(sealedManifestSha256&&manifestSha256!==sealedManifestSha256)throw Error('Packaged local ASR manifest changed from sealed source');
    const manifest=readJSON(manifestPath),runtime=readJSON(path.join(directory,'runtime.json'));if(manifest.version!==1||!Array.isArray(manifest.files)||manifest.files.length>50000||runtime.version!==1||runtime.platform!==target.platform||runtime.arch!==target.arch||runtime.engine!=='qwen3-asr'||runtime.timing?.engine!=='faster-whisper')throw Error('Local ASR payload target or timing runtime mismatch');
    const names=new Set(['payload-manifest.json']);let bytes=0;
    for(const file of manifest.files){if(typeof file.path!=='string'||file.path.includes('\\')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(file.path)||names.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid local ASR payload entry');names.add(file.path);const absolute=path.join(directory,file.path),s=fs.lstatSync(absolute);if(!s.isFile()||s.isSymbolicLink()||s.size!==file.bytes)throw Error(`Local ASR payload size or file type mismatch: ${file.path}`);if(await digestFile(absolute)!==file.sha256)throw Error(`Local ASR payload hash mismatch: ${file.path}`);bytes+=s.size;}
    const walk=relative=>{for(const item of fs.readdirSync(path.join(directory,relative),{withFileTypes:true})){const name=relative?`${relative}/${item.name}`:item.name;if(item.isDirectory())walk(name);else if(!item.isFile()||!names.has(name))throw Error(`Unlisted local ASR payload file: ${name}`);}};walk('');
    if(typeof runtime.executable!=='string'||!names.has(runtime.executable))throw Error('Local ASR executable is not sealed');if(target.platform!=='win32'&&!(fs.statSync(path.join(directory,runtime.executable)).mode&0o111))throw Error('Local ASR executable mode lost');
    return{manifestSha256,files:manifest.files.length,bytes};
}

export function archiveMacOutput(output, arch) {
    const name = arch === 'x64' ? 'mac' : `mac-${arch}`;
    const source = path.join(output, name);
    if (!fs.lstatSync(source).isDirectory()) throw Error('Packaged macOS output must be a directory');
    // Keep validated build copies away from Spotlight without changing the delivered DMG.
    const parent = path.join(output, '.packaged-apps.noindex');
    fs.mkdirSync(parent, {recursive: true});
    const archived = path.join(fs.mkdtempSync(path.join(parent, 'build-')), name);
    fs.renameSync(source, archived);
    return archived;
}

/** Fail packaging if a model payload or weight file is accidentally reintroduced. */
export async function assertModelFreeArtifact(root) {
    const forbidden=/\.(?:safetensors|gguf|ggml|ckpt|pth|pt|onnx)$|^(?:pytorch_model(?:-\d+-of-\d+)?|model|ggml-[^/]+)\.bin$/i;
    const walk=async directory=>{for(const entry of await fs.promises.readdir(directory,{withFileTypes:true})){
        const file=path.join(directory,entry.name);
        if(entry.isSymbolicLink())continue; // Existing artifact safety validates symlink boundaries.
        if(entry.isDirectory()){if(['local-asr','.local-probes','.cache','huggingface'].includes(entry.name))throw Error('Model payload directory is forbidden in model-free installers');await walk(file);}
        else if(entry.isFile()&&forbidden.test(entry.name))throw Error('Model weight is forbidden in model-free installers: '+path.relative(root,file));
    }};
    const stat=await fs.promises.stat(root);if(stat.isDirectory())await walk(root);else if(forbidden.test(path.basename(root)))throw Error('Model weight is forbidden in model-free installers');
}

export function installerConfig(options, version) {
    const output = path.join(workbench, 'release', `${options.platform}-${options.arch}`, options.channel);
    const icons = path.join(workbench, 'resources/brand/desktop');
    const marketplace = path.join(workbench, `dist-desktop/auth-${options.auth}/workbench/plugin-marketplace`);
    const coverPlaceholder = 'nova-content-hub/skills/jc-cover-design/upstream/current/assets/.gitkeep';
    // Installed Qwen environments are discovered at runtime. Development caches never enter installers.
    const localAsrResources=[];
    const mediaCodec=path.resolve(workbench,'../.local-probes/media-codec-release-v1',`${options.platform}-${options.arch}`);
    const codecResources=options.platform==='darwin'&&options.arch==='arm64'&&fs.existsSync(path.join(mediaCodec,'media-codec-manifest.json'))?[{from:mediaCodec,to:`media-codec/${options.platform}-${options.arch}`,filter:['**/*']}]:[];
    return {
        appId: options.channel === 'local' ? 'com.novaisland.nova-content-hub.local' : options.channel === 'testing' ? 'com.novaisland.nova-content-hub.testing' : 'com.novaisland.nova-content-hub',
        productName: options.channel === 'local' ? '自媒体工作台开发版' : options.channel === 'testing' ? '自媒体工作台测试版' : '自媒体工作台',
        copyright: '© 2026 杭州新岛橙灵智能科技有限责任公司',
        electronVersion: '44.9.0',
        directories: {app: path.join(workbench, `dist-desktop/auth-${options.auth}`), output},
        extraMetadata: {version, description: options.channel === 'local' ? '自媒体工作台 local development build; no login required; not for distribution' : options.channel === 'testing' ? '自媒体工作台 restricted testing build; authentication unavailable' : '自媒体工作台 · 第二大脑与内容创作', author: {name: '杭州新岛橙灵智能科技有限责任公司'}},
        artifactName: `Nova-Content-Hub-${version}-${options.platform}-${options.arch}-${options.channel}.\${ext}`,
        publish: null,
        // Real-path file tools and sharp already run from a checked stage; keep their layout unchanged.
        asar: false,
        npmRebuild: false,
        // Runs before DMG/NSIS creation, including resources copied by builder.
        afterPack: path.join(workbench, 'scripts/artifact-safety-hook.mjs'),
        files: [
            'package.json', 'workbench/package.json', 'workbench/dist/**/*',
            'plugin-src/src/lib/**/*', 'plugin-src/src/bridge/**/*', 'plugin-src/src/content.mjs',
            'plugin-src/resources/**/*', 'plugin-src/references/**/*', 'plugin-src/schemas/**/*',
            'plugin-src/skills/jc-media-research/upstream/current/**/*','plugin-src/skills/jc-comment-visualize/upstream/current/**/*',
            '!**/{test,tests,__tests__,runtime,release}/**/*', '!**/*{.test,.spec}.*', '!**/*probe.mjs',
            '!**/*.map', '!**/.DS_Store', '!package-lock.json', '!workbench/scripts/**/*', '!plugin-src/scripts/**/*', '!scripts/**/*',
            '!**/{fixture,fixtures,__fixtures__,logs,.local-probes}/**/*',
            '!**/{credentials,service-settings,machine-binding,local-preferences}*.{json,json5,enc,db,sqlite,tmp,bak}',
            '!**/*.log', '!**/内容库.json', '!**/.npmrc', '!**/.netrc'
        ],
        // Separate resources preserve the plugin's launch scripts and bundled Node from app-source exclusions.
        extraResources: [
            {from: marketplace, to: 'plugin-marketplace', filter: ['**/*']},
            // Builder's recursive walk skips .gitkeep before filtering; copy this sealed file directly.
            {from: path.join(marketplace, coverPlaceholder), to: `plugin-marketplace/${coverPlaceholder}`},
            ...localAsrResources,...codecResources
        ],
        mac: {
            target: [{target: 'dmg', arch: [options.arch]}],
            icon: path.join(icons, 'icon.icns'),
            category: 'public.app-category.productivity',
            identity: '-', hardenedRuntime: false, notarize: false,
            // Both sealed resource trees must remain byte-identical through app signing.
            signIgnore: [
                '[/\\\\]Contents[/\\\\]Resources[/\\\\]plugin-marketplace(?:[/\\\\]|$)',
                '[/\\\\]Contents[/\\\\]Resources[/\\\\]local-asr(?:[/\\\\]|$)',
                '[/\\\\]Contents[/\\\\]Resources[/\\\\]media-codec(?:[/\\\\]|$)'
            ],
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
    validateReportPackagingRules(builderConfig);
    const sealedReports=await validateReportRuntimeAssets(builderConfig.directories.app);
    const asrResource=builderConfig.extraResources.find(resource=>resource.to===`local-asr/${options.platform}-${options.arch}`);
    await assertModelFreeArtifact(builderConfig.directories.app);
    for(const resource of builderConfig.extraResources)await assertModelFreeArtifact(resource.from);
    const sealedAsr=asrResource?await validateLocalAsrPayload(asrResource.from,options):null;
    const codecResource=builderConfig.extraResources.find(resource=>resource.to===`media-codec/${options.platform}-${options.arch}`);
    const sealedCodec=codecResource?await discoverMediaCodecRuntime([codecResource.from]):undefined;
    if(options.platform==='darwin'&&options.arch==='arm64'&&(!sealedCodec||sealedCodec.validation!=='offline-codec-self-test'))throw Error('Apple Silicon model-free installer requires a verified independent media-codec payload. Run prepare-media-codec with its explicit sealed source.');
    // Use checksums from the locked Electron package, retaining archive validation without a network-only checksum fetch.
    builderConfig.electronDownload = {force: false, checksums: readJSON(path.join(workbench, 'node_modules/electron/checksums.json'))};
    if (options.platform === 'darwin' && options.channel === 'preview') {
        const demo = buildDemoLibrary();
        await assertArtifactSafe(demo, {allowGeneratedExampleLibrary:true});
        const appFolder = path.join(builderConfig.directories.output, options.arch === 'arm64' ? 'mac-arm64' : 'mac', '自媒体工作台.app');
        builderConfig.dmg = {...builderConfig.dmg, window: {width: 600, height: 450}, contents: [{x: 130, y: 150, type: 'file', path: appFolder}, {x: 450, y: 150, type: 'link', path: '/Applications'}, {x: 290, y: 330, type: 'dir', path: demo}]};
    }
    const [pluginRelease] = await releaseModes(options.auth);
    const sealedMarketplace = await validateInstallerMarketplace(builderConfig.extraResources[0].from, pluginRelease);
    fs.mkdirSync(builderConfig.directories.output, {recursive: true});
    const configFile = path.join(builderConfig.directories.output, 'electron-builder.json');
    fs.writeFileSync(configFile, JSON.stringify(builderConfig, null, 2) + '\n');
    const env = testingEnvironment();
    execFileSync(process.execPath, [path.join(workbench, 'node_modules/electron-builder/cli.js'), options.platform === 'darwin' ? '--mac' : '--win', `--${options.arch}`, '--publish', 'never', '--config', configFile], {cwd: workbench, stdio: 'inherit', env});
    const suffix = options.arch === 'x64' ? '' : `-${options.arch}`;
    const resources = options.platform === 'darwin'
        ? path.join(builderConfig.directories.output, `mac${suffix}`, `${builderConfig.productName}.app`, 'Contents/Resources')
        : path.join(builderConfig.directories.output, `win${suffix}-unpacked`, 'resources');
    await validateInstallerMarketplace(path.join(resources, 'plugin-marketplace'), pluginRelease, sealedMarketplace);
    if(!isDeepStrictEqual(await validateReportRuntimeAssets(path.join(resources,'app')),sealedReports))throw Error('Packaged report runtime assets changed from sealed stage');
    if(asrResource&&sealedAsr)await validateLocalAsrPayload(path.join(resources,asrResource.to),options,sealedAsr.manifestSha256);
    if(codecResource&&sealedCodec){const packagedCodec=await discoverMediaCodecRuntime([path.join(resources,codecResource.to)]);if(!packagedCodec||packagedCodec.identity!==sealedCodec.identity||packagedCodec.validation!=='offline-codec-self-test')throw Error('Packaged media codec changed or failed its independent offline verification.');}
    await assertArtifactSafe(resources);
    await assertModelFreeArtifact(resources);
    if (options.platform === 'darwin') console.log(`Validated macOS build copy archived: ${archiveMacOutput(builderConfig.directories.output, options.arch)}`);
    console.log(`Non-production ${options.channel} installer: ${builderConfig.directories.output}; AUTH_MODE=${options.auth}, experimental=true, productionReady=false. ${options.auth === 'disabled' ? 'No login required.' : 'Restricted testing; authentication unavailable.'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { await distribute(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
