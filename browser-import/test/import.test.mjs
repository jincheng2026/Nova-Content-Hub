import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { makeBackup } from "./fixture.mjs";
import {
  inspectBrowserBackup,
  importBrowserBackup,
  getBrowserImport,
  resumeBrowserImport,
  __testing,
} from "../index.mjs";
import {
  openLibrary,
  backupLibrary,
  restoreBackup,
} from "../../file-library/index.mjs";
process.env.NODE_ENV = "test";
const moduleURL = new URL("../index.mjs", import.meta.url).href,
  sha = (b) => createHash("sha256").update(b).digest("hex");
const fail = (code, fn) => assert.rejects(fn, (e) => e.code === code);
async function fixture(t, full = false) {
  const parent = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "nova-browser-import-"),
    ),
    { state, red, blue } = await makeBackup();
  t.after(() => {
    __testing.setHook(undefined);
    fs.rmSync(parent, { recursive: true, force: true });
  });
  if (!full) {
    state.data.ACCOUNT.photos = [];
    state.data.ACCOUNT.avatar = "";
    state.data.ACCOUNT.marks = [];
    state.data.TEMPLATES = [];
    state.data.PROMPTS = [];
    state.data.TASKS = [];
    state.data.CUSTOM_SIZES = [];
    state.data.PROJECTS = [
      {
        ...state.data.PROJECTS[0],
        tpl: "",
        materials: [],
        files: [],
        channels: ["抖音"],
        posts: [{ ...state.data.PROJECTS[0].posts[0], mat: "", pub: null }],
      },
    ];
    state.trash = [];
    state.data.CHANNELS = { 抖音: state.data.CHANNELS.抖音 };
  }
  const source = path.join(parent, "source.json"),
    destination = path.join(parent, "library");
  fs.writeFileSync(source, JSON.stringify(state));
  return { parent, source, destination, state, red, blue };
}
function child(f, phase, stepKey) {
  const r = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import{importBrowserBackup,__testing}from ${JSON.stringify(moduleURL)};__testing.setHook(e=>{if(e.phase===process.env.PHASE&&(!process.env.STEP||e.stepKey===process.env.STEP))process.kill(process.pid,'SIGKILL');});await importBrowserBackup(process.env.SOURCE,process.env.DESTINATION);`,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        SOURCE: f.source,
        DESTINATION: f.destination,
        PHASE: phase,
        STEP: stepKey || "",
      },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(r.signal, "SIGKILL", r.stderr);
}
function evidence(root, id, name) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "系统（别动）", "导入", id, name)),
  );
}

test("expected source hash binds the actual read before any target reservation", async (t) => {
  const f = await fixture(t),
    original = fs.readFileSync(f.source),
    preview = inspectBrowserBackup(f.source);
  f.state.data.PROJECTS[0].name = "合法但已更换的备份";
  fs.writeFileSync(f.source, JSON.stringify(f.state));
  assert.notEqual(
    inspectBrowserBackup(f.source).source.sha256,
    preview.source.sha256,
  );
  const before = fs.readdirSync(f.parent);
  await fail("SOURCE_CHANGED", () =>
    importBrowserBackup(f.source, f.destination, {
      expectedSourceHash: preview.source.sha256,
    }),
  );
  assert.deepEqual(fs.readdirSync(f.parent), before);
  assert.equal(fs.existsSync(f.destination), false);
  assert.equal(getBrowserImport(f.destination), null);
  fs.writeFileSync(f.source, original);
  const result = await importBrowserBackup(f.source, f.destination, {
    expectedSourceHash: preview.source.sha256.toUpperCase(),
  });
  assert.equal(result.status, "committed");
  assert.equal(result.sourceHash, preview.source.sha256);
  assert.equal(
    (await importBrowserBackup(f.source, f.destination)).importId,
    result.importId,
  );
});

test("import options reject unknown keys and malformed expected hashes without reserving", async (t) => {
  const f = await fixture(t),
    before = fs.readdirSync(f.parent);
  for (const options of [
    null,
    [],
    "hash",
    { unknown: true },
    { [Symbol("unknown")]: true },
    { expectedSourceHash: "a".repeat(64), unknown: true },
    { expectedSourceHash: "a".repeat(63) },
    { expectedSourceHash: "g".repeat(64) },
    { expectedSourceHash: 123 },
    { expectedSourceHash: undefined },
  ]) {
    await fail("INVALID_INPUT", () =>
      importBrowserBackup(f.source, f.destination, options),
    );
    assert.deepEqual(fs.readdirSync(f.parent), before);
    assert.equal(getBrowserImport(f.destination), null);
  }
});

test("full migration exposes every real business object and scoped historical evidence, then survives backup/restore", async (t) => {
  const f = await fixture(t, true),
    raw = fs.readFileSync(f.source),
    result = await importBrowserBackup(f.source, f.destination);
  assert.equal(result.status, "committed");
  const lib = openLibrary(f.destination),
    map = evidence(f.destination, result.importId, "映射.json").objects,
    report = evidence(f.destination, result.importId, "报告.json");
  assert.deepEqual(
    fs.readFileSync(
      path.join(
        f.destination,
        "系统（别动）",
        "导入",
        result.importId,
        "原始备份.json",
      ),
    ),
    raw,
  );
  assert.deepEqual(report.counts.contents, { active: 2, trash: 1 });
  assert.deepEqual(report.counts.collections, { active: 1, trash: 0 });
  assert.deepEqual(report.counts.materials, { active: 4, trash: 4 });
  assert.equal(lib.listPhotoTrash()[0].availability, "unavailable");
  assert.equal(lib.listPhotoTrash()[0].assetHash, null);
  assert.equal(lib.listPrompts()[0].enabled, false);
  assert.equal(lib.listPromptTrash()[0].enabled, false);
  assert.equal(lib.readLibrarySettings().profile.marks.length, 2);
  assert.equal(
    lib.readLibrarySettings().defaultIssues[0].reason,
    "ownership-revoked",
  );
  const first = lib.readContent(map["project/first"].id),
    second = lib.readContent(map["project/second"].id),
    trashed = lib.readContent(map["trash/recycled-content"].id);
  assert.notEqual(first.id, trashed.id);
  assert.equal(first.body, "");
  assert.equal(first.recordedDate, "2026-10-01");
  assert.equal(first.plannedDate, "2026-10-18");
  assert.equal(first.coverJobs.length, 0);
  assert.equal(first.plans[0].text, "当前渠道文案");
  assert.deepEqual(first.plans[0].schedule, {
    precision: "date",
    date: "2026-10-18",
  });
  assert.deepEqual(first.plans[1].schedule, {
    precision: "local-minute",
    date: "2026-10-19",
    time: "19:00",
    timezone: null,
  });
  assert.equal(first.plans[1].text, "");
  const current = first.candidates.find(
      (c) => c.id === first.coverVariants[0].selectedCandidateId,
    ),
    published = lib.readPublication(first.id, first.publications[0].id);
  assert.notEqual(current.assetHash, published.cover.assetHash);
  assert.notEqual(current.id, published.cover.candidateId);
  assert.equal(published.body, null);
  assert.deepEqual(published.publicationText, {
    status: "unknown",
    text: null,
  });
  assert.equal(second.candidates[0].assetHash, published.cover.assetHash);
  assert.notEqual(second.candidates[0].id, published.cover.candidateId);
  assert.deepEqual(lib.readCollection(map["project/collection"].id).memberIds, [
    first.id,
    second.id,
  ]);
  const template = lib.readTemplate(map["template/template"].id);
  assert.equal(template.definition.sourceVersion, 2);
  assert.ok(template.definition.importMissingReferences.length);
  assert.equal(template.versions.length, 4);
  assert.equal(
    lib.readTemplate(template.id, 1).definition.legacyHistory.version,
    1,
  );
  assert.equal(first.materials.filter((x) => x.deletedAt).length, 1);
  assert.equal(
    first.unavailableReferences.filter(
      (x) => x.kind === "material" && x.deletedAt,
    ).length,
    1,
  );
  const again = await importBrowserBackup(f.source, f.destination);
  assert.equal(again.importId, result.importId);
  assert.equal(getBrowserImport(f.destination).status, "committed");
  const backup = path.join(f.parent, "backup"),
    restored = path.join(f.parent, "restored");
  backupLibrary(f.destination, backup);
  restoreBackup(backup, restored);
  const restoredLib = openLibrary(restored);
  assert.equal(restoredLib.readContent(first.id).title, first.title);
  assert.deepEqual(
    evidence(restored, result.importId, "映射.json"),
    evidence(f.destination, result.importId, "映射.json"),
  );
});

for (const phase of [
  "afterReservation",
  "beforeStageBinding",
  "afterStageBinding",
  "beforeStepIntent",
  "afterStepIntent",
  "afterCrud",
  "beforeStepResult",
  "afterReady",
  "beforeTargetBinding",
  "afterTargetBinding",
  "afterInstallFile",
  "beforeDescriptor",
  "afterDescriptor",
  "beforeCommitted",
])
  test(`SIGKILL ${phase}: resumes same import and exact IDs without requiring original source`, async (t) => {
    const f = await fixture(t);
    child(f, phase);
    const status = getBrowserImport(f.destination);
    assert.ok(status);
    fs.renameSync(f.source, path.join(f.parent, "moved.json"));
    const result = await resumeBrowserImport(f.destination, status.importId);
    assert.equal(result.status, "committed");
    assert.equal(result.importId, status.importId);
    const lib = openLibrary(f.destination);
    assert.equal(lib.listContents().length, 1);
    assert.equal(lib.listContents()[0].plans.length, 1);
    assert.equal(lib.listContents()[0].publications.length, 0);
    const map = evidence(f.destination, result.importId, "映射.json");
    assert.equal(map.objects["project/first"].id, lib.listContents()[0].id);
    assert.equal(
      (await resumeBrowserImport(f.destination, status.importId)).importId,
      status.importId,
    );
  });

test("descriptor commit with lost response remains committed after normal content edits and stage no longer needed", async (t) => {
  const f = await fixture(t);
  child(f, "afterDescriptor");
  const status = getBrowserImport(f.destination);
  assert.equal(status.status, "committed");
  let lib = openLibrary(f.destination),
    content = lib.listContents()[0];
  content = lib.updateContent(
    content.id,
    { body: "normal later edit" },
    content.editToken,
  );
  fs.unlinkSync(f.source);
  const result = await resumeBrowserImport(f.destination, status.importId);
  assert.equal(result.status, "committed");
  assert.equal(
    openLibrary(f.destination).readContent(content.id).body,
    "normal later edit",
  );
  assert.equal(getBrowserImport(f.destination).status, "committed");
});

test("same target parallel starts share one importId; a different raw backup conflicts", async (t) => {
  const f = await fixture(t);
  const run = () =>
    new Promise((resolve, reject) => {
      let stdout = "",
        stderr = "";
      const p = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import{importBrowserBackup,getBrowserImport,resumeBrowserImport}from ${JSON.stringify(moduleURL)};for(let n=0;n<100;n++){try{const r=await importBrowserBackup(process.env.SOURCE,process.env.DESTINATION);console.log(JSON.stringify(r));break;}catch(e){if(!['BUSY','LOCK_UNCERTAIN'].includes(e.code))throw e;await new Promise(r=>setTimeout(r,20));}}`,
        ],
        {
          env: { ...process.env, SOURCE: f.source, DESTINATION: f.destination },
        },
      );
      p.stdout.on("data", (b) => (stdout += b));
      p.stderr.on("data", (b) => (stderr += b));
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0 ? resolve(JSON.parse(stdout)) : reject(Error(stderr)),
      );
    });
  const [a, b] = await Promise.all([run(), run()]);
  assert.equal(a.importId, b.importId);
  assert.equal(openLibrary(f.destination).listContents().length, 1);
  f.state.data.ACCOUNT.intro = "different";
  fs.writeFileSync(f.source, JSON.stringify(f.state));
  await fail("IMPORT_CONFLICT", () =>
    importBrowserBackup(f.source, f.destination),
  );
});

