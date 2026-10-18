import sharp from "sharp";
import Core from "../../原型/core.js";

export async function makeBackup() {
    const png = async (color) =>
        "data:image/png;base64," +
        (
            await sharp({
                create: {width: 8, height: 8, channels: 3, background: color},
            })
                .png()
                .toBuffer()
        ).toString("base64");
    const red = await png("red"),
        blue = await png("blue");
    const template = {
        id: "template",
        name: "私有模板",
        version: 2,
        state: "待拆解",
        desc: "original",
        style: "",
        fit: "",
        unfit: "",
        source: "private source",
        from: "",
        owner: "",
        ratio: "3:4",
        builtin: false,
        madeAt: "2026-10-16",
        used: 0,
        shots: [red, "private/missing.png"],
        img: red,
        why: [],
        fixed: [],
        varies: [],
        evidence: [],
        colors: [],
        history: [
            {
                version: 1,
                state: "待拆解",
                fixed: [],
                varies: [],
                evidence: [],
                archivedAt: "2026-10-15T00:00:00.000Z",
                definition: {shots: [blue]},
            },
        ],
    };
    const project = (id, cover = red) => ({
        id,
        kind: "内容",
        name: id,
        folder: `内容/${id}`,
        tpl: "template",
        channels: ["抖音", "小红书"],
        dates: {record: "2026-10-01"},
        plan: "2026-10-18",
        files: [
            {
                id: "file",
                name: "notes.txt",
                size: "5 bytes",
                content: "data:text/plain;base64,aGVsbG8=",
            },
            {
                id: "missing",
                name: "missing.txt",
                size: "unknown",
                srcPath: "private/never-read.txt",
            },
        ],
        materials: [
            {
                id: "portrait",
                name: "竖版",
                format: "竖版",
                ratio: "3:4",
                tpl: "template",
                batches: [
                    {
                        no: 1,
                        at: "2026-10-16",
                        tpl: "template",
                        state: "done",
                        cands: [
                            {
                                id: "same-candidate",
                                no: "01",
                                img: cover,
                                use: true,
                                fav: true,
                            },
                        ],
                    },
                ],
            },
        ],
        posts: [
            {
                id: "post",
                date: "2026-10-18",
                time: "",
                channel: "抖音",
                mat: "portrait",
                text: "当前渠道文案",
                pub: {
                    at: "2026-10-17",
                    link: "https://example.test/old",
                    snapshot: {candidateId: "same-candidate", batch: 1, img: blue},
                },
            },
            {
                id: "second",
                date: "2026-10-19",
                time: "19:00",
                channel: "小红书",
                mat: "portrait",
                text: "",
            },
        ],
    });
    const prompt = (id) => ({
        id,
        title: "提示词",
        when: "when",
        summary: "summary",
        source: "private",
        body: "private prompt",
        cat: "私有",
        file: "x.md",
        tags: ["tag"],
        off: true,
        mine: true,
    });
    const collection = {
        id: "collection",
        kind: "合集",
        name: "合集",
        folder: "合集/collection",
        tpl: "",
        channels: ["公众号"],
        dates: {from: "2026-10-01", to: "2026-10-31"},
        plan: "",
        files: [],
        materials: [],
        posts: [],
        members: ["first", "second"],
    };
    const state = {
        format: "nova-content-hub-browser",
        schema: 1,
        appScope: "nova-content-hub",
        libraryId: "old-library",
        updatedAt: "2026-10-17T00:00:00.000Z",
        data: {
            ACCOUNT: {
                name: "作者",
                intro: "简介",
                avatar: red,
                photos: [{id: "mine", name: "me.png", img: red, use: true}],
                marks: [
                    {k: "身份", v: "创作者"},
                    {k: "身份", v: "讲师"},
                ],
            },
            SETTINGS: {
                host: "workbuddy",
                showSample: true,
                clientId: "demo",
                root: "demo",
                pluginDir: "demo",
                lastCheck: "",
                installed: {workbuddy: true},
                versions: {},
                hostConfig: {
                    workbuddy: {
                        installation: "installed",
                        trust: "trusted",
                        version: "demo",
                    },
                },
            },
            CHANNELS: {
                抖音: {ink: "#16181d", bg: "#eceef1", builtin: true, need: "竖版"},
                小红书: {ink: "#d6336c", bg: "#fce9ef", builtin: true, need: "方图"},
                公众号: {ink: "#a15c00", bg: "#fbf0dd", builtin: true, need: "头图"},
            },
            PROJECTS: [project("first"), project("second", blue), collection],
            TEMPLATES: [template],
            TASKS: [
                {
                    id: "task",
                    name: "旧任务",
                    host: "codex",
                    state: "handoff",
                    steps: 3,
                    step: 0,
                    order: [],
                    conv: "",
                    legacyDemo: true,
                },
            ],
            PROMPTS: [prompt("prompt")],
            CUSTOM_SIZES: ["2.35:1", "6:8"],
            PCATS: ["空分类", "私有"],
        },
        trash: [
            {
                id: "recycled-content",
                kind: "project",
                value: project("first", blue),
            },
            {
                id: "recycled-photo",
                kind: "photo",
                value: {
                    id: "photo-old",
                    name: "gone.png",
                    img: "private/gone.png",
                    use: false,
                },
            },
            {id: "recycled-prompt", kind: "prompt", value: prompt("old-prompt")},
            {
                id: "recycled-file",
                kind: "file",
                pid: "first",
                value: {
                    id: "old-file",
                    name: "old.txt",
                    size: "3 bytes",
                    content: "data:text/plain;base64,b2xk",
                },
            },
            {
                id: "recycled-missing",
                kind: "file",
                pid: "first",
                value: {
                    id: "old-missing",
                    name: "old-missing.txt",
                    size: "unknown",
                    srcPath: "private/old.txt",
                },
            },
            {id: "recycled-shot", kind: "shot", tid: "template", value: blue},
        ],
    };
    Core.validate(state);
    return {state, red, blue};
}
