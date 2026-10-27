import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectVaultResources, applyVaultResourceTransaction, validateVaultResourceTransaction, annotateVaultResources} from './resources.mjs';
import {
    defaultProductionCreation,
    emptyProduction,
} from '../file-library/production.mjs';
import {
    bindingForRuntime,
    readVaultSnapshot,
    contentSources,
    readVaultDocument,
    saveVaultDocument,
    createVaultDocument,
    trashVaultDocument,
    restoreVaultSource,
    validateVaultRestoreSource,
    materializeVaultBody,
    digest,
    json,
    writeJSON,
    safe,
    uuidFor,
    fail,
    readVaultTaskContext,
    readBytes,
    mkdir,
    queryVaultMutation,
    resumeVaultMutation,
} from './core.mjs';

let resourceProjector = projectVaultResources;
/** Internal extension point: runs once per outer sync, before any runtime lock.
 * Use the supplied snapshot/raw API; do not reopen or rescan the Vault here.
 * The projector owns its own per-source fingerprint and writes only changed projections.
 */
export function registerVaultResourceProjector(projector) {
    if (typeof projector !== 'function')
        fail('INVALID_INPUT', '资源投影入口必须是函数');
    resourceProjector = projector;
}

export function makeVaultBridge(root) {
    const binding = bindingForRuntime(root);
    if (!binding) return null;
    let syncing = false,
        batchDepth = 0,
        api,
        mutate,
        latest = [],
        resourcesPrimed = false;
    const projectionPath = '.workbench/projection.json';
    let projection = {format: 'nova-vault-projection', contents: {}};
    if (fs.existsSync(safe(binding.vaultRoot, projectionPath, true)))
        projection = json(binding.vaultRoot, projectionPath);
    if (
        projection.format !== 'nova-vault-projection' ||
        !projection.contents ||
        Array.isArray(projection.contents)
    )
        fail('CORRUPT', '知识库投影索引损坏');
    function store() {
        writeJSON(binding.vaultRoot, projectionPath, projection);
    }
    // A trash receipt pins the original source even if an earlier projection
    // accidentally rebound a surviving topic card. Repair only managed metadata.
    let repairedTrashMapping = false;
    for (const source of Object.values(projection.contents)) {
        if (!source.trashMutationId) continue;
        const receipt = queryVaultMutation(root, source.trashMutationId);
        if (
            receipt?.request.action !== 'trash' ||
            receipt.status !== 'committed'
        )
            fail('CORRUPT', '内容回收映射缺少有效回执');
        const original = json(
            binding.vaultRoot,
            `.workbench/mutations/${source.trashMutationId}.json`,
        );
        if (
            source.relativePath !== original.path ||
            source.documentId !== receipt.request.input.id ||
            source.hash !== original.beforeHash
        ) {
            source.relativePath = original.path;
            source.documentId = receipt.request.input.id;
            source.hash = original.beforeHash;
            source.writable = /\.(?:md|markdown|txt|json)$/i.test(
                original.path,
            );
            if (original.path.startsWith('05_内容草稿/'))
                source.contentDirectory = path.posix.dirname(original.path);
            repairedTrashMapping = true;
        }
    }
    if (repairedTrashMapping) {
        delete projection.sourceFingerprint;
        store();
    }
    function project(...args) {
        const mid = args[4].mutationId;
        mkdir(binding.vaultRoot, '.workbench/projection-mutations');
        writeJSON(
            binding.vaultRoot,
            `.workbench/projection-mutations/${mid}.json`,
            {contentId: args[7] ?? args[1], bodyHash: digest(args[2].body)},
        );
        return mutate(...args);
    }
    function sync(includeResources = true) {
        if (syncing || batchDepth) return;
        syncing = true;
        try {
            if (fs.existsSync(safe(binding.vaultRoot, projectionPath, true)))
                projection = json(binding.vaultRoot, projectionPath);
            const snapshot = readVaultSnapshot(root);
            if (includeResources || !resourcesPrimed) {
                resourceProjector?.({
                    runtimeRoot: root,
                    vaultRoot: binding.vaultRoot,
                    snapshot,
                    rawApi: api,
                    mutate,
                });
                resourcesPrimed = true;
            }
            latest = contentSources(snapshot).filter((s) => {
                const old = projection.contents[s.contentId];
                return (
                    !old ||
                    (!old.trashMutationId &&
                        snapshot.documents.some(
                            (d) => d.relativePath === old.relativePath,
                        ))
                );
            });
            const sourceFingerprint = digest(
                JSON.stringify(
                    latest.map((s) => [
                        s.contentId,
                        s.document.id,
                        s.document.hash,
                        s.document.writable,
                        s.document.sourceConflict ?? null,
                        s.title,
                        s.publicationState,
                    ]),
                ),
            );
            if (
                projection.sourceFingerprint === sourceFingerprint &&
                projection.libraryId === api.info.libraryId
            )
                return;
            const existing = new Map(
                api.listAllContents().map((c) => [c.id, c]),
            );
            for (const source of latest) {
                const old = existing.get(source.contentId),
                    previous = projection.contents[source.contentId];
                if (!old) {
                    project(
                        'create',
                        null,
                        {
                            title: source.title || `${source.tNumber} 未定选题`,
                            body: source.body,
                        },
                        null,
                        {mutationId: randomUUID()},
                        'content',
                        (meta) => {
                            meta.schemaVersion = 5;
                            meta.productionState = defaultProductionCreation(
                                source.contentId,
                                Number(source.tNumber.slice(1)),
                                new Date().toISOString(),
                            );
                            if (source.published)
                                meta.productionState.stage = 'published';
                            else if (source.publicationState === '草稿')
                                meta.productionState.stage = 'writing';
                            return meta;
                        },
                        source.contentId,
                    );
                } else if (old.deletedAt === null) {
                    let creation = old.productionState;
                    const statusChanged =
                        previous?.publicationState !== source.publicationState;
                    if (statusChanged && !creation) {
                        creation =
                            api
                                .readProduction()
                                .creations.find(
                                    (c) => c.contentId === source.contentId,
                                ) ??
                            defaultProductionCreation(
                                source.contentId,
                                Number(source.tNumber.slice(1)),
                                new Date().toISOString(),
                            );
                    }
                    let nextStage = creation?.stage;
                    if (statusChanged) {
                        if (source.publicationState === '已发布')
                            nextStage = 'published';
                        else if (source.publicationState === '草稿')
                            nextStage = 'writing';
                        else if (source.publicationState === '待写')
                            nextStage = 'idea';
                        else if (
                            source.publicationState === 'conflict' &&
                            nextStage === 'published'
                        )
                            nextStage = 'writing';
                    }
                    const stageChanged =
                        statusChanged && nextStage !== creation?.stage;
                    if (
                        previous?.hash !== source.document.hash ||
                        old.body !== source.body ||
                        stageChanged
                    ) {
                        project(
                            'update',
                            old.id,
                            {body: source.body},
                            old.editToken,
                            {mutationId: randomUUID()},
                            'content',
                            stageChanged
                                ? (meta) => ({
                                      ...meta,
                                      schemaVersion: 5,
                                      productionState: {
                                          ...creation,
                                          stage: nextStage,
                                          updatedAt: new Date().toISOString(),
                                      },
                                  })
                                : undefined,
                        );
                    }
                }
                projection.contents[source.contentId] = {
                    documentId: source.document.id,
                    relativePath: source.document.relativePath,
                    hash: source.document.hash,
                    writable: source.document.writable,
                    sourceConflict: source.document.sourceConflict ?? null,
                    sourceResolution: source.sourceResolution,
                    sourceCandidates: source.sourceCandidates,
                    summaryOnly: source.summaryOnly,
                    creationDocuments: source.creationDocuments,
                    recorded: source.recorded,
                    contentDirectory: source.contentDirectory,
                    tNumber: source.tNumber,
                    publicationState: source.publicationState,
                    ...(previous?.trashMutationId
                        ? {trashMutationId: previous.trashMutationId}
                        : {}),
                };
            }
            const w = api.readProduction(),
                missing = latest.filter(
                    (s) =>
                        !w.creations.some((c) => c.contentId === s.contentId),
                ),
                next = Math.max(
                    w.nextTNumber,
                    ...latest.map((s) => Number(s.tNumber.slice(1)) + 1),
                    1,
                );
            if (missing.length || next !== w.nextTNumber) {
                mutate(
                    'update',
                    'default',
                    {vaultProjection: true},
                    w.editToken,
                    {mutationId: randomUUID()},
                    'workspace',
                    (meta) => {
                        meta.schemaVersion = 2;
                        const p = structuredClone(
                            meta.production || emptyProduction(),
                        );
                        for (const s of missing)
                            p.creations.push(
                                defaultProductionCreation(
                                    s.contentId,
                                    Number(s.tNumber.slice(1)),
                                    new Date().toISOString(),
                                ),
                            );
                        p.nextTNumber = next;
                        meta.production = p;
                        return meta;
                    },
                );
            }
            projection.sourceFingerprint = sourceFingerprint;
            projection.libraryId = api.info.libraryId;
            store();
        } finally {
            syncing = false;
        }
    }
    function validateMutation({operation, contentId, before, after}) {
        if (syncing || operation === 'create') return;
        const source = projection.contents[contentId];
        if (!source) fail('CONFLICT', '此内容缺少原位来源，拒绝维护独立正文');
        if (operation === 'restore') {
            validateVaultRestoreSource(root, source);
            return;
        }
        if (operation === 'update' && source.sourceConflict)
            fail('CONFLICT', source.sourceConflict);
        if (operation === 'update' && after[1].equals(before[1])) return;
        if (!source.writable && operation === 'update')
            fail(
                'INVALID_INPUT',
                '当前稿来自只读 HTML，不能改写旧 Markdown 代替当前稿',
            );
        if (
            digest(readBytes(binding.vaultRoot, source.relativePath)) !==
            source.hash
        )
            fail('CONFLICT', '知识文件已在外部修改，请重新读取');
    }
    function beforeMutation({
        operation,
        contentId,
        input,
        mutationId,
        before,
        after,
    }) {
        if (syncing) return;
        const prior = queryVaultMutation(root, mutationId);
        if (prior) {
            const receipt =
                prior.status === 'pending'
                    ? resumeVaultMutation(root, mutationId)
                    : prior;
            if (operation === 'trash' && receipt.request.action === 'trash') {
                const source = projection.contents[contentId];
                if (!source) fail('CORRUPT', '回收事务缺少来源');
                source.trashMutationId = mutationId;
                store();
                return;
            }
            if (
                operation === 'restore' &&
                receipt.request.action === 'restore'
            ) {
                delete projection.contents[contentId].trashMutationId;
                store();
                return;
            }
            const document = receipt.result?.document;
            if (
                !document ||
                receipt.result.text !== after[1]?.toString('utf8') ||
                (operation === 'create' &&
                    receipt.request.action !== 'create') ||
                (operation === 'update' &&
                    !['save', 'materialize-body'].includes(
                        receipt.request.action,
                    ))
            )
                fail('INVALID_INPUT', 'mutationId 已用于不同的知识来源请求');
            projection.contents[contentId] = {
                documentId: document.id,
                relativePath: document.relativePath,
                hash: document.hash,
                writable: document.writable,
                contentDirectory: path.posix.dirname(document.relativePath),
                tNumber: document.tNumber,
            };
            store();
            return;
        }
        if (!['create', 'update', 'trash', 'restore'].includes(operation))
            return;
        if (operation === 'create') {
            const out = createVaultDocument(
                root,
                {
                    section: 'drafts',
                    title: input.title === '未定选题' ? '' : input.title,
                    text: input.body,
                },
                {mutationId},
            );
            const source = {
                documentId: out.document.id,
                relativePath: out.document.relativePath,
                hash: out.document.hash,
                writable: true,
                contentDirectory: path.posix.dirname(out.document.relativePath),
                tNumber: out.document.tNumber,
            };
            projection.contents[contentId] = source;
            store();
            return;
        }
        const source = projection.contents[contentId];
        if (!source) fail('CONFLICT', '此内容缺少原位来源，拒绝维护独立正文');
        if (operation === 'restore') {
            restoreVaultSource(root, source, {mutationId});
            delete source.trashMutationId;
            store();
            return;
        }
        if (operation === 'trash') {
            trashVaultDocument(
                root,
                {id: source.documentId, expectedHash: source.hash},
                {mutationId},
            );
            source.trashMutationId = mutationId;
            store();
            return;
        }
        if (after[1] && before[1] && !after[1].equals(before[1])) {
            if (!source.writable)
                fail(
                    'INVALID_INPUT',
                    '当前稿来自只读 HTML，不能改写旧 Markdown 代替当前稿',
                );
            const out = source.relativePath.startsWith('04_选题库/')
                ? materializeVaultBody(
                      root,
                      contentId,
                      source,
                      after[1].toString('utf8'),
                      {mutationId},
                  )
                : saveVaultDocument(
                      root,
                      {
                          id: source.documentId,
                          expectedHash: source.hash,
                          text: after[1].toString('utf8'),
                      },
                      {mutationId},
                  );
            source.documentId = out.document.id;
            source.relativePath = out.document.relativePath;
            source.hash = out.document.hash;
            source.contentDirectory = path.posix.dirname(
                out.document.relativePath,
            );
            store();
        }
    }
    function wrap(original, mutator) {
        api = original;
        mutate = mutator;
        const out = {...api};
        // Startup installs many unrelated builtins. Re-scanning the complete
        // Vault for every prompt read made a large real library appear hung.
        // Only trusted synchronous internal work may hold this snapshot; each
        // underlying source mutation still enforces its own original-file CAS.
        out.withVaultBatch = callback => {
            sync();batchDepth++;
            let succeeded=false;
            try {
                const result=callback(out);
                if(result&&typeof result.then==='function')throw new TypeError('Vault batches must be synchronous');
                succeeded=true;return result;
            } finally {
                batchDepth--;
                if(!batchDepth&&succeeded)sync();
            }
        };
        for (const [name, fn] of Object.entries(api))
            if (typeof fn === 'function')
                out[name] = (...args) => {
                    if (
                        [
                            'listContents',
                            'listAllContents',
                            'listTrash',
                            'readContent',
                            'createContent',
                            'updateContent',
                            'trashContent',
                            'restoreContent',
                            'listPrompts',
                            'listPromptTrash',
                            'readPrompt',
                            'createPrompt',
                            'updatePrompt',
                            'trashPrompt',
                            'restorePrompt',
                            'setPromptEnabled',
                            'setPromptFavorite',
                            'readProduction',
                            'readProductionCreation',
                            'readProductionContext',
                            'saveProductionDraft',
                            'mutateProduction',
                        ].includes(name)
                    )
                        sync(!['listContents', 'listAllContents', 'listTrash', 'readContent'].includes(name));
                    if (
                        name === 'createContent' &&
                        args[0] &&
                        typeof args[0].title === 'string' &&
                        !args[0].title.trim()
                    )
                        args[0] = {...args[0], title: '未定选题'};
                    const result = fn(...args);
                    const annotate = value => ['readProduction','mutateProduction','readProductionContext','readPrompt','listPrompts','listPromptTrash','createPrompt','updatePrompt','trashPrompt','restorePrompt','setPromptEnabled','setPromptFavorite'].includes(name) ? annotateVaultResources(root,value) : value;
                    if (result && typeof result.then === 'function')
                        return result.then(annotate);
                    return annotate(result);
                };
        const originalContext = out.readProductionContext;
        out.readProductionContext = (...args) => {
            const context = originalContext(...args);
            return {
                ...context,
                vault: readVaultTaskContext(root, context.task?.contentId),
            };
        };
        return Object.freeze(out);
    }
    return {
        wrap,
        beforeMutation,
        validateMutation,
        validateResourceTransaction: tx => validateVaultResourceTransaction(root,tx),
        sync,
        isSyncing: () => syncing,
        contentIdForMutation: (mutationId) =>
            uuidFor(`${binding.vaultId}:mutation:${mutationId}`),
    };
}

export function applyVaultSourceTransaction(root, tx) {
    if (tx.committed) return;
    if (tx.kind !== 'content') return applyVaultResourceTransaction(root, tx);
    const binding = bindingForRuntime(root);
    if (!binding) return;
    const marker = `.workbench/projection-mutations/${tx.intent.mutationId}.json`;
    if (fs.existsSync(safe(binding.vaultRoot, marker, true))) {
        const value = json(binding.vaultRoot, marker);
        if (
            value.contentId !== tx.objectId ||
            value.bodyHash !== digest(tx.after[1])
        )
            fail('CORRUPT', '知识投影事务标记不匹配');
        return;
    }
    const bridge = makeVaultBridge(root),
        meta = JSON.parse(tx.after[0].toString('utf8'));
    bridge.beforeMutation({
        operation: tx.intent.operation,
        contentId: tx.objectId,
        input: {title: meta.title, body: tx.after[1]?.toString('utf8')},
        mutationId: tx.intent.mutationId,
        before: tx.before,
        after: tx.after,
    });
}