test("bound target replacement and changed installed files stop without overwriting external bytes", async (t) => {
  const f = await fixture(t);
  child(f, "afterTargetBinding");
  const status = getBrowserImport(f.destination);
  fs.renameSync(f.destination, path.join(f.parent, "original-target"));
  fs.mkdirSync(f.destination);
  await fail("TARGET_CHANGED", () =>
    resumeBrowserImport(f.destination, status.importId),
  );
  assert.deepEqual(fs.readdirSync(f.destination), []);
});

test("foreign nonempty targets, portable aliases, unknown operation format and symlinks are refused", async (t) => {
  const f = await fixture(t);
  fs.mkdirSync(f.destination);
  fs.writeFileSync(path.join(f.destination, "keep"), "untouched");
  await fail("DESTINATION_EXISTS", () =>
    importBrowserBackup(f.source, f.destination),
  );
  assert.equal(
    fs.readFileSync(path.join(f.destination, "keep"), "utf8"),
    "untouched",
  );
  for (const name of ["CON", "x.", "x ", "bad:name"])
    await fail("UNSAFE_PATH", () =>
      importBrowserBackup(f.source, path.join(f.parent, name)),
    );
  const link = path.join(f.parent, "link");
  fs.symlinkSync(f.destination, link);
  await fail("UNSAFE_PATH", () => importBrowserBackup(f.source, link));
});

