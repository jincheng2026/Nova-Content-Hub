import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

async function sha256(file) {
    const hash = createHash('sha256');
    for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}

export async function exportColleagueDelivery(installer, output) {
    const release = /^Nova-Content-Hub-(\d+\.\d+\.\d+)-darwin-arm64-preview\.dmg$/.exec(path.basename(installer));
    if (!release || !fs.lstatSync(installer).isFile()) throw Error('Choose an Apple Silicon macOS preview DMG.');
    const name = `自媒体工作台-${release[1]}-Mac苹果芯片.dmg`;
    const originalHash = await sha256(installer);
    // Refuse replacement so a mistaken output path cannot erase an existing delivery or library.
    fs.mkdirSync(output);
    try {
        const copied = path.join(output, name);
        fs.copyFileSync(installer, copied, fs.constants.COPYFILE_EXCL);
        if (await sha256(copied) !== originalHash) throw Error('Installer changed while copying; export again from a finished build.');
        fs.writeFileSync(path.join(output, '安装与使用.txt'), `自媒体工作台 ${release[1]} · Mac 使用说明

适用：macOS 13 及以上、Apple Silicon 芯片（M 系列）。无需登录工作台。

1. 打开 DMG，将“自媒体工作台”拖入“应用程序”，再从“应用程序”启动。
2. 首次使用可创建内容库；想先看示例，请将 DMG 中整个“AI自媒体示例库”复制到“文稿”等可写位置，再在工作台打开这个内容库。不要直接使用 DMG 中的只读示例库。
3. 内置 5 组同事模板、52 条提示词；示例内容附两张“科技姐聊AI · 空间操作风”封面，可比较、收藏和批注。人物为 AI 虚构；原图保留平台标识，内容尚未发布。
4. 制作自己的封面：选择模板、填写标题，在“设置 → 常用设置 → 配套插件与版本”中准备安装插件，按提示到 Codex 或 WorkBuddy 的插件页面安装并启用。回工作台检查连接，再发起制作，并到所选助手完成生成。可能使用你已有的助手额度。
5. 升级前请在“内容库 → 备份与维护”备份。退出应用后替换“应用程序”中的旧版本；保留独立的内容库文件夹。如提示插件版本不匹配，请一并更新配套插件。

此安装包尚未完成 Apple Developer ID 正式签名与公证，首次打开可能被系统拦截。请核对来源和 SHA256；可查看“系统设置 → 隐私与安全性”中的原始提示及系统提供的打开入口。仍无法打开时，保留提示原文并联系提供安装包的人，不要关闭系统安全保护。

遇到使用问题，可在“设置 → 帮助与排查”中导出诊断，由你决定是否分享。诊断不含正文、照片、目录路径或凭据。
`);
        fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${originalHash}  ${name}\n`);
        return path.resolve(output);
    } catch (error) {
        fs.rmSync(output, {recursive: true, force: true});
        throw error;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length !== 4) throw Error('Use export-colleague-delivery.mjs <Apple-Silicon-preview.dmg> <new-delivery-directory>');
        console.log(await exportColleagueDelivery(path.resolve(process.argv[2]), path.resolve(process.argv[3])));
    } catch (error) {console.error(error.message); process.exitCode = 1;}
}
