import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Markdown is a rebuildable projection; immutable packages and receipts remain authoritative.
export function templateReports({root, template, packageFor, evidenceFor, requestFor, receiptDirectory, safePath, directory, assertRootIdentity, catalogEntries, hook = () => {}}) {
    const warnings = [];
    function write(file, text) {
        let temporary;
        try {
            assertRootIdentity(); directory(path.dirname(file));
            const existing = safePath(file, true);
            if (existing && !existing.isFile()) throw Error('报告位置不是普通文件');
            if (existing && fs.readFileSync(file, 'utf8') === text) return;
            hook('templateBeforeReportWrite', {templateId: template.id, file});
            // Keep crash leftovers inside a template; the template root enumerates object IDs.
            directory(home);
            temporary = path.join(home, `.nova-report-${randomUUID()}`);
            const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
            try {fs.writeFileSync(fd, text); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
            assertRootIdentity(); directory(path.dirname(file)); safePath(file, true);
            fs.renameSync(temporary, file); temporary = undefined;
        } catch (error) {warnings.push(`Markdown报告待重建：${path.basename(file)}（${error.code || 'IO_ERROR'}）`);}
        finally {if (temporary) try {fs.unlinkSync(temporary);} catch {}}
    }
    const home = path.join(root, '模板', template.id);
    const lines = [`# ${template.title}`, '', `模板 ID：${template.id}`, `当前版本：${template.currentVersion}`, `状态：${template.deletedAt ? '已回收' : '使用中'}`, ''];
    for (const entry of template.versions) {
        try {
            const pkg = packageFor(entry), notes = typeof pkg.definition.designNotes === 'string' ? pkg.definition.designNotes : '';
            lines.push(`- [版本 ${entry.version}](版本/${entry.version}/拆解说明.md) · SHA256 ${entry.packageHash}`);
            const accepted = (template.templateJobs || []).find(job => job.acceptance?.acceptedTemplate.version === entry.version && job.acceptance.acceptedTemplate.packageHash === entry.packageHash);
            let body = `# ${template.title} · 版本 ${entry.version}\n\n模板包 SHA256：${entry.packageHash}\n\n`;
            if (notes) body += `## 来源拆解资料，非本次AI验收\n\n${notes}\n\n`;
            body += `## 当前模板规则\n\n${(Array.isArray(pkg.definition.rules) ? pkg.definition.rules.map(rule => typeof rule === 'string' ? rule : JSON.stringify(rule, null, 2)).join('\n\n') : JSON.stringify(pkg.definition.rules ?? [], null, 2))}\n\n人工验收状态：${accepted ? '已验收本次 AI 结果' : '尚无本次 AI 人工验收记录'}\n`;
            const versionHome = path.join(home, '版本', String(entry.version));
            const samples = [...new Set(Object.values(pkg.resources).filter(resource => resource.role === 'style').map(resource => resource.assetHash))];
            body += `\n## 原图资产\n\n${samples.map((assetHash, index) => `- [原图 ${index + 1}](${path.relative(versionHome, path.join(root, '资产', 'sha256', assetHash.slice(0, 2), assetHash)).split(path.sep).join('/')}) · SHA256 ${assetHash}`).join('\n')}\n`;
            write(path.join(versionHome, '拆解说明.md'), body);
        } catch (error) {warnings.push(`版本 ${entry.version} 的 Markdown 报告待重建（${error.code || 'IO_ERROR'}）`);}
    }
    for (const job of template.templateJobs || []) for (const attempt of job.attempts) if (attempt.status === 'committed') {
        try {
            const {result, report} = evidenceFor(job, attempt), request = requestFor(job);
            const accepted = job.acceptance?.attemptId === attempt.attemptId && job.acceptance.resultHash === result.resultHash;
            lines.push(`- 学习请求 ${job.id} / 尝试 ${attempt.attemptId}：${accepted ? '人工已验收' : '等待人工验收'}`);
            const text = `# AI 学习与还原结果\n\n请求 ID：${job.id}\n尝试 ID：${attempt.attemptId}\n请求 SHA256：${job.requestHash}\n回执 SHA256：${attempt.receiptHash}\n结果 SHA256：${result.resultHash}\n规则 SHA256：${result.rulesHash}\n还原图 SHA256：${result.restore.assetHash}\n\n程序校验：${report.status}；${result.restore.width} × ${result.restore.height} PNG\n人工验收：${accepted ? `已验收，版本 ${job.acceptance.acceptedTemplate.version}，${job.acceptance.acceptedAt}` : '等待人工验收；程序校验通过不代表视觉与文字质量合格'}\n\n## 固定输入\n\n模板版本：${request.template.version}\n模板包 SHA256：${request.template.packageHash}\n\n用户要求：\n\n${request.notes}\n\n## 已核验规则与来源证据\n\n${JSON.stringify(result.rules, null, 2)}\n`;
            write(path.join(receiptDirectory(job, attempt), '学习结果.md'), text);
        } catch (error) {warnings.push(`尝试 ${attempt.attemptId} 的 Markdown 报告待重建（${error.code || 'IO_ERROR'}）`);}
    }
    write(path.join(home, '模板目录.md'), `${lines.join('\n')}\n`);
    if (catalogEntries) try {
        const entries = catalogEntries();
        write(path.join(root, '模板', '模板目录.md'), `# 内容库模板目录\n\n${entries.map(entry => `- [${entry.id}](${entry.id}/模板.json) · ${entry.title} · 当前版本 ${entry.currentVersion}${entry.deletedAt ? ' · 已回收' : ''}`).join('\n')}\n`);
    } catch (error) {warnings.push(`全库 Markdown 目录待重建（${error.code || 'IO_ERROR'}）`);}
    return {warnings};
}