test("failure after CRUD reuses committed mutation and mismatch stops instead of changing its expected token", async (t) => {
  const f = await fixture(t);
  __testing.setHook((e) => {
    if (e.phase === "afterCrud")
      throw Object.assign(Error("disk full"), { code: "ENOSPC" });
  });
  let failure;
  try {
    await importBrowserBackup(f.source, f.destination);
  } catch (e) {
    failure = e;
  }
  __testing.setHook(undefined);
  assert.equal(failure.code, "ENOSPC");
  assert.ok(failure.importId);
  assert.equal(getBrowserImport(f.destination).status, "blocked");
  const resumed = await resumeBrowserImport(f.destination, failure.importId);
  assert.equal(resumed.status, "committed");
  assert.equal(openLibrary(f.destination).listContents().length, 1);
});

test("EIO before descriptor publication resumes only its exact known temporary; divergent temporary is preserved", async (t) => {
  const f = await fixture(t);
  __testing.setHook((e) => {
    if (e.phase === "beforeDescriptor")
      throw Object.assign(Error("sync interrupted"), { code: "EIO" });
  });
  let failure;
  try {
    await importBrowserBackup(f.source, f.destination);
  } catch (e) {
    failure = e;
  }
  __testing.setHook(undefined);
  assert.equal(failure.code, "EIO");
  const temp = fs
    .readdirSync(f.destination)
    .find((n) => n.startsWith(".nch-import-"));
  assert.ok(temp);
  const original = fs.readFileSync(path.join(f.destination, temp));
  assert.ok(original.includes(Buffer.from("nova-content-library")));
  assert.equal(
    (await resumeBrowserImport(f.destination, failure.importId)).status,
    "committed",
  );
  const g = await fixture(t);
  child(g, "beforeDescriptor");
  const status = getBrowserImport(g.destination),
    name = fs
      .readdirSync(g.destination)
      .find((n) => n.startsWith(".nch-import-"));
  fs.writeFileSync(path.join(g.destination, name), "external bytes");
  await fail("TARGET_CHANGED", () =>
    resumeBrowserImport(g.destination, status.importId),
  );
  assert.equal(
    fs.readFileSync(path.join(g.destination, name), "utf8"),
    "external bytes",
  );
  assert.equal(fs.existsSync(path.join(g.destination, "内容库.json")), false);
});

