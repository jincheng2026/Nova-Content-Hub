import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {makeBackup} from "./fixture.mjs";
import {sourceReferences} from "../inspect.mjs";
import {resolveResources} from "../resources.mjs";
import {
    importBrowserBackup,
    getBrowserImport,
    resumeBrowserImport,
} from "../index.mjs";
import {openLibrary} from "../../file-library/index.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");

function fingerprint(value) {
    let a = 2166136261,
        b = 3339675911;
    for (let i = 0; i < value.length; i++) {
        a = Math.imul(a ^ value.charCodeAt(i), 16777619);
        b = Math.imul(b ^ value.charCodeAt(i), 2246822507);
    }
    return `${value.length}:${(a >>> 0).toString(16).padStart(8, "0")}:${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function parent(t) {
    const p = fs.mkdtempSync(
        path.join(fs.realpathSync(os.tmpdir()), "nova-import-resources-"),
    );
    t.after(() => fs.rmSync(p, {recursive: true, force: true}));
    return p;
}

test("nonbuiltin historical weak fingerprints bind only unique known originals then decode actual full bytes", async (t) => {
    const {state, red, blue} = await makeBackup(),
        work = parent(t);
    state.data.TEMPLATES[0].history[0].definition = {};
    state.data.TEMPLATES[0].history[0].sources = [
        {id: "source-a", key: fingerprint(red)},
        {id: "source-b", key: fingerprint(blue)},
        {id: "missing", key: "123:11111111:22222222"},
    ];
    const refs = sourceReferences(state).filter((r) =>
        r.key.includes("/history/0/source/"),
    );
    assert.equal(refs[0].source, red);
    assert.equal(refs[1].source, blue);
    assert.equal(refs[2].source, null);
    let calls = 0;
    const results = await resolveResources(state, {
        work,
        sha,
        json: (v) => Buffer.from(JSON.stringify(v) + "\n"),
        hook: (phase) => {
            if (phase === "beforeRasterDecode") calls++;
        },
    });
    assert.equal(calls, 2);
    assert.ok(results.find((r) => r.key.endsWith("source/source-a")).decoded);
    assert.ok(results.find((r) => r.key.endsWith("source/source-b")).decoded);
    assert.equal(
        results.find((r) => r.key.endsWith("source/missing")).status,
        "unavailable",
    );
});

test("malformed raster bytes remain unavailable photo and preserved raw resource, never a substituted first frame", async (t) => {
    const {state} = await makeBackup(),
        p = parent(t),
        bad = Buffer.from("not a PNG");
    state.data.ACCOUNT.photos = [
        {
            id: "bad",
            name: "bad.png",
            img: "data:image/png;base64," + bad.toString("base64"),
            use: true,
        },
    ];
    state.data.ACCOUNT.avatar = "";
    state.data.PROJECTS = [];
    state.data.TEMPLATES = [];
    state.data.PROMPTS = [];
    state.data.TASKS = [];
    state.trash = [];
    const file = path.join(p, "source.json"),
        destination = path.join(p, "library");
    fs.writeFileSync(file, JSON.stringify(state));
    const result = await importBrowserBackup(file, destination),
        lib = openLibrary(destination),
        photo = lib.listPhotos()[0];
    assert.equal(photo.availability, "unavailable");
    assert.equal(photo.assetHash, null);
    assert.equal(
        lib.readLibrarySettings().defaultIssues[0].reason,
        "unavailable",
    );
    assert.deepEqual(
        fs.readFileSync(
            path.join(
                destination,
                "系统（别动）",
                "导入",
                result.importId,
                "不可用资源",
                sha(bad),
            ),
        ),
        bad,
    );
});

test("missing decoder blocks accepted import; resume uses archived source after capability returns", async (t) => {
    const {state} = await makeBackup(),
        p = parent(t);
    state.data.PROJECTS = [];
    state.data.TEMPLATES = [];
    state.data.PROMPTS = [];
    state.data.TASKS = [];
    state.trash = [];
    const file = path.join(p, "source.json"),
        destination = path.join(p, "library"),
        loader = path.join(p, "missing-sharp.mjs");
    fs.writeFileSync(file, JSON.stringify(state));
    fs.writeFileSync(
        loader,
        "export async function resolve(specifier,context,next){if(specifier==='sharp')throw Error('decoder absent');return next(specifier,context)}",
    );
    const moduleURL = new URL("../index.mjs", import.meta.url).href;
    const child = spawnSync(
        process.execPath,
        [
            "--experimental-loader",
            loader,
            "--input-type=module",
            "-e",
            `import{importBrowserBackup}from ${JSON.stringify(moduleURL)};try{await importBrowserBackup(process.env.SOURCE,process.env.DEST);process.exitCode=9}catch(e){console.log(e.code);}`,
        ],
        {
            env: {...process.env, SOURCE: file, DEST: destination},
            encoding: "utf8",
            timeout: 10000,
        },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /DECODER_UNAVAILABLE/);
    const status = getBrowserImport(destination);
    assert.equal(status.status, "blocked");
    assert.ok(status.issues.some((x) => x.code === "DECODER_UNAVAILABLE"));
    fs.unlinkSync(file);
    assert.equal(
        (await resumeBrowserImport(destination, status.importId)).status,
        "committed",
    );
    assert.equal(
        openLibrary(destination).listPhotos()[0].availability,
        "available",
    );
});

test('persisted resource metadata rejects path hashes and future fields before any source lookup', async t => {
    const {state} = await makeBackup(), work = parent(t), ctx = {
        work, sha, json: v => Buffer.from(JSON.stringify(v) + '\n'), hook: () => {
        }
    };
    await resolveResources(state, ctx);
    const file = path.join(work, 'resources.json'), original = JSON.parse(fs.readFileSync(file));
    for (const alter of [rows => rows[0].assetHash = '../../external-file', rows => rows[0].execute = 'never', rows => rows[0].schemaVersion = 999]) {
        const rows = structuredClone(original);
        alter(rows);
        fs.writeFileSync(file, JSON.stringify(rows));
        await assert.rejects(() => resolveResources(state, ctx), e => e.code === 'CORRUPT_IMPORT');
    }
});
