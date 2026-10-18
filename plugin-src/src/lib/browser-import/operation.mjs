import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash, randomUUID} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {createLibrary, openLibrary} from "../file-library/index.mjs";
import {BrowserImportError, readBrowserBackup} from "./inspect.mjs";
import {mapBrowserState} from "./map.mjs";

const UUID =
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    HASH = /^[a-f0-9]{64}$/;
const SYSTEM = "系统（别动）",
    VERSION = 1;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const identity = (s) => ({dev: String(s.dev), ino: String(s.ino)});
const fingerprint = (s) =>
    ["dev", "ino", "size", "mtimeNs", "ctimeNs"]
        .map((k) => String(s[k]))
        .join(":");
const object = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const exact = (x, keys) =>
    object(x) && Object.keys(x).sort().join() === keys.slice().sort().join();
const fail = (code, message) => {
    throw new BrowserImportError(code, message);
};
let fault;
export const __testing = Object.freeze({
    setHook(fn) {
        if (process.env.NODE_ENV !== "test")
            fail("INVALID_INPUT", "Fault hooks require test mode");
        fault = fn;
    },
});
export const hook = (phase, details = {}) => fault?.({phase, ...details});

export function portable(name) {
    if (
        typeof name !== "string" ||
        !name ||
        /[\\<>:"|?*\x00-\x1f\x7f]/.test(name) ||
        name.startsWith("/") ||
        name
            .split("/")
            .some(
                (p) =>
                    !p ||
                    p === "." ||
                    p === ".." ||
                    /[. ]$/.test(p) ||
                    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(p),
            )
    )
        fail("UNSAFE_PATH", "Path is not portable between Windows and macOS");
    return name;
}

export function stat(file, optional = false) {
    const full = path.resolve(file);
    let current = path.parse(full).root;
    const parts = full.slice(current.length).split(path.sep).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        current = path.join(current, parts[i]);
        let s;
        try {
            s = fs.lstatSync(current, {bigint: true});
        } catch (e) {
            if (optional && e.code === "ENOENT" && i === parts.length - 1)
                return null;
            throw e;
        }
        if (s.isSymbolicLink() || (i < parts.length - 1 && !s.isDirectory()))
            fail(
                "UNSAFE_PATH",
                "Symbolic links and non-directory ancestors are refused",
            );
        if (i === parts.length - 1) return s;
    }
}

export function directory(file) {
    if (!stat(file).isDirectory()) fail("UNSAFE_PATH", "Expected a directory");
}