test("a one-off storage unlink EIO blocks resource processing, then resume imports the original photo as available", async (t) => {
  const f = await fixture(t);
  f.state.data.ACCOUNT.photos = [
    { id: "photo", name: "me.png", img: f.red, use: true },
  ];
  fs.writeFileSync(f.source, JSON.stringify(f.state));
  const original = fs.unlinkSync;
  let injected = false,
    failure;
  fs.unlinkSync = function (file, ...args) {
    if (
      !injected &&
      String(file).includes("pinned-resources") &&
      path.basename(String(file)).startsWith(".publish-")
    ) {
      injected = true;
      throw Object.assign(Error("disk I/O failure"), { code: "EIO" });
    }
    return original.call(this, file, ...args);
  };
  try {
    await importBrowserBackup(f.source, f.destination);
  } catch (e) {
    failure = e;
  } finally {
    fs.unlinkSync = original;
  }
  assert.equal(failure.code, "EIO");
  assert.equal(getBrowserImport(f.destination).status, "blocked");
  assert.equal(fs.existsSync(path.join(f.destination, "内容库.json")), false);
  await resumeBrowserImport(f.destination, failure.importId);
  const lib = openLibrary(f.destination),
    photo = lib.listPhotos()[0];
  assert.equal(photo.availability, "available");
  assert.equal(photo.isOwnPhoto, false);
  assert.deepEqual(
    lib.readAsset(photo.assetHash).data,
    Buffer.from(f.red.split(",")[1], "base64"),
  );
});

test("same actual raster hash is decoded once per resource batch across roles; srcPath is inert", async (t) => {
  const f = await fixture(t, true);
  let calls = 0;
  const hashes = new Set();
  __testing.setHook((e) => {
    if (e.phase === "beforeRasterDecode") {
      calls++;
      hashes.add(e.assetHash);
    }
  });
  const result = await importBrowserBackup(f.source, f.destination);
  __testing.setHook(undefined);
  assert.equal(calls, 2);
  assert.equal(hashes.size, 2);
  assert.equal(result.status, "committed");
});
