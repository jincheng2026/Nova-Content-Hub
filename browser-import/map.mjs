import path from "node:path";
import Core from "../原型/core.js";
import {resolveResources, pinnedResource} from "./resources.mjs";
import {read, parse, publish} from "./operation.mjs";

const FORMATS = {竖版: "3:4", 方图: "1:1", 头图: "47:20", 横版: "8:5"};
const date = (value) => (value ? Core.date(value) : null);
const schedule = (day, time = "") =>
    time
        ? {precision: "local-minute", date: date(day), time, timezone: null}
        : {precision: "date", date: date(day)};
const source = (key) => ({source: "browser-backup", originalId: key});
const error = (code, message) => {
    throw Object.assign(Error(message), {code});
};
const added = (before, after, field) => {
    const old = new Set((before[field] || []).map((x) => x.id)),
        items = after[field].filter((x) => !old.has(x.id));
    if (items.length !== 1)
        error(
            "MIGRATION_MISMATCH",
            "Append step did not produce exactly one new record",
        );
    return items[0];
};
const ratio = (value) => Core.ratio(value) || null;

export async function mapBrowserState(state, ctx) {
    const resources = await resolveResources(state, ctx),
        resource = new Map(resources.map((r) => [r.key, r])),
        mapping = {},
        issues = [],
        owners = new Map(),
        templates = new Map(),
        photos = new Map(),
        channels = new Map(),
        variants = new Map(),
        candidates = new Map(),
        byNumber = new Map(),
        trash = [];
    const record = (key, kind, id, extra = {}) =>
        (mapping[key] = {kind, id, ...extra});
    const photoSource = (p, key) => source(key);
    const step = ctx.step;
    let settings = ctx.initialSettings();
    const changeSettings = async (key, method, input) =>
        (settings = await step(key, method, [input, settings.editToken]));
    const ownersInput = (key, kind, input) =>
        step(
            `${key}/create`,
            kind === "content" ? "createContent" : "createCollection",
            [input],
        );
    const changeOwner = async (key, suffix, method, input) => {
        const owner = owners.get(key);
        const next = await step(`${key}/${suffix}`, method, [
            owner.id,
            input,
            owner.editToken,
        ]);
        owners.set(key, next);
        return next;
    };
    const namedOwner = async (key, suffix, method, ...args) => {
        const owner = owners.get(key),
            next = await step(`${key}/${suffix}`, method, [
                owner.id,
                ...args,
                owner.editToken,
            ]);
        owners.set(key, next);
        return next;
    };

    function asset(key, purpose) {
        const row = resource.get(key);
        try {
            return pinnedResource(
                ctx,
                row,
                row?.detectedType === "image/svg+xml" ? "template-structure" : purpose,
            );
        } catch (e) {
            if (
                ["CORRUPT", "CORRUPT_IMPORT", "UNSAFE_PATH", "IO_ERROR"].includes(
                    e.code,
                )
            )
                throw e;
            error(
                "MIGRATION_RESOURCE_ERROR",
                `Validated resource cannot be registered: ${key}`,
            );
        }
    }

    function resourcesFor(prefix) {
        const result = {},
            missing = [];
        for (const row of resources.filter((r) => r.key.startsWith(prefix + "/"))) {
            if (row.status !== "available") {
                missing.push({key: row.key, role: row.role, reason: row.code});
                continue;
            }
            const imported = asset(
                row.key,
                row.detectedType === "image/svg+xml"
                    ? "template-structure"
                    : "template-reference",
            );
            if (!imported) continue;
            result[row.key] = {
                assetHash: imported.assetHash,
                bytes: imported.bytes,
                detectedType: imported.detectedType,
                role: row.detectedType === "image/svg+xml" ? "structure" : "style",
            };
        }
        return {result, missing};
    }

    // Imported packages have new library versions; source version/evidence remain explicit inside each definition.
    for (const original of state.data.TEMPLATES) {
        const key = `template/${original.id}`,
            history = original.history || [];
        let target;
        const versions = [
            ...history.map((h, i) => ({
                definition: {
                    ...h.definition,
                    legacyHistory: h,
                    importSource: source(`${key}/history/${i}`),
                    sourceVersion: h.version,
                },
                prefix: `${key}/history/${i}`,
            })),
            {
                definition: {
                    ...original,
                    importSource: source(key),
                    sourceVersion: original.version,
                },
                prefix: key,
                current: true,
            },
        ];
        const versionMap = [];
        for (const [i, v] of versions.entries()) {
            let prepared = resourcesFor(v.prefix);
            if (v.current) {
                prepared = resourcesFor(key);
                for (const resourceKey of Object.keys(prepared.result))
                    if (resourceKey.startsWith(`${key}/history/`))
                        delete prepared.result[resourceKey];
                prepared.missing = prepared.missing.filter(
                    (r) => !r.key.startsWith(`${key}/history/`),
                );
            }
            const definition = {
                ...v.definition,
                importMissingReferences: prepared.missing,
                importedAsNewPackage: true,
            };
            target =
                i === 0
                    ? await step(`${key}/version/${i}`, "createTemplate", [
                        {name: original.name, definition, resources: prepared.result},
                    ])
                    : await step(`${key}/version/${i}`, "addTemplateVersion", [
                        target.id,
                        {version: i + 1, definition, resources: prepared.result},
                        target.editToken,
                    ]);
            versionMap.push({
                sourceVersion: v.definition.sourceVersion,
                version: i + 1,
                current: !!v.current,
            });
        }
        templates.set(original.id, target);
        record(key, "template", target.id, {versions: versionMap});
    }
    const allPhotos = [
        ...state.data.ACCOUNT.photos.map((p) => ({p, key: `photo/${p.id}`})),
        ...state.trash
            .filter((t) => t.kind === "photo")
            .map((t) => ({p: t.value, key: `trash/${t.id}`, trashed: true})),
    ];
    for (const {p, key, trashed} of allPhotos) {
        let target = await step(`${key}/create`, "createUnavailablePhoto", [
            {
                title: p.name || "未命名照片",
                originalName: p.name,
                isOwnPhoto: false,
                source: photoSource(p, key),
                reason:
                    resource.get(key)?.code || "Imported bytes require full validation",
            },
        ]);
        const a = asset(key, "photo");
        if (a)
            target = await step(`${key}/resolve`, "resolvePhoto", [
                target.id,
                {assetHash: a.assetHash},
                target.editToken,
            ]);
        photos.set(key, target);
        record(key, "photo", target.id);
        if (trashed) trash.push({key, kind: "photo", id: target.id});
        if (p.use)
            issues.push({
                code: "OWNERSHIP_CONFIRMATION_REQUIRED",
                key,
                defaultRequested: true,
            });
    }
    const allPrompts = [
        ...state.data.PROMPTS.map((p) => ({p, key: `prompt/${p.id}`})),
        ...state.trash
            .filter((t) => t.kind === "prompt")
            .map((t) => ({p: t.value, key: `trash/${t.id}`, trashed: true})),
    ];
    for (const {p, key, trashed} of allPrompts) {
        let target = await step(`${key}/create`, "createPrompt", [
            {
                title: p.title || "未命名提示词",
                body: p.body,
                when: p.when,
                summary: p.summary,
                category: p.cat,
                tags: [...new Set(p.tags.filter((t) => t.trim()))],
                provenance: {
                    source: "browser-backup",
                    originalId: p.id,
                    legacySource: p.source,
                    legacyFile: p.file,
                    mine: p.mine ?? null,
                },
                builtinKey: null,
            },
        ]);
        if (p.off)
            target = await step(`${key}/disable`, "setPromptEnabled", [
                target.id,
                false,
                target.editToken,
            ]);
        record(key, "prompt", target.id);
        if (trashed)
            trash.push({key, kind: "prompt", id: target.id, record: target});
    }
    const allProjects = [
        ...state.data.PROJECTS.map((p) => ({
            p,
            key: `project/${p.id}`,
            trashed: false,
        })),
        ...state.trash
            .filter((t) => t.kind === "project")
            .map((t) => ({p: t.value, key: `trash/${t.id}`, trashed: true})),
    ];
    const names = new Set([
        ...Object.keys(state.data.CHANNELS),
        ...allProjects.flatMap(({p}) => [
            ...p.channels,
            ...p.posts.map((p) => p.channel),
        ]),
    ]);
    for (const name of names) {
        const input = state.data.CHANNELS[name] || {
                ink: "#555555",
                bg: "#f0f0f0",
                need: "",
            },
            requiredRatio = FORMATS[input.need] || ratio(input.need);
        const existing = settings.channels.find(
            (c) => c.name === name && c.deletedAt === null,
        );
        let target;
        if (existing) {
            settings = await step(`channel/${name}/update`, "updateChannel", [
                existing.id,
                {name, ink: input.ink, bg: input.bg, requiredRatio},
                settings.editToken,
            ]);
            target = settings.channels.find((c) => c.id === existing.id);
        } else {
            const before = settings;
            settings = await changeSettings(
                `channel/${name}/create`,
                "createChannel",
                {name, ink: input.ink, bg: input.bg, requiredRatio},
            );
            target = added(before, settings, "channels");
        }
        channels.set(name, target.id);
        record(`channel/${name}`, "channel", target.id);
        if (!state.data.CHANNELS[name])
            issues.push({
                code: "CHANNEL_REFERENCE_NOT_REGISTERED",
                key: `channel/${name}`,
            });
    }
    const avatar = asset("profile/avatar", "photo");
    settings = await changeSettings("profile", "updateProfile", {
        name: state.data.ACCOUNT.name,
        intro: state.data.ACCOUNT.intro,
        avatarAssetHash: avatar?.assetHash ?? null,
        marks: state.data.ACCOUNT.marks.map((m) => ({key: m.k, value: m.v})),
    });
    settings = await changeSettings("prompt-categories", "setPromptCategories", [
        ...new Set(state.data.PCATS.filter((s) => s.trim())),
    ]);
    for (const [i, value] of state.data.CUSTOM_SIZES.entries())
        settings = await changeSettings(
            `custom-ratio/${i}`,
            "addCustomRatio",
            ratio(value),
        );
    for (const {p, key, trashed} of allProjects) {
        const kind = p.kind === "合集" ? "collection" : "content",
            input = {
                title: p.name,
                body: "",
                channelIds: [...new Set(p.channels.map((name) => channels.get(name)))],
                ...(kind === "content"
                    ? {
                        recordedDate: date(p.dates.record),
                        plannedDate: date(p.plan),
                        isExample: p.sample === true,
                        preferredTemplateId: templates.get(p.tpl)?.id ?? null,
                    }
                    : {
                        dateRange: {start: date(p.dates.from), end: date(p.dates.to)},
                    }),
            };
        const target = await ownersInput(key, kind, input);
        owners.set(key, target);
        record(key, kind, target.id);
        if (trashed) trash.push({key, kind, id: target.id});
    }

    async function attachment(ownerKey, key, f, trashed = false) {
        const owner = owners.get(ownerKey),
            kind = mapping[ownerKey].kind,
            prefix = kind === "content" ? "Content" : "Collection",
            a = asset(key, "material");
        let targetId;
        if (a) {
            const before = owner,
                next = await changeOwner(
                    ownerKey,
                    `${key}/attach`,
                    `attach${prefix}Material`,
                    {assetHash: a.assetHash, originalName: f.name, role: "material"},
                );
            targetId = added(before, next, "materials").id;
            if (trashed)
                await namedOwner(
                    ownerKey,
                    `${key}/trash`,
                    `trash${prefix}Material`,
                    targetId,
                );
        } else {
            const before = owners.get(ownerKey),
                next = await changeOwner(
                    ownerKey,
                    `${key}/unavailable`,
                    `add${prefix}UnavailableReference`,
                    {
                        kind: "material",
                        originalId: f.id,
                        originalName: f.name,
                        reason: resource.get(key)?.code || "Missing source bytes",
                        provenance: source(key),
                    },
                );
            targetId = added(before, next, "unavailableReferences").id;
            if (trashed)
                await namedOwner(
                    ownerKey,
                    `${key}/trash-reference`,
                    `trash${prefix}UnavailableReference`,
                    targetId,
                );
        }
        record(key, "material", targetId, {
            ownerId: owner.id,
            availability: a ? "available" : "unavailable",
            trashed,
        });
    }

    for (const {p, key} of allProjects) {
        const prefix = mapping[key].kind === "content" ? "Content" : "Collection";
        for (const f of p.files) await attachment(key, `${key}/file/${f.id}`, f);
        for (const m of p.materials) {
            const materialKey = `${key}/material/${m.id}`,
                before = owners.get(key);
            const next = await changeOwner(
                key,
                `${materialKey}/create`,
                `save${prefix}CoverVariant`,
                {
                    name: m.name,
                    ratio: ratio(m.ratio),
                    preferredTemplateId: templates.get(m.tpl)?.id ?? null,
                },
            );
            const variant = added(before, next, "coverVariants");
            variants.set(materialKey, variant.id);
            record(materialKey, "variant", variant.id, {ownerId: next.id});
            for (const b of m.batches)
                for (const c of b.cands) {
                    const candidateKey = `${materialKey}/candidate/${c.id}`,
                        before = owners.get(key),
                        a = asset(candidateKey, "generated-cover");
                    let targetId;
                    if (a) {
                        const next = await changeOwner(
                            key,
                            `${candidateKey}/create`,
                            `register${prefix}Candidate`,
                            {
                                assetHash: a.assetHash,
                                requestId: `browser-${ctx.importId}`,
                                attemptId: `source-${ctx.sha(Buffer.from(candidateKey))}`,
                                template: null,
                                source: "browser-backup",
                                originalName: c.no,
                            },
                        );
                        targetId = added(before, next, "candidates").id;
                        await namedOwner(
                            key,
                            `${candidateKey}/metadata`,
                            `update${prefix}Candidate`,
                            targetId,
                            {
                                variantId: variant.id,
                                favorite: c.fav,
                                displayNumber: c.no,
                                note: c.from || "",
                                provenance: source(candidateKey),
                            },
                        );
                    } else {
                        const next = await changeOwner(
                            key,
                            `${candidateKey}/unavailable`,
                            `add${prefix}UnavailableReference`,
                            {
                                kind: "candidate",
                                originalId: c.id,
                                originalName: c.no,
                                reason:
                                    resource.get(candidateKey)?.code || "Missing candidate bytes",
                                provenance: source(candidateKey),
                            },
                        );
                        targetId = added(before, next, "unavailableReferences").id;
                    }
                    record(candidateKey, "candidate", targetId, {
                        ownerId: before.id,
                        availability: a ? "available" : "unavailable",
                    });
                    candidates.set(candidateKey, {
                        id: targetId,
                        hash: a?.assetHash ?? null,
                        batchNo: b.no,
                    });
                    byNumber.set(`${key}/material/${m.id}/number/${c.no}`, targetId);
                    if (c.use) {
                        if (a)
                            await namedOwner(
                                key,
                                `${candidateKey}/select`,
                                prefix === "Content"
                                    ? "selectVariantCover"
                                    : "selectCollectionVariantCover",
                                variant.id,
                                targetId,
                            );
                        else
                            await changeOwner(
                                key,
                                `${candidateKey}/select-unavailable`,
                                `save${prefix}CoverVariant`,
                                {
                                    id: variant.id,
                                    name: m.name,
                                    ratio: ratio(m.ratio),
                                    selectedCandidateId: targetId,
                                },
                            );
                    }
                }
        }
    }
    for (const {p, key} of allProjects) {
        const prefix = mapping[key].kind === "content" ? "Content" : "Collection";
        for (const m of p.materials)
            for (const b of m.batches) {
                const candidateIds = b.cands.map(
                        (c) => mapping[`${key}/material/${m.id}/candidate/${c.id}`].id,
                    ),
                    referenceCandidateIds = [];
                for (const reference of b.ref || []) {
                    const target = byNumber.get(
                        `${key}/material/${reference.m}/number/${reference.no}`,
                    );
                    if (target) referenceCandidateIds.push(target);
                    else
                        issues.push({
                            code: "LEGACY_REFERENCE_UNKNOWN",
                            key: `${key}/material/${m.id}/batch/${b.no}`,
                        });
                }
                const before = owners.get(key),
                    next = await changeOwner(
                        key,
                        `material/${m.id}/batch/${b.no}`,
                        `save${prefix}ImportedCoverBatch`,
                        {
                            displayNumber: String(b.no),
                            date: date(b.at),
                            templateGroupId: b.tpl,
                            candidateIds,
                            referenceCandidateIds: [...new Set(referenceCandidateIds)],
                            originalStatus: b.state,
                            provenance: source(`${key}/material/${m.id}/batch/${b.no}`),
                        },
                    );
                record(
                    `${key}/material/${m.id}/batch/${b.no}`,
                    "imported-batch",
                    added(before, next, "importedCoverBatches").id,
                    {ownerId: next.id},
                );
            }
    }
    const matchingOwner = (oldId) => {
        const active = allProjects.filter((x) => !x.trashed && x.p.id === oldId);
        if (active.length === 1) return active[0].key;
        const rows = allProjects.filter((x) => x.p.id === oldId);
        if (rows.length !== 1)
            error(
                "IMPORT_RELATION_UNSUPPORTED",
                "Legacy owner reference is missing or ambiguous",
            );
        return rows[0].key;
    };
    for (const {p, key} of allProjects)
        if (p.kind === "合集") {
            const ids = p.members.map((oldId) => {
                const ownerKey = matchingOwner(oldId);
                if (mapping[ownerKey].kind !== "content")
                    error(
                        "IMPORT_RELATION_UNSUPPORTED",
                        "Collection member must be content",
                    );
                return mapping[ownerKey].id;
            });
            await changeOwner(key, "members", "setCollectionMembers", ids);
        }
    for (const item of state.trash.filter((t) => t.kind === "file"))
        await attachment(
            matchingOwner(item.pid),
            `trash/${item.id}`,
            item.value,
            true,
        );
    // Recycled shots remain accessible in immutable historical packages, never as an active sample.
    for (const original of state.data.TEMPLATES) {
        const recycled = state.trash.filter(
            (t) => t.kind === "shot" && t.tid === original.id,
        );
        if (!recycled.length) continue;
        let target = templates.get(original.id),
            current = ctx.library.readTemplate(target.id, target.currentVersion);
        for (const item of recycled) {
            const key = `trash/${item.id}`,
                a = asset(key, "template-reference"),
                resources = a
                    ? {
                        [key]: {
                            assetHash: a.assetHash,
                            bytes: a.bytes,
                            detectedType: a.detectedType,
                            role:
                                a.detectedType === "image/svg+xml" ? "structure" : "style",
                        },
                    }
                    : {};
            target = await step(`${key}/archive`, "addTemplateVersion", [
                target.id,
                {
                    version: target.currentVersion + 1,
                    definition: {
                        importSource: source(key),
                        legacyRecycledShot: true,
                        importMissingReferences: a
                            ? []
                            : [
                                {
                                    key,
                                    reason: resource.get(key)?.code || "Missing source bytes",
                                },
                            ],
                    },
                    resources,
                },
                target.editToken,
            ]);
            record(key, "template-shot", target.id, {
                version: target.currentVersion,
                availability: a ? "available" : "unavailable",
            });
        }
        target = await step(
            `template/${original.id}/after-recycled-current`,
            "addTemplateVersion",
            [
                target.id,
                {
                    version: target.currentVersion + 1,
                    definition: current.definition,
                    resources: current.resources,
                },
                target.editToken,
            ],
        );
        templates.set(original.id, target);
        mapping[`template/${original.id}`].versions.forEach(
            (v) => (v.current = false),
        );
        mapping[`template/${original.id}`].versions.push({
            sourceVersion: original.version,
            version: target.currentVersion,
            current: true,
            restoredAfterRecycledShots: true,
        });
    }
    for (const item of state.trash.filter((t) => t.kind === "shot"))
        if (!templates.has(item.tid))
            error(
                "IMPORT_RELATION_UNSUPPORTED",
                "Recycled shot references a missing template",
            );
    for (const {p, key} of allProjects) {
        const prefix = mapping[key].kind === "content" ? "Content" : "Collection";
        for (const post of p.posts) {
            const postKey = `${key}/post/${post.id}`,
                before = owners.get(key),
                choice = post.mat
                    ? {variantId: variants.get(`${key}/material/${post.mat}`)}
                    : null;
            if (choice && !choice.variantId)
                error("IMPORT_RELATION_UNSUPPORTED", "Plan variant is missing");
            const next = await changeOwner(
                key,
                `${postKey}/plan`,
                prefix === "Content"
                    ? "savePublicationPlan"
                    : "saveCollectionPublicationPlan",
                {
                    channelId: channels.get(post.channel),
                    text: post.text,
                    schedule: schedule(post.date, post.time),
                    coverChoice: choice,
                },
            );
            const plan = added(before, next, "plans");
            record(postKey, "plan", plan.id, {ownerId: next.id});
            if (post.pub) {
                let cover = null;
                const publishedKey = `${postKey}/published-cover`,
                    a = asset(publishedKey, "generated-cover");
                if (a) {
                    const matches = [...candidates.entries()].filter(
                        ([k, c]) =>
                            k.startsWith(`${key}/material/`) &&
                            c.hash === a.assetHash &&
                            c.batchNo === post.pub.snapshot.batch &&
                            k.endsWith(`/candidate/${post.pub.snapshot.candidateId}`),
                    );
                    const matching = matches.length === 1 ? matches[0] : null;
                    if (matching) {
                        cover = {candidateId: matching[1].id};
                        record(publishedKey, "candidate", matching[1].id, {
                            ownerId: next.id,
                            reused: true,
                        });
                    } else {
                        const previous = owners.get(key),
                            after = await changeOwner(
                                key,
                                `${publishedKey}/candidate`,
                                `register${prefix}Candidate`,
                                {
                                    assetHash: a.assetHash,
                                    requestId: `browser-${ctx.importId}`,
                                    attemptId: `published-${ctx.sha(Buffer.from(publishedKey))}`,
                                    template: null,
                                    source: "browser-published-snapshot",
                                },
                            );
                        const candidate = added(previous, after, "candidates");
                        cover = {candidateId: candidate.id};
                        record(publishedKey, "candidate", candidate.id, {
                            ownerId: after.id,
                            reused: false,
                        });
                    }
                }
                const previous = owners.get(key),
                    after = await changeOwner(
                        key,
                        `${postKey}/publication`,
                        prefix === "Content"
                            ? "recordHistoricalPublication"
                            : "recordHistoricalCollectionPublication",
                        {
                            planId: plan.id,
                            schedule: schedule(post.pub.at),
                            publicationText: null,
                            cover,
                            source: source(postKey),
                            channelName: post.channel,
                            url: post.pub.link || null,
                        },
                    );
                record(
                    `${postKey}/publication`,
                    "publication",
                    added(previous, after, "publications").id,
                    {ownerId: after.id},
                );
            }
        }
    }
    const requestedDefault = state.data.ACCOUNT.photos.find((p) => p.use);
    if (requestedDefault) {
        const photo = photos.get(`photo/${requestedDefault.id}`);
        settings = await changeSettings(
            "default-references",
            "restoreGenerationDefaultReferences",
            {
                photoId: photo.id,
                templateId: null,
                source: source(`photo/${requestedDefault.id}`),
            },
        );
    }
    for (const item of trash.sort(
        (a, b) =>
            (a.kind === "collection" ? 0 : a.kind === "content" ? 1 : 2) -
            (b.kind === "collection" ? 0 : b.kind === "content" ? 1 : 2),
    )) {
        const owner = owners.get(item.key) || photos.get(item.key) || item.record;
        if (!owner) error("MIGRATION_MISMATCH", "Trash target was not built");
        const method = {
            content: "trashContent",
            collection: "trashCollection",
            photo: "trashPhoto",
            prompt: "trashPrompt",
        }[item.kind];
        const next = await step(`${item.key}/trash`, method, [
            item.id,
            owner.editToken,
        ]);
        if (owners.has(item.key)) owners.set(item.key, next);
        if (photos.has(item.key)) photos.set(item.key, next);
    }
    ctx.verify();
    for (const row of resources) {
        if (row.status === "available") ctx.library.readAsset(row.assetHash);
        else if (row.assetHash)
            ctx.evidenceAsset(
                row.assetHash,
                read(path.join(ctx.work, "pinned-resources", row.assetHash)),
            );
    }
    for (const [key, owner] of owners)
        for (const publication of owner.publications)
            (mapping[key].kind === "content"
                ? ctx.library.readPublication
                : ctx.library.readCollectionPublication)(owner.id, publication.id);
    const counts = {
        contents: {
            active: ctx.library.listContents().length,
            trash: ctx.library.listTrash().length,
        },
        collections: {
            active: ctx.library.listCollections().length,
            trash: ctx.library.listCollectionTrash().length,
        },
        photos: {
            active: ctx.library.listPhotos().length,
            trash: ctx.library.listPhotoTrash().length,
        },
        prompts: {
            active: ctx.library.listPrompts().length,
            trash: ctx.library.listPromptTrash().length,
        },
        templates: ctx.library.listTemplates().length,
        plans: 0,
        publications: 0,
        materials: {active: 0, trash: 0},
        candidates: {available: 0, unavailable: 0},
        resources: {available: 0, unavailable: 0, unsupported: 0},
    };
    for (const r of resources) counts.resources[r.status]++;
    for (const [key, owner] of owners) {
        const actual =
            mapping[key].kind === "content"
                ? ctx.library.readContent(owner.id)
                : ctx.library.readCollection(owner.id);
        if (
            actual.body !== "" ||
            actual.plans.length !==
            allProjects.find((p) => p.key === key).p.posts.length ||
            actual.publications.length !==
            allProjects.find((p) => p.key === key).p.posts.filter((p) => p.pub)
                .length
        )
            error("MIGRATION_MISMATCH", "Content projection differs from source");
        counts.plans += actual.plans.length;
        counts.publications += actual.publications.length;
        for (const file of actual.materials)
            counts.materials[
                actual.deletedAt || file.deletedAt ? "trash" : "active"
                ]++;
        for (const ref of actual.unavailableReferences)
            if (ref.kind === "material")
                counts.materials[
                    actual.deletedAt || ref.deletedAt ? "trash" : "active"
                    ]++;
            else if (ref.kind === "candidate") counts.candidates.unavailable++;
        counts.candidates.available += actual.candidates.length;
    }
    for (const [kind, list, active, removed] of [
        [
            "content",
            allProjects.filter((x) => x.p.kind === "内容"),
            counts.contents.active,
            counts.contents.trash,
        ],
        [
            "collection",
            allProjects.filter((x) => x.p.kind === "合集"),
            counts.collections.active,
            counts.collections.trash,
        ],
        ["photo", allPhotos, counts.photos.active, counts.photos.trash],
        ["prompt", allPrompts, counts.prompts.active, counts.prompts.trash],
    ])
        if (
            active !== list.filter((x) => !x.trashed).length ||
            removed !== list.filter((x) => x.trashed).length
        )
            error("MIGRATION_MISMATCH", `${kind} count differs`);
    const expectedMaterials = {
        active: allProjects
            .filter((p) => !p.trashed)
            .reduce((n, {p}) => n + p.files.length, 0),
        trash:
            allProjects
                .filter((p) => p.trashed)
                .reduce((n, {p}) => n + p.files.length, 0) +
            state.trash.filter((t) => t.kind === "file").length,
    };
    if (
        counts.materials.active !== expectedMaterials.active ||
        counts.materials.trash !== expectedMaterials.trash
    )
        error("MIGRATION_MISMATCH", "Active/recycled material count differs");
    const idmap = {
        format: "nova-browser-import-map",
        schemaVersion: 1,
        mappingVersion: 1,
        importId: ctx.importId,
        sourceHash: ctx.sourceHash,
        objects: mapping,
    };
    const report = {
        format: "nova-browser-import-report",
        schemaVersion: 1,
        importId: ctx.importId,
        sourceHash: ctx.sourceHash,
        counts,
        issues: [
            ...issues,
            ...resources
                .filter((r) => r.status !== "available")
                .map((r) => ({key: r.key, status: r.status, code: r.code})),
        ],
        machinePreferenceSuggestion: {
            host: state.data.SETTINGS.host,
            showSample: state.data.SETTINGS.showSample,
        },
        machineTrustImported: false,
        legacyFacts: {
            projectMetadata: allProjects.map(({p, key}) => ({
                key,
                folder: p.folder,
                dates: p.dates,
                preferredTemplate: p.tpl,
            })),
            templateVersionMapping: Object.fromEntries(
                [...templates].map(([id]) => [id, mapping[`template/${id}`].versions]),
            ),
            requestedDefaultPhoto: requestedDefault?.id ?? null,
        },
        historyPublicationText: "unknown",
    };
    const raw = read(path.join(ctx.work, "source.json")),
        mapBytes = ctx.json(idmap),
        resourceBytes = ctx.json(resources),
        reportBytes = ctx.json(report),
        tasksBytes = ctx.json({
            format: "nova-browser-import-legacy-tasks",
            schemaVersion: 1,
            activeExecution: false,
            tasks: state.data.TASKS,
        });
    ctx.evidence("原始备份.json", raw);
    ctx.evidence("映射.json", mapBytes);
    ctx.evidence("资源.json", resourceBytes);
    ctx.evidence("报告.json", reportBytes);
    ctx.evidence("历史任务.json", tasksBytes);
    ctx.evidence(
        "收据.json",
        ctx.json({
            format: "nova-browser-import-receipt",
            schemaVersion: 1,
            importId: ctx.importId,
            sourceHash: ctx.sourceHash,
            mappingVersion: 1,
            libraryId: ctx.library.info.libraryId,
            hashes: {
                raw: ctx.sha(raw),
                map: ctx.sha(mapBytes),
                resources: ctx.sha(resourceBytes),
                report: ctx.sha(reportBytes),
                tasks: ctx.sha(tasksBytes),
            },
        }),
    );
    publish(path.join(ctx.work, "report.json"), reportBytes);
}