export function read(file, optional = false) {
    const s = stat(file, optional);
    if (!s) return null;
    if (!s.isFile()) fail("UNSAFE_PATH", "Expected an ordinary file");
    if (s.size > 64n * 1024n * 1024n)
        fail(
            "IMPORT_LIMIT_EXCEEDED",
            "Import metadata or pinned source exceeds 64 MiB",
        );
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        return fs.readFileSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

export function sync(dir) {
    directory(dir);
    let fd;
    try {
        fd = fs.openSync(
            dir,
            fs.constants.O_RDONLY |
            fs.constants.O_DIRECTORY |
            fs.constants.O_NOFOLLOW,
        );
        fs.fsyncSync(fd);
    } catch (e) {
        if (
            process.platform !== "win32" ||
            !["EISDIR", "EPERM", "EINVAL", "ENOTSUP", "ENOSYS"].includes(e.code)
        )
            throw e;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

export function mkdir(dir) {
    directory(path.dirname(dir));
    fs.mkdirSync(dir, {mode: 0o700});
    sync(path.dirname(dir));
}

export function ensure(dir) {
    if (!stat(dir, true)) mkdir(dir);
    else directory(dir);
}

export function write(file, bytes) {
    directory(path.dirname(file));
    stat(file, true);
    const fd = fs.openSync(
        file,
        fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
        0o600,
    );
    try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    sync(path.dirname(file));
}

export function publish(file, bytes) {
    const existing = read(file, true);
    if (existing) {
        if (!existing.equals(bytes))
            fail("IMPORT_CONFLICT", "Immutable import evidence differs");
        return;
    }
    const temp = path.join(path.dirname(file), `.publish-${randomUUID()}`);
    write(temp, bytes);
    try {
        fs.linkSync(temp, file);
    } catch (e) {
        if (e.code !== "EEXIST") throw e;
        if (!read(file).equals(bytes))
            fail("IMPORT_CONFLICT", "Concurrent publication differs");
    }
    sync(path.dirname(file));
    fs.unlinkSync(temp);
    sync(path.dirname(file));
}

export function parse(file, optional = false) {
    const bytes = read(file, optional);
    if (bytes === null) return null;
    try {
        return JSON.parse(bytes);
    } catch {
        fail("CORRUPT_IMPORT", "Invalid persisted import JSON");
    }
}

function bind(actual, expected, label) {
    if (!isDeepStrictEqual(identity(stat(actual)), expected))
        fail("TARGET_CHANGED", `${label} was replaced`);
}

function destination(value) {
    if (typeof value !== "string" || !path.isAbsolute(value))
        fail("INVALID_INPUT", "Select an absolute destination");
    const name = path.basename(value),
        parent = fs.realpathSync(path.dirname(value));
    portable(name);
    if (
        name.startsWith(".nova-browser-import-") ||
        parent.split(path.sep).some((p) => p.startsWith(".nova-browser-import-"))
    )
        fail("UNSAFE_PATH", "Destination overlaps an import work directory");
    directory(parent);
    return {
        parent,
        name,
        root: path.join(parent, name),
        reservation: path.join(
            parent,
            `.nova-browser-import-target-${sha(Buffer.from(name.normalize("NFC").toLocaleLowerCase("en-US")))}.json`,
        ),
    };
}

function operationFor(value, expectedId) {
    const d = destination(value),
        r = parse(d.reservation, true);
    if (!r) {
        if (expectedId) fail("IMPORT_NOT_FOUND", "No import owns this target");
        return null;
    }
    if (
        !exact(r, [
            "format",
            "schemaVersion",
            "importId",
            "destinationName",
            "sourceHash",
        ]) ||
        r.format !== "nova-browser-import-reservation" ||
        r.schemaVersion !== VERSION ||
        !UUID.test(r.importId) ||
        !HASH.test(r.sourceHash) ||
        r.destinationName !== d.name
    )
        fail(
            "IMPORT_CONFLICT",
            "Target reservation is incompatible or belongs to an alias",
        );
    if (expectedId && r.importId !== expectedId)
        fail("IMPORT_CONFLICT", "Different importId owns this target");
    const work = path.join(d.parent, `.nova-browser-import-${r.importId}`),
        op = parse(path.join(work, "operation.json"));
    if (
        !exact(op, [
            "format",
            "schemaVersion",
            "mappingVersion",
            "importId",
            "sourceHash",
            "destinationName",
            "parentIdentity",
            "workIdentity",
            "sourceBytes",
        ]) ||
        op.format !== "nova-browser-import" ||
        op.schemaVersion !== VERSION ||
        op.mappingVersion !== VERSION ||
        op.importId !== r.importId ||
        op.sourceHash !== r.sourceHash ||
        op.destinationName !== d.name ||
        !Number.isSafeInteger(op.sourceBytes)
    )
        fail("FORMAT_UNSUPPORTED", "Unsupported or mismatched import operation");
    bind(d.parent, op.parentIdentity, "Destination parent");
    bind(work, op.workIdentity, "Import work directory");
    const raw = read(path.join(work, "source.json"));
    if (raw.length !== op.sourceBytes || sha(raw) !== op.sourceHash)
        fail("CORRUPT_IMPORT", "Archived source checksum differs");
    return {...d, work, op};
}

function acquire(ctx) {
    const lock = path.join(ctx.work, "operation-lock"),
        token = randomUUID();
    for (let n = 0; n < 2; n++) {
        try {
            mkdir(lock);
        } catch (e) {
            if (e.code !== "EEXIST") throw e;
            directory(lock);
            const names = fs.readdirSync(lock);
            if (
                names.length !== 1 ||
                !UUID.test(names[0].slice(0, -5)) ||
                !names[0].endsWith(".json")
            )
                fail(
                    "LOCK_UNCERTAIN",
                    "Incomplete import lock; no age-based reclamation",
                );
            const ownerPath = path.join(lock, names[0]),
                owner = parse(ownerPath);
            if (
                !exact(owner, ["token", "pid", "host"]) ||
                owner.token !== names[0].slice(0, -5) ||
                !Number.isSafeInteger(owner.pid) ||
                owner.pid <= 0
            )
                fail("LOCK_UNCERTAIN", "Malformed import lock");
            if (owner.host !== os.hostname())
                fail("BUSY", "Import is running on another host");
            try {
                process.kill(owner.pid, 0);
                fail("BUSY", "Import executor is alive");
            } catch (error) {
                if (error.code !== "ESRCH") throw error;
            }
            try {
                fs.unlinkSync(ownerPath);
                fs.rmdirSync(lock);
                sync(ctx.work);
            } catch {
                fail("BUSY", "Import lock changed while reclaiming");
            }
            continue;
        }
        try {
            write(
                path.join(lock, `${token}.json`),
                json({token, pid: process.pid, host: os.hostname()}),
            );
        } catch (e) {
            try {
                fs.unlinkSync(path.join(lock, `${token}.json`));
            } catch {
            }
            try {
                fs.rmdirSync(lock);
            } catch {
            }
            throw e;
        }
        return () => {
            const owner = path.join(lock, `${token}.json`);
            if (read(owner, true)) {
                fs.unlinkSync(owner);
                fs.rmdirSync(lock);
                sync(ctx.work);
            }
        };
    }
    fail("BUSY", "Import lock changed");
}

const METHODS = new Set([
    "createContent",
    "updateContent",
    "trashContent",
    "createCollection",
    "updateCollection",
    "setCollectionMembers",
    "trashCollection",
    "createTemplate",
    "addTemplateVersion",
    "trashTemplate",
    "createUnavailablePhoto",
    "resolvePhoto",
    "trashPhoto",
    "createPrompt",
    "setPromptEnabled",
    "trashPrompt",
    "updateProfile",
    "createChannel",
    "updateChannel",
    "setPromptCategories",
    "addCustomRatio",
    "restoreGenerationDefaultReferences",
    "attachContentMaterial",
    "removeContentMaterial",
    "registerContentCandidate",
    "saveContentCoverVariant",
    "updateContentCandidate",
    "selectVariantCover",
    "saveContentImportedCoverBatch",
    "addContentUnavailableReference",
    "attachCollectionMaterial",
    "removeCollectionMaterial",
    "registerCollectionCandidate",
    "saveCollectionCoverVariant",
    "updateCollectionCandidate",
    "selectCollectionVariantCover",
    "saveCollectionImportedCoverBatch",
    "addCollectionUnavailableReference",
    "trashContentMaterial",
    "trashCollectionMaterial",
    "trashContentUnavailableReference",
    "trashCollectionUnavailableReference",
    "savePublicationPlan",
    "saveCollectionPublicationPlan",
    "recordHistoricalPublication",
    "recordHistoricalCollectionPublication",
]);

function stage(ctx) {
    const file = path.join(ctx.work, "stage-binding.json");
    let b = parse(file, true);
    if (!b) {
        const name = `stage-${randomUUID()}`,
            root = path.join(ctx.work, name);
        hook("beforeStageCreate");
        const lib = createLibrary(root);
        hook("beforeStageBinding");
        b = {
            format: "nova-browser-import-stage",
            schemaVersion: VERSION,
            name,
            identity: identity(stat(root)),
            libraryId: lib.info.libraryId,
        };
        publish(file, json(b));
        hook("afterStageBinding");
    }
    if (
        !exact(b, ["format", "schemaVersion", "name", "identity", "libraryId"]) ||
        b.format !== "nova-browser-import-stage" ||
        b.schemaVersion !== VERSION ||
        !/^stage-[a-f0-9-]{36}$/.test(b.name) ||
        !UUID.test(b.name.slice(6)) ||
        !UUID.test(b.libraryId)
    )
        fail("CORRUPT_IMPORT", "Invalid stage binding");
    const root = path.join(ctx.work, b.name);
    bind(root, b.identity, "Bound stage");
    const library = openLibrary(root);
    if (library.info.libraryId !== b.libraryId)
        fail("TARGET_CHANGED", "Bound stage library changed");
    return {root, library, binding: b};
}

function engine(ctx, s) {
    const latest = new Map();
    ensure(path.join(ctx.work, "steps"));
    for (const name of fs.readdirSync(path.join(ctx.work, "steps")))
        if (!/^[a-f0-9]{64}(?:\.result)?\.json$/.test(name))
            fail("CORRUPT_IMPORT", "Unknown mapper step file");
    return {
        library: s.library,
        root: s.root,
        work: ctx.work,
        importId: ctx.op.importId,
        sourceHash: ctx.op.sourceHash,
        hook,
        initialSettings() {
            const file = path.join(ctx.work, "initial-settings.json");
            let value = parse(file, true);
            if (!value) {
                value = s.library.readLibrarySettings();
                publish(file, json(value));
            }
            return value;
        },
        async step(stepKey, method, args) {
            if (
                !METHODS.has(method) ||
                typeof stepKey !== "string" ||
                !Array.isArray(args)
            )
                fail("INVALID_INPUT", "Unknown mapper step");
            const filename = path.join(
                ctx.work,
                "steps",
                `${sha(Buffer.from(stepKey))}.json`,
            );
            let intent = parse(filename, true);
            if (intent) {
                if (
                    !exact(intent, [
                        "format",
                        "schemaVersion",
                        "stepKey",
                        "mutationId",
                        "method",
                        "args",
                    ]) ||
                    intent.format !== "nova-browser-import-step" ||
                    intent.schemaVersion !== VERSION ||
                    intent.stepKey !== stepKey ||
                    !UUID.test(intent.mutationId) ||
                    intent.method !== method ||
                    !isDeepStrictEqual(intent.args, args)
                )
                    fail("IMPORT_CONFLICT", "Persisted step differs from mapper input");
            } else {
                intent = {
                    format: "nova-browser-import-step",
                    schemaVersion: VERSION,
                    stepKey,
                    mutationId: randomUUID(),
                    method,
                    args,
                };
                hook("beforeStepIntent", {stepKey});
                publish(filename, json(intent));
                hook("afterStepIntent", {stepKey});
            }
            let result = s.library.queryMutation(intent.mutationId)?.content;
            if (!result) {
                result = await s.library[method](...intent.args, {
                    mutationId: intent.mutationId,
                });
                hook("afterCrud", {stepKey});
            }
            const resultFile = filename.replace(/\.json$/, ".result.json");
            hook("beforeStepResult", {stepKey});
            publish(resultFile, json(result));
            hook("afterStepResult", {stepKey});
            latest.set(`${result.format}:${result.id}`, result);
            return result;
        },
        asset(file, expectedHash, purpose) {
            const bytes = read(file);
            if (sha(bytes) !== expectedHash)
                fail("CORRUPT_IMPORT", "Pinned asset differs");
            return s.library.importAsset(file, {purpose});
        },
        evidence(name, bytes) {
            if (
                ![
                    "原始备份.json",
                    "映射.json",
                    "资源.json",
                    "报告.json",
                    "历史任务.json",
                    "收据.json",
                ].includes(name)
            )
                fail("INVALID_INPUT", "Unknown provenance document");
            const dir = path.join(s.root, SYSTEM, "导入");
            ensure(dir);
            const own = path.join(dir, ctx.op.importId);
            ensure(own);
            publish(path.join(own, name), bytes);
        },
        verify() {
            const readers = {
                "nova-content": "readContent",
                "nova-collection": "readCollection",
                "nova-photo": "readPhoto",
                "nova-template": "readTemplate",
                "nova-prompt": "readPrompt",
                "nova-workspace": "readLibrarySettings",
            };
            for (const expected of latest.values()) {
                const method = readers[expected.format];
                if (
                    !method ||
                    s.library[method](expected.id).editToken !== expected.editToken
                )
                    fail(
                        "IMPORT_CONFLICT",
                        "Stage object differs from its last committed mapper step",
                    );
            }
        },
        evidenceAsset(assetHash, bytes) {
            if (!HASH.test(assetHash) || sha(bytes) !== assetHash)
                fail("CORRUPT_IMPORT", "Invalid preserved resource hash");
            const parent = path.join(s.root, SYSTEM, "导入", ctx.op.importId);
            ensure(path.join(s.root, SYSTEM, "导入"));
            ensure(parent);
            ensure(path.join(parent, "不可用资源"));
            publish(path.join(parent, "不可用资源", assetHash), bytes);
        },
        json,
        sha,
    };
}

function fileDigest(file) {
    const before = stat(file);
    if (!before.isFile())
        fail("UNSAFE_PATH", "Only ordinary import files are allowed");
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW),
        digest = createHash("sha256");
    let bytes = 0;
    try {
        if (fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before))
            fail("SOURCE_CHANGED", "File changed before hash");
        const chunk = Buffer.alloc(65536);
        for (; ;) {
            const n = fs.readSync(fd, chunk, 0, chunk.length, null);
            if (!n) break;
            bytes += n;
            digest.update(chunk.subarray(0, n));
        }
        if (
            fingerprint(fs.fstatSync(fd, {bigint: true})) !== fingerprint(before) ||
            fingerprint(stat(file)) !== fingerprint(before)
        )
            fail("SOURCE_CHANGED", "File changed during hash");
    } finally {
        fs.closeSync(fd);
    }
    return {bytes, sha256: digest.digest("hex")};
}

function inventory(root) {
    directory(root);
    const entries = [],
        seen = new Set();

    function walk(dir, prefix = "") {
        const before = fingerprint(stat(dir));
        for (const name of fs.readdirSync(dir).sort()) {
            const relative = prefix ? `${prefix}/${name}` : name;
            if (relative === `${SYSTEM}/库锁`) continue;
            portable(relative);
            const key = relative.normalize("NFC").toLocaleLowerCase("en-US");
            if (seen.has(key)) fail("UNSAFE_PATH", "Portable path collision");
            seen.add(key);
            const full = path.join(root, ...relative.split("/")),
                s = stat(full);
            if (s.isDirectory()) {
                entries.push({path: relative, type: "directory"});
                walk(full, relative);
            } else if (s.isFile())
                entries.push({path: relative, type: "file", ...fileDigest(full)});
            else fail("UNSAFE_PATH", "Special import file refused");
        }
        if (before !== fingerprint(stat(dir)))
            fail("SOURCE_CHANGED", "Directory changed while hashing");
    }

    walk(root);
    return entries.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
}

function ready(ctx, s) {
    const file = path.join(ctx.work, "ready.json");
    let value = parse(file, true);
    if (value) {
        if (
            !exact(value, [
                "format",
                "schemaVersion",
                "importId",
                "sourceHash",
                "mappingVersion",
                "libraryId",
                "stageIdentity",
                "descriptorHash",
                "receiptHash",
                "entries",
            ]) ||
            value.format !== "nova-browser-import-ready" ||
            value.schemaVersion !== VERSION ||
            value.mappingVersion !== VERSION ||
            value.importId !== ctx.op.importId ||
            value.sourceHash !== ctx.op.sourceHash ||
            value.libraryId !== s.binding.libraryId ||
            !isDeepStrictEqual(value.stageIdentity, s.binding.identity)
        )
            fail("CORRUPT_IMPORT", "Invalid READY evidence");
    } else {
        const receipt = read(
            path.join(s.root, SYSTEM, "导入", ctx.op.importId, "收据.json"),
        );
        value = {
            format: "nova-browser-import-ready",
            schemaVersion: VERSION,
            importId: ctx.op.importId,
            sourceHash: ctx.op.sourceHash,
            mappingVersion: VERSION,
            libraryId: s.binding.libraryId,
            stageIdentity: s.binding.identity,
            descriptorHash: sha(read(path.join(s.root, "内容库.json"))),
            receiptHash: sha(receipt),
            entries: inventory(s.root),
        };
        hook("beforeReady");
        publish(file, json(value));
        hook("afterReady");
    }
    if (!isDeepStrictEqual(inventory(s.root), value.entries))
        fail("SOURCE_CHANGED", "Frozen stage differs from READY");
    return value;
}

function targetBinding(ctx) {
    const b = parse(path.join(ctx.work, "target-binding.json"), true);
    if (b) {
        if (
            !exact(b, ["format", "schemaVersion", "identity"]) ||
            b.format !== "nova-browser-import-target" ||
            b.schemaVersion !== VERSION
        )
            fail("CORRUPT_IMPORT", "Invalid target binding");
        bind(ctx.root, b.identity, "Bound import target");
    }
    return b;
}

function committedFact(ctx) {
    const durable = parse(path.join(ctx.work, "committed.json"), true);
    if (durable) {
        if (
            !exact(durable, [
                "format",
                "schemaVersion",
                "importId",
                "sourceHash",
                "libraryId",
                "readyHash",
                "targetIdentity",
            ]) ||
            durable.format !== "nova-browser-import-committed" ||
            durable.schemaVersion !== VERSION ||
            durable.importId !== ctx.op.importId ||
            durable.sourceHash !== ctx.op.sourceHash ||
            !UUID.test(durable.libraryId)
        )
            fail("CORRUPT_IMPORT", "Invalid committed record");
        let changed = false,
            descriptorChanged = null;
        try {
            bind(ctx.root, durable.targetIdentity, "Committed target");
            const raw = read(path.join(ctx.root, "内容库.json")),
                d = JSON.parse(raw),
                ready = parse(path.join(ctx.work, "ready.json"), true);
            changed = d.libraryId !== durable.libraryId;
            descriptorChanged = ready ? sha(raw) !== ready.descriptorHash : null;
        } catch {
            changed = true;
        }
        return {
            libraryId: durable.libraryId,
            targetChanged: changed,
            descriptorChanged,
        };
    }
    const r = parse(path.join(ctx.work, "ready.json"), true),
        binding = targetBinding(ctx);
    if (!r || !binding) return null;
    const descriptor = read(path.join(ctx.root, "内容库.json"), true);
    if (!descriptor) return null;
    if (sha(descriptor) !== r.descriptorHash)
        fail("TARGET_CHANGED", "Published descriptor differs from READY");
    const receipt = read(
        path.join(ctx.root, SYSTEM, "导入", ctx.op.importId, "收据.json"),
    );
    if (sha(receipt) !== r.receiptHash)
        fail("TARGET_CHANGED", "Import receipt differs");
    const proof = JSON.parse(receipt);
    if (
        proof.importId !== ctx.op.importId ||
        proof.sourceHash !== ctx.op.sourceHash ||
        proof.libraryId !== r.libraryId
    )
        fail("CORRUPT_IMPORT", "Import receipt identity differs");
    return {libraryId: r.libraryId, targetChanged: false};
}

function result(ctx, status, extra = {}) {
    const resources = parse(path.join(ctx.work, "resources.json"), true),
        report = parse(path.join(ctx.work, "report.json"), true),
        failure = parse(path.join(ctx.work, "failure.json"), true),
        progress = {
            steps: fs.existsSync(path.join(ctx.work, "steps"))
                ? fs
                    .readdirSync(path.join(ctx.work, "steps"))
                    .filter((n) => n.endsWith(".result.json")).length
                : 0,
            resources: resources?.length ?? 0,
            ...(report ? {counts: report.counts} : {}),
        };
    return {
        importId: ctx.op.importId,
        status,
        sourceHash: ctx.op.sourceHash,
        destination: ctx.root,
        progress,
        issues: [
            ...(status !== "committed" && failure
                ? [{code: failure.code, status: "blocked"}]
                : []),
            ...(report?.issues || []).filter((r) => !r.status),
            ...(resources ?? [])
                .filter((r) => r.status !== "available")
                .map((r) => ({key: r.key, code: r.code, status: r.status})),
        ],
        ...extra,
    };
}

export function getBrowserImport(value, importId) {
    const ctx = operationFor(value, importId);
    if (!ctx) return null;
    const fact = committedFact(ctx);
    if (fact) return result(ctx, "committed", fact);
    const has = (name) => !!stat(path.join(ctx.work, name), true);
    return result(
        ctx,
        has("target-binding.json")
            ? "publishing"
            : has("ready.json")
                ? "ready"
                : has("failure.json")
                    ? "blocked"
                    : has("operation-lock")
                        ? "running"
                        : "prepared",
    );
}

function finalInstall(ctx, s, r) {
    let binding = targetBinding(ctx);
    if (!binding) {
        if (!stat(ctx.root, true)) mkdir(ctx.root);
        else directory(ctx.root);
        if (fs.readdirSync(ctx.root).length)
            fail("DESTINATION_EXISTS", "New target must be empty");
        hook("beforeTargetBinding");
        binding = {
            format: "nova-browser-import-target",
            schemaVersion: VERSION,
            identity: identity(stat(ctx.root)),
        };
        publish(path.join(ctx.work, "target-binding.json"), json(binding));
        hook("afterTargetBinding");
    }
    const started = path.join(ctx.work, "install-started");
    ensure(started);
    const temporaryFor = (e) =>
        `.nch-import-${ctx.op.importId}-${sha(Buffer.from(e.path))}`;
    for (const e of r.entries.filter((e) => e.type === "file")) {
        const file = path.join(ctx.root, ...e.path.split("/")),
            temp = path.join(path.dirname(file), temporaryFor(e)),
            marker = path.join(started, sha(Buffer.from(e.path)));
        if (fs.existsSync(path.dirname(file)) && stat(temp, true)) {
            if (
                read(marker, true)?.toString() !== e.path ||
                !isDeepStrictEqual(fileDigest(temp), {
                    bytes: e.bytes,
                    sha256: e.sha256,
                })
            )
                fail(
                    "TARGET_CHANGED",
                    "Owned install temporary differs from READY; preserved for diagnosis",
                );
            fs.unlinkSync(temp);
            sync(path.dirname(temp));
        }
    }
    const allowed = new Map(r.entries.map((e) => [e.path, e]));
    for (const actual of inventory(ctx.root))
        if (!isDeepStrictEqual(actual, allowed.get(actual.path)))
            fail(
                "TARGET_CHANGED",
                "Target has unknown or changed partial-install data",
            );
    for (const e of r.entries
        .filter((e) => e.type === "directory")
        .sort((a, b) => a.path.split("/").length - b.path.split("/").length)) {
        bind(ctx.root, binding.identity, "Import target");
        const dir = path.join(ctx.root, ...e.path.split("/"));
        ensure(dir);
    }
    const install = (e) => {
        bind(ctx.root, binding.identity, "Import target");
        const file = path.join(ctx.root, ...e.path.split("/")),
            temp = path.join(path.dirname(file), temporaryFor(e)),
            marker = path.join(started, sha(Buffer.from(e.path)));
        publish(marker, Buffer.from(e.path));
        if (stat(temp, true)) {
            if (
                !isDeepStrictEqual(fileDigest(temp), {
                    bytes: e.bytes,
                    sha256: e.sha256,
                })
            )
                fail("TARGET_CHANGED", "Install temporary differs from READY");
            fs.unlinkSync(temp);
            sync(path.dirname(temp));
        }
        if (stat(file, true)) {
            if (
                !isDeepStrictEqual(fileDigest(file), {
                    bytes: e.bytes,
                    sha256: e.sha256,
                })
            )
                fail("TARGET_CHANGED", "Existing target file differs from this import");
            return;
        }
        const source = path.join(s.root, ...e.path.split("/"));
        const before = fileDigest(source);
        if (before.bytes !== e.bytes || before.sha256 !== e.sha256)
            fail("SOURCE_CHANGED", "READY source changed");
        const input = fs.openSync(
                source,
                fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
            ),
            output = fs.openSync(
                temp,
                fs.constants.O_WRONLY |
                fs.constants.O_CREAT |
                fs.constants.O_EXCL |
                fs.constants.O_NOFOLLOW,
                0o600,
            );
        try {
            const chunk = Buffer.alloc(65536);
            for (; ;) {
                const n = fs.readSync(input, chunk, 0, chunk.length, null);
                if (!n) break;
                let offset = 0;
                while (offset < n)
                    offset += fs.writeSync(output, chunk, offset, n - offset);
            }
            fs.fsyncSync(output);
        } finally {
            fs.closeSync(input);
            fs.closeSync(output);
        }
        if (!isDeepStrictEqual(fileDigest(temp), before))
            fail("SOURCE_CHANGED", "Install bytes changed");
        if (e.path === "内容库.json") hook("beforeDescriptor");
        fs.linkSync(temp, file);
        if (e.path === "内容库.json") hook("afterDescriptor");
        sync(path.dirname(file));
        fs.unlinkSync(temp);
        sync(path.dirname(file));
        hook("afterInstallFile", {path: e.path});
    };
    for (const e of r.entries.filter(
        (e) => e.type === "file" && e.path !== "内容库.json",
    ))
        install(e);
    const expected = r.entries.filter((e) => e.path !== "内容库.json");
    if (!isDeepStrictEqual(inventory(ctx.root), expected))
        fail(
            "TARGET_CHANGED",
            "Target has unexpected or changed files before publication",
        );
    if (!isDeepStrictEqual(inventory(s.root), r.entries))
        fail("SOURCE_CHANGED", "READY stage changed before descriptor publication");
    install(r.entries.find((e) => e.path === "内容库.json"));
    return binding;
}

async function execute(ctx) {
    let release;
    try {
        release = acquire(ctx);
    } catch (error) {
        throw Object.assign(error, {
            importId: ctx.op.importId,
            workDirectory: ctx.work,
            destination: ctx.root,
        });
    }
    try {
        let fact = committedFact(ctx);
        if (fact) {
            if (!read(path.join(ctx.work, "committed.json"), true)) {
                const r = parse(path.join(ctx.work, "ready.json")),
                    b = targetBinding(ctx);
                publish(
                    path.join(ctx.work, "committed.json"),
                    json({
                        format: "nova-browser-import-committed",
                        schemaVersion: VERSION,
                        importId: ctx.op.importId,
                        sourceHash: ctx.op.sourceHash,
                        libraryId: fact.libraryId,
                        readyHash: sha(json(r)),
                        targetIdentity: b.identity,
                    }),
                );
            }
            return result(ctx, "committed", fact);
        }
        const s = stage(ctx);
        if (!stat(path.join(ctx.work, "ready.json"), true)) {
            const checked = readBrowserBackup(path.join(ctx.work, "source.json"));
            if (checked.sourceHash !== ctx.op.sourceHash)
                fail("CORRUPT_IMPORT", "Archived source differs");
            await mapBrowserState(checked.state, engine(ctx, s));
        }
        const r = ready(ctx, s);
        fact = committedFact(ctx);
        const binding = fact ? targetBinding(ctx) : finalInstall(ctx, s, r);
        hook("beforeCommitted");
        publish(
            path.join(ctx.work, "committed.json"),
            json({
                format: "nova-browser-import-committed",
                schemaVersion: VERSION,
                importId: ctx.op.importId,
                sourceHash: ctx.op.sourceHash,
                libraryId: r.libraryId,
                readyHash: sha(json(r)),
                targetIdentity: binding.identity,
            }),
        );
        hook("afterCommitted");
        return result(ctx, "committed", {
            libraryId: r.libraryId,
            targetChanged: false,
        });
    } catch (error) {
        let fact;
        try {
            fact = committedFact(ctx);
        } catch {
        }
        if (fact) {
            try {
                const r = parse(path.join(ctx.work, "ready.json")),
                    b = targetBinding(ctx);
                publish(
                    path.join(ctx.work, "committed.json"),
                    json({
                        format: "nova-browser-import-committed",
                        schemaVersion: VERSION,
                        importId: ctx.op.importId,
                        sourceHash: ctx.op.sourceHash,
                        libraryId: fact.libraryId,
                        readyHash: sha(json(r)),
                        targetIdentity: b.identity,
                    }),
                );
            } catch {
            }
            throw Object.assign(error, {
                importId: ctx.op.importId,
                workDirectory: ctx.work,
                outcome: "committed",
            });
        }
        try {
            const previous = read(path.join(ctx.work, "failure.json"), true);
            if (!previous)
                publish(
                    path.join(ctx.work, "failure.json"),
                    json({code: error.code || "IO_ERROR"}),
                );
        } catch {
        }
        throw Object.assign(error, {
            importId: ctx.op.importId,
            workDirectory: ctx.work,
            destination: ctx.root,
        });
    } finally {
        release();
    }
}

export async function resumeBrowserImport(value, importId) {
    if (!UUID.test(importId)) fail("INVALID_INPUT", "Expected importId UUID");
    return execute(operationFor(value, importId));
}

export async function importBrowserBackup(sourceFile, value, options = {}) {
    if (
        !object(options) ||
        Reflect.ownKeys(options).some((key) => key !== "expectedSourceHash") ||
        (Object.hasOwn(options, "expectedSourceHash") &&
            (typeof options.expectedSourceHash !== "string" ||
                !HASH.test(options.expectedSourceHash.toLowerCase())))
    )
        fail("INVALID_INPUT", "Expected only an optional SHA256 expectedSourceHash");
    const expectedSourceHash = Object.hasOwn(options, "expectedSourceHash")
        ? options.expectedSourceHash.toLowerCase()
        : undefined;
    const checked = readBrowserBackup(sourceFile);
    if (expectedSourceHash && checked.sourceHash !== expectedSourceHash)
        fail("SOURCE_CHANGED", "Selected backup differs from the inspected source");
    const d = destination(value);
    const source = path.join(
        fs.realpathSync(path.dirname(sourceFile)),
        path.basename(sourceFile),
    );
    if (source === d.root || source.startsWith(d.root + path.sep))
        fail("UNSAFE_PATH", "Source must be outside the destination");
    let ctx = operationFor(value);
    if (ctx) {
        if (ctx.op.sourceHash !== checked.sourceHash)
            fail(
                "IMPORT_CONFLICT",
                "This target already accepted a different backup",
            );
        return execute(ctx);
    }
    if (stat(d.root, true)) {
        directory(d.root);
        if (fs.readdirSync(d.root).length)
            fail("DESTINATION_EXISTS", "Import only creates a new empty library");
    }
    const importId = randomUUID(),
        work = path.join(d.parent, `.nova-browser-import-${importId}`);
    mkdir(work);
    write(path.join(work, "source.json"), checked.raw);
    const op = {
        format: "nova-browser-import",
        schemaVersion: VERSION,
        mappingVersion: VERSION,
        importId,
        sourceHash: checked.sourceHash,
        destinationName: d.name,
        parentIdentity: identity(stat(d.parent)),
        workIdentity: identity(stat(work)),
        sourceBytes: checked.raw.length,
    };
    write(path.join(work, "operation.json"), json(op));
    hook("beforeReservation", {importId});
    const r = {
        format: "nova-browser-import-reservation",
        schemaVersion: VERSION,
        importId,
        destinationName: d.name,
        sourceHash: checked.sourceHash,
    };
    try {
        publish(d.reservation, json(r));
    } catch (e) {
        if (!["IMPORT_CONFLICT", "EEXIST"].includes(e.code)) throw e;
        ctx = operationFor(value);
        if (ctx.op.sourceHash !== checked.sourceHash)
            fail("IMPORT_CONFLICT", "A different backup won this target reservation");
        return execute(ctx);
    }
    hook("afterReservation", {importId});
    return execute(operationFor(value, importId));
}
