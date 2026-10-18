import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(dir);
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
const legacyV1 = JSON.parse(fs.readFileSync(path.join(dir, 'legacy-v1.json'), 'utf8'));
const legacyDraft = JSON.parse(fs.readFileSync(path.join(dir, 'legacy-v2-draft.json'), 'utf8'));
const legacyComplete = JSON.parse(fs.readFileSync(path.join(dir, 'legacy-v2-complete.json'), 'utf8'));
const legacyV3 = JSON.parse(fs.readFileSync(path.join(dir, 'legacy-v3.json'), 'utf8'));
const legacy = [...legacyV1.templates, ...legacyDraft.templates, ...legacyComplete.templates, ...legacyV3.templates];
const generatedFiles = JSON.parse(fs.readFileSync(path.join(root, 'assets/ai-reference-prompts/generated-files.json'), 'utf8'));
const referenceFiles = new Map(generatedFiles.map(file => [file.file, file]));
assert.equal(referenceFiles.size, generatedFiles.length);
const check = process.argv.includes('--check');
const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
}[c]));
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const line = (x, y, a, b, color, extra = '') => `<path d="M${x} ${y} L${a} ${b}" fill="none" stroke="${color}" stroke-width="2" ${extra}/>`;
const text = (x, y, s, size, color, weight = 400, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(s)}</text>`;
const title = (sample, t) => sample.titleLines.map((s, i) => text(t.spec.title.x, t.spec.title.y + i * t.spec.title.lineHeight, s, t.spec.title.fontSize, t.spec.title.color, t.spec.title.weight, t.spec.title.fontFamily ? `font-family="${esc(t.spec.title.fontFamily)}"` : '')).join('');

function render(t, sample, role) {
    const [bg, ink, accent, soft] = t.colors.map(c => c.v);
    const label = role === 'source' ? '原创设计原图' : '原创换标题参考';
    let body = rect(0, 0, 900, 1200, bg);
    if (t.recipe === 'geometry') {
        body += rect(66, 70, 192, 38, accent) + text(82, 96, 'IDEA / 01', 19, ink, 800);
        body += text(66, 174, '创作练习 · 把想法写清楚', 23, soft);
        body += `<circle cx="710" cy="780" r="245" fill="${accent}"/><circle cx="710" cy="780" r="145" fill="${bg}"/>`;
        body += `<path d="M60 792 L355 650 L454 960 Z" fill="${soft}"/><path d="M500 1060 L804 1060 L804 1008" fill="none" stroke="${ink}" stroke-width="8"/>`;
        body += title(sample, t) + text(68, 580, sample.subtitle, 28, ink, 500);
        body += text(68, 1000, '先抓住一个重点', 28, ink, 800) + text(68, 1040, '再让每句话有位置', 24, ink);
    } else if (t.recipe === 'paper') {
        for (let y = 52; y < 1160; y += 28) body += line(45, y, 855, y, soft, 'opacity=".38"');
        body += rect(58, 52, 784, 1084, '#fffdf8', 'rx="8" stroke="#d9cfbd" stroke-width="2"');
        body += rect(320, 40, 260, 45, accent, 'opacity=".65" transform="rotate(-3 450 60)"');
        body += text(100, 152, 'THE LITTLE CHECKLIST', 22, ink, 600, 'letter-spacing="3"');
        body += title(sample, t) + text(100, 425, sample.subtitle, 25, ink);
        body += line(100, 472, 800, 472, accent, 'stroke-dasharray="8 10"');
        sample.points.forEach((s, i) => {
            const y = 563 + i * 126;
            body += rect(102, y - 29, 34, 34, 'none', `rx="4" stroke="${accent}" stroke-width="3"`) + text(162, y, s, 31, ink, 500) + text(162, y + 37, `0${i + 1} / 留下一条可执行的动作`, 19, '#7d796e');
        });
        body += text(100, 1062, '把复杂的事，拆成小步。', 28, ink, 600);
    } else if (t.recipe === 'notes') {
        for (let x = 55; x < 880; x += 30) for (let y = 56; y < 1150; y += 30) body += `<circle cx="${x}" cy="${y}" r="1.4" fill="${soft}"/>`;
        body += line(86, 72, 86, 1120, '#deb7a4');
        body += text(120, 120, '知识卡 / LEARNING NOTES', 22, ink, 600);
        body += rect(110, 220, 680, 48, accent, 'opacity=".6" transform="rotate(-1 450 245)"') + title(sample, t);
        body += text(120, 440, sample.subtitle, 25, ink);
        body += `<path d="M167 510 Q450 488 740 513 L750 648 Q450 670 160 650 Z" fill="${soft}" stroke="${ink}" stroke-width="3"/>`;
        body += text(204, 568, '一个核心问题', 31, ink, 700) + text(204, 611, sample.points[0], 25, ink);
        body += `<path d="M450 674 L450 728 M450 728 L255 728 L255 783 M450 728 L646 728 L646 783" fill="none" stroke="${ink}" stroke-width="3"/>`;
        body += rect(132, 792, 300, 164, '#fffdf6', `rx="12" stroke="${ink}" stroke-width="2"`) + rect(474, 792, 300, 164, '#fffdf6', `rx="12" stroke="${ink}" stroke-width="2"`);
        body += text(161, 844, '01 先理解', 25, ink, 700) + text(161, 893, sample.points[1], 24, ink) + text(505, 844, '02 再应用', 25, ink, 700) + text(505, 893, sample.points[2], 24, ink);
        body += text(120, 1060, '用自己的话，讲给另一个人。', 26, ink, 500);
    } else if (t.recipe === 'comparison') {
        body += rect(450, 0, 450, 1200, soft);
        body += text(66, 100, 'TWO WAYS TO THINK', 22, ink, 700, 'letter-spacing="2"') + title(sample, t);
        body += text(66, 429, sample.subtitle, 25, ink);
        body += rect(56, 490, 370, 518, '#ffffff', 'rx="20"') + rect(474, 490, 370, 518, ink, 'rx="20"');
        body += text(87, 562, '习惯做法', 34, ink, 700) + text(506, 562, '试着换一步', 34, '#ffffff', 700);
        body += text(87, 611, 'BEFORE', 18, '#737c80', 600, 'letter-spacing="3"') + text(506, 611, 'AFTER', 18, accent, 600, 'letter-spacing="3"');
        sample.points.forEach((s, i) => {
            const y = 704 + i * 94;
            body += text(87, y, s[0], 27, ink) + text(506, y, s[1], 27, '#ffffff');
        });
        body += `<circle cx="450" cy="748" r="29" fill="${accent}"/>` + text(435, 758, '→', 31, ink, 700);
        body += text(66, 1080, '比较同一个维度，再做选择。', 27, ink, 600);
    } else if (t.recipe === 'neon') {
        for (let x = 0; x <= 900; x += 60) body += line(x, 80, x, 1130, soft, 'opacity=".6"');
        for (let y = 110; y < 1130; y += 60) body += line(0, y, 900, y, soft, 'opacity=".6"');
        body += rect(60, 60, 170, 40, 'none', `rx="20" stroke="${accent}"`) + text(81, 87, 'FIELD NOTES', 19, accent, 600);
        body += text(64, 168, '创作系统 / BUILD IN PUBLIC', 21, '#aec1d5', 500) + title(sample, t) + text(66, 499, sample.subtitle, 27, '#aec1d5');
        body += `<circle cx="450" cy="770" r="178" fill="${bg}" stroke="${accent}" stroke-width="3"/><ellipse cx="450" cy="770" rx="265" ry="80" fill="none" stroke="${ink}" stroke-width="3" transform="rotate(-32 450 770)"/><ellipse cx="450" cy="770" rx="265" ry="80" fill="none" stroke="${accent}" stroke-width="3" transform="rotate(32 450 770)"/><circle cx="450" cy="770" r="65" fill="${ink}"/>`;
        body += text(410, 782, 'AI', 40, bg, 800) + rect(64, 1030, 772, 72, '#101e35', `rx="10" stroke="${soft}"`) + text(88, 1076, sample.points[0], 25, accent, 600);
    } else if (t.recipe === 'magazine') {
        body += text(66, 96, 'S L O W   N O T E S', 24, ink, 500) + line(66, 124, 834, 124, ink);
        body += text(66, 178, 'ISSUE 06', 18, ink, 500) + text(680, 178, '生活练习', 22, ink);
        body += title(sample, t) + text(68, 474, sample.subtitle, 25, ink);
        body += rect(310, 566, 524, 410, soft) + `<path d="M405 976 V760 A139 139 0 0 1 683 760 V976" fill="${accent}"/><path d="M470 976 V795 A73 73 0 0 1 616 795 V976" fill="${bg}"/><circle cx="738" cy="640" r="42" fill="${bg}"/>`;
        body += text(66, 708, '留', 40, ink, 500, 'font-family="Songti SC,SimSun,serif"') + text(66, 766, '一', 40, ink, 500, 'font-family="Songti SC,SimSun,serif"') + text(66, 824, '点', 40, ink, 500, 'font-family="Songti SC,SimSun,serif"') + text(66, 882, '空', 40, ink, 500, 'font-family="Songti SC,SimSun,serif"');
        body += text(66, 1045, sample.points[0], 26, ink) + text(66, 1084, '给日常一个新的观察角度。', 22, '#77746d');
    } else if (t.recipe === 'interview') {
        body += text(66, 106, 'IN CONVERSATION / 对话示例', 23, ink, 600) + title(sample, t) + text(66, 407, sample.subtitle, 25, ink);
        body += rect(66, 468, 407, 620, soft) + `<path d="M94 1088 Q98 850 260 848 Q429 850 453 1088Z" fill="${ink}"/><ellipse cx="263" cy="715" rx="99" ry="124" fill="${bg}"/><path d="M164 704 Q154 558 270 575 Q377 583 364 711 Q326 690 306 637 Q241 704 164 704Z" fill="${ink}"/>`;
        body += rect(504, 590, 330, 400, '#fffdf5') + text(530, 655, '“', 88, accent, 800) + text(530, 708, '关于创作', 28, ink, 700) + text(530, 750, '先听一个回答', 28, ink, 700);
        body += line(530, 790, 808, 790, soft) + text(530, 840, sample.points[0], 21, ink, 600) + text(530, 900, sample.points[1], 17, ink);
        body += text(529, 1050, '人物为原创无身份剪影', 18, ink);
    } else if (t.recipe === 'lifestyle') {
        body += text(66, 106, 'A SMALL MOMENT / 日常片刻', 23, ink, 500) + title(sample, t) + text(66, 407, sample.subtitle, 24, ink);
        body += `<g transform="rotate(-3 450 760)">${rect(88, 472, 716, 570, '#fffdf7')}${rect(112, 496, 668, 484, soft)}${rect(112, 496, 668, 260, '#dce1ce')}${rect(510, 520, 210, 222, '#eef0df')}${line(615, 520, 615, 742, '#a2b299')}${line(510, 635, 720, 635, '#a2b299')}${rect(112, 756, 668, 224, '#b78964')}<path d="M145 820 L454 820 L485 933 L176 933Z" fill="#f9f2dd"/><path d="M305 820 L330 933" stroke="${accent}" stroke-width="3"/><ellipse cx="598" cy="842" rx="60" ry="22" fill="#9c7156"/><path d="M552 777 H641 V838 Q594 863 552 838Z" fill="#fff5df"/><path d="M641 790 Q695 779 679 818 Q669 835 641 821" fill="none" stroke="#fff5df" stroke-width="14"/>${text(132, 1018, '窗边桌面 / 原创插画', 19, ink)}</g>`;
        body += rect(463, 978, 350, 117, '#f8e8bc', 'transform="rotate(3 638 1036)"') + text(485, 1043, sample.points[0], 25, ink, 600);
    } else if (t.recipe === 'product') {
        body += text(66, 106, 'OBJECT STUDY / 单品观察', 23, ink, 600) + title(sample, t) + text(66, 407, sample.subtitle, 24, ink);
        body += `<circle cx="458" cy="716" r="228" fill="${soft}"/><path d="M289 787 V661 A169 169 0 0 1 627 661 V787" fill="none" stroke="${ink}" stroke-width="42"/><path d="M296 664 A161 161 0 0 1 620 664" fill="none" stroke="${bg}" stroke-width="12"/>${rect(251, 720, 83, 170, ink, 'rx="35"')}${rect(582, 720, 83, 170, ink, 'rx="35"')}${rect(272, 740, 39, 131, accent, 'rx="18"')}${rect(604, 740, 39, 131, accent, 'rx="18"')}`;
        body += line(133, 618, 310, 618, ink) + text(84, 589, '结构示意', 21, ink) + line(660, 810, 812, 810, ink) + text(687, 849, '无品牌', 21, ink);
        sample.points.forEach((s, i) => {
            const x = 66 + i * 263;
            body += rect(x, 979, 243, 114, '#ffffff', 'rx="10"') + text(x + 18, 1016, `0${i + 1}`, 18, accent, 700) + text(x + 18, 1060, s, 26, ink, 700);
        });
    } else if (t.recipe === 'news') {
        body += text(66, 102, 'THE DAILY BRIEF', 33, ink, 800) + text(637, 102, '资讯排版示例', 18, ink) + line(66, 128, 834, 128, ink) + text(66, 179, '先核实，再表达 / 非真实事件', 22, accent, 700) + title(sample, t) + text(66, 454, sample.subtitle, 24, ink);
        body += line(104, 565, 104, 984, soft);
        sample.points.forEach((s, i) => {
            const y = 590 + i * 169;
            body += `<circle cx="104" cy="${y}" r="26" fill="${accent}"/>` + text(91, y + 8, String(i + 1), 24, bg, 800) + text(161, y + 6, s, 36, ink, 700) + text(161, y + 50, ['一句话交代已知信息', '核对原始材料与发生时间', '区分事实、判断和待核问题'][i], 23, ink) + line(161, y + 91, 834, y + 91, soft);
        });
        body += rect(66, 1060, 768, 43, ink) + text(84, 1089, '编辑提醒：这里不包含真实新闻或机构背书', 21, bg, 500);
    } else if (t.recipe === 'ai-tool') {
        body += text(66, 103, 'AI TOOL LAB / 工具试验台', 23, ink, 700) + title(sample, t) + text(66, 404, sample.subtitle, 24, ink);
        body += rect(66, 474, 768, 431, ink, 'rx="18"') + text(93, 518, 'INPUT', 19, soft, 700) + text(488, 518, 'OUTPUT / 示意', 19, soft, 700) + line(450, 541, 450, 871, soft);
        body += rect(91, 552, 333, 299, '#f2f5f2', 'rx="10"') + text(114, 603, '任务卡', 28, ink, 700) + text(114, 651, '整理一段原始材料', 24, ink) + text(114, 704, '目标 / 读者 / 格式', 22, ink) + text(114, 795, '用户确认后输入', 21, ink, 600);
        body += rect(478, 552, 331, 299, '#294c5e', 'rx="10"') + text(502, 604, '结果区域', 28, '#ffffff', 700);
        [655, 690, 725].forEach((y, i) => {
            body += rect(502, y, 242 - i * 36, 9, soft, 'rx="4"');
        });
        body += text(502, 797, '此处不是真实输出', 21, '#ffffff');
        sample.points.forEach((s, i) => {
            const y = 969 + i * 58;
            body += `<circle cx="81" cy="${y - 9}" r="9" fill="${accent}"/>` + text(107, y, s, 27, ink, 600);
        });
    } else if (t.recipe === 'agent') {
        body += text(66, 103, 'AGENT FLOW / 任务交接示意', 23, ink, 700) + title(sample, t) + text(66, 405, sample.subtitle, 24, ink);
        body += `<path d="M397 602 H498 M660 678 V801 M501 880 H397" fill="none" stroke="${ink}" stroke-width="4"/><path d="M485 595 L498 602 L485 609 M653 788 L660 801 L667 788 M410 873 L397 880 L410 887" fill="none" stroke="${ink}" stroke-width="4"/>`;
        [[66, 517], [501, 517], [501, 796], [66, 796]].forEach(([x, y], i) => {
            body += rect(x, y, 333, 169, i === 2 ? '#fff8e9' : '#ffffff', `rx="16" stroke="${i === 2 ? accent : soft}" stroke-width="${i === 2 ? 4 : 2}"`) + text(x + 24, y + 42, `0${i + 1} / ${['INPUT', 'PROCESS', 'HUMAN CHECK', 'DELIVERY'][i]}`, 16, ink, 700) + text(x + 24, y + 100, sample.points[i], 32, ink, 700) + text(x + 24, y + 139, ['有依据的原始内容', '明确工具与处理步骤', '确认事实与授权', '保留来源与最终版本'][i], 18, ink);
        });
        body += rect(66, 1042, 768, 64, soft, 'rx="10"') + text(88, 1083, '人工检查之后，再进入下一步。', 27, ink, 700);
    } else if (t.recipe === 'tech-collage') {
        body += rect(0, 422, 900, 710, '#e6e6e2') + line(0, 1000, 900, 1000, '#cececa');
        body += rect(52, 60, 660, 275, '#fffefd', 'rx="6"') + title(sample, t) + text(69, 398, 'CREATOR / 任务与工具', 22, soft, 700);
        body += `<ellipse cx="628" cy="1036" rx="176" ry="24" fill="#c7c7c4"/><path d="M459 1017 L482 763 Q554 696 681 749 L786 1017Z" fill="#74747a"/><ellipse cx="618" cy="611" rx="99" ry="123" fill="#d6bba4"/><path d="M521 600 Q508 452 627 473 Q732 474 720 607 L685 559 Q615 532 521 600Z" fill="${ink}"/>`;
        body += rect(123, 784, 362, 215, '#34343c', `rx="12" stroke="${soft}" stroke-width="5"`) + rect(102, 997, 414, 24, '#97979f', 'rx="6"') + rect(692, 851, 100, 166, '#31313a', 'rx="14"');
        sample.points.forEach((point, i) => {
            const x = 85 + i * 212;
            body += rect(x, 586, 194, 116, '#fffefd', `rx="10" transform="rotate(${i ? 5 : -4} ${x + 97} 644)"`) + text(x + 18, 633, `0${i + 1} / TASK`, 16, soft, 700) + text(x + 18, 675, point, 25, ink, 700);
        });
        body += rect(66, 1050, 768, 66, accent, 'rx="5"') + text(86, 1095, sample.subtitle, 42, ink, 850);
    } else if (t.recipe === 'big-head') {
        body += `<path d="M599 90 L900 28 L900 680 L737 506 L552 309Z M0 884 L900 674 L900 1010 L220 1118Z" fill="${accent}"/><path d="M419 1120 Q429 954 656 941 Q824 946 848 1120Z" fill="#183d85"/><ellipse cx="654" cy="729" rx="178" ry="230" fill="#d7b99d"/><path d="M481 706 Q454 455 657 469 Q850 456 834 704 L797 589 Q646 545 481 706Z" fill="#252b39"/><ellipse cx="590" cy="715" rx="15" ry="22" fill="#252b39"/><ellipse cx="718" cy="715" rx="15" ry="22" fill="#252b39"/><ellipse cx="658" cy="845" rx="40" ry="45" fill="#8c4e41"/><path d="M549 662 L610 648 M696 648 L759 662" stroke="#252b39" stroke-width="12" stroke-linecap="round"/>`;
        body += rect(55, 213, 452, 133, accent, 'rx="5"');
        sample.titleLines.forEach((s, i) => {
            body += text(t.spec.title.x, t.spec.title.y + i * t.spec.title.lineHeight, s, t.spec.title.fontSize, i === 1 ? '#151923' : ink, t.spec.title.weight);
        });
        body += text(68, 565, sample.subtitle, 30, ink, 600);
    } else if (t.recipe === 'life-story') {
        body += rect(52, 52, 796, 512, '#d9dfd1') + rect(52, 632, 796, 486, '#d7dfc7');
        body += rect(578, 82, 238, 280, '#f4f1db') + line(693, 82, 693, 362, '#b4bfa6') + line(578, 218, 816, 218, '#b4bfa6');
        body += rect(52, 405, 796, 113, '#b99570') + `<path d="M168 481 Q171 323 316 328 Q440 332 468 481Z" fill="#7f8e78"/><ellipse cx="316" cy="249" rx="73" ry="89" fill="#d4b79c"/><path d="M242 252 Q223 139 317 143 Q413 140 389 252 L359 210 Q301 197 242 252Z" fill="#363b36"/>`;
        body += `<path d="M412 1118 Q439 945 574 946 Q722 950 736 1118Z" fill="#7f8e78"/><ellipse cx="581" cy="873" rx="73" ry="89" fill="#d4b79c"/><path d="M507 876 Q488 763 582 767 Q678 764 654 876 L624 834 Q566 821 507 876Z" fill="#363b36"/>`;
        body += title(sample, t) + rect(52, 578, 796, 45, soft) + text(83, 609, sample.subtitle, 25, ink, 600);
        body += text(78, 532, sample.points[0], 25, ink, 700) + text(78, 681, sample.points[1], 25, ink, 700);
    } else throw new Error(`Unknown recipe: ${t.recipe}`);
    body += text(66, 1160, `${label} · NOVA CONTENT HUB`, 16, t.recipe === 'neon' ? '#aec1d5' : ink, 500, 'letter-spacing="1"');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200" role="img" aria-labelledby="title desc"><title id="title">${esc(t.name)} · ${label}</title><desc id="desc">${esc(sample.titleLines.join('') + '。' + t.desc + '。原创矢量参考，未经过 AI 还原测试。')}</desc><g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">${body}</g></svg>\n`;
}

const ids = new Set();
assert.equal(catalog.schema, 1);
assert.equal(catalog.version, 4);
assert.equal(catalog.templates.length, 15);
assert.equal(catalog.templates.filter(t => t.audience === 'general').length, 11);
assert.equal(catalog.templates.filter(t => t.audience === 'ai').length, 4);
assert.equal(legacyV1.version, 1);
assert.equal(legacyV1.templates.length, 6);
assert.equal(legacyDraft.version, 2);
assert.equal(legacyDraft.templates.length, 12);
assert(legacyDraft.templates.every(t => t.generatedReferences.length === 0));
assert.equal(legacyComplete.version, 2);
assert.equal(legacyComplete.templates.length, 12);
assert.equal(legacyComplete.templates.flatMap(t => t.generatedReferences).length, 6);
assert.equal(generatedFiles.length, 30);
for (const t of legacy.filter(t => t.version < 3)) {
    for (let i = 0; i < t.assets.length; i++) {
        const a = t.assets[i];
        assert.equal(fs.readFileSync(path.join(root, '原型', a.path), 'utf8'), render(t, t.samples[i], a.role), `Legacy asset changed: ${a.path}`);
    }
}
for (const t of catalog.templates) {
    assert.match(t.id, /^builtin-[a-z-]+$/);
    assert(!ids.has(t.id));
    ids.add(t.id);
    assert.equal(t.ratio, '3:4');
    assert.equal(t.provenance.aiTested, false);
    assert.equal(t.version, 4);
    assert.equal(t.definitionVersion, 4);
    assert(['general', 'ai'].includes(t.audience));
    for (const key of ['scenario', 'contentType']) assert.equal(typeof t[key], 'string');
    assert(t.useCases.length > 0);
    assert(t.anatomy.length >= 2);
    assert(t.anatomy.some(a => a.editable));
    assert(t.anatomy.some(a => !a.editable));
    for (const a of t.anatomy) {
        for (const key of ['region', 'role', 'rule']) assert.equal(typeof a[key], 'string');
        assert.equal(typeof a.editable, 'boolean');
    }
    const g = t.generation;
    for (const key of ['intent', 'subjectPolicy', 'textPolicy', 'referencePolicy', 'promptTemplate']) assert.equal(typeof g[key], 'string');
    assert(g.negative.length > 0);
    assert(g.negative.every(s => typeof s === 'string'));
    assert(g.qualityChecks.length >= 5);
    const vars = new Set();
    for (const v of g.variables) {
        assert.match(v.key, /^[a-zA-Z][a-zA-Z0-9]*$/);
        assert(!vars.has(v.key));
        vars.add(v.key);
        assert.equal(typeof v.required, 'boolean');
        assert.equal(typeof v.example, 'string');
        assert.equal(typeof v.label, 'string');
    }
    for (const match of g.promptTemplate.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)) assert(vars.has(match[1]), `Unknown prompt variable: ${match[1]}`);
    assert(Array.isArray(t.generatedReferences));
    assert.equal(t.generatedReferences.length, 2);
    for (const r of t.generatedReferences) {
        assert.equal(r.origin, 'ai-generated');
        assert.equal(r.accepted, false);
        const reused = legacyV3.templates.find(old => old.id === t.id)?.generatedReferences.find(old => old.id === r.id);
        if (reused) assert.deepEqual(r, reused, 'Historical reference provenance must stay unchanged');
        else assert.equal(r.templateVersion, 4);
        const stem = r.templateVersion === 4 ? `${t.recipe}-group-v4` : `${t.recipe}-v${r.templateVersion}`;
        assert.equal(r.id, r.templateVersion === 4 ? `${t.id}-group-reference-v4` : `${t.id}-ai-reference-v${r.templateVersion}`);
        assert.equal(r.path, `图库/AI参考/${stem}.png`);
        assert(fs.existsSync(path.join(root, '原型', r.path)));
        assert.equal(r.promptFile, `assets/ai-reference-prompts/${stem}.md`);
        assert(fs.existsSync(path.join(root, r.promptFile)));
        const png = fs.readFileSync(path.join(root, '原型', r.path));
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), r.width);
        assert.equal(png.readUInt32BE(20), r.height);
        assert.equal(r.width * 4, r.height * 3, 'AI reference must be actual 3:4');
        assert(r.width >= 1080 && r.height >= 1440, 'AI reference must be high resolution');
        const recorded = referenceFiles.get(path.basename(r.path));
        assert(recorded, 'AI reference must be in generated-files.json');
        assert.equal(recorded.width, r.width);
        assert.equal(recorded.height, r.height);
        assert.equal(recorded.bytes, png.length);
        assert.equal(recorded.sha256, createHash('sha256').update(png).digest('hex'));
        const prompt = fs.readFileSync(path.join(root, r.promptFile), 'utf8');
        assert(prompt.length > 100, 'Reference prompt must be recorded');
    }
    const structure = legacyComplete.templates.find(old => old.id === t.id);
    if (structure) {
        assert.deepEqual(t.assets, structure.assets, 'Historical SVG assets must stay unchanged');
        assert.deepEqual(t.spec, structure.spec, 'SVG coordinates describe historical structure only');
        assert.deepEqual(t.samples, structure.samples);
    } else assert(['tech-collage', 'big-head', 'life-story'].includes(t.recipe), 'New templates require an explicit original recipe');
    assert.equal(t.assets.length, 2);
    assert.equal(t.samples.length, 2);
    assert.notEqual(t.samples[0].titleLines.join(''), t.samples[1].titleLines.join(''));
    for (let i = 0; i < 2; i++) {
        const a = t.assets[i], sample = t.samples[i];
        assert.equal(a.width, 900);
        assert.equal(a.height, 1200);
        assert.equal(a.path, `图库/内置模板/${t.recipe}-v${structure ? 2 : 3}-${a.role}.svg`);
        assert(sample.titleLines.length <= t.spec.title.maxLines);
        sample.titleLines.forEach(s => assert([...s].length <= t.spec.title.maxCharsPerLine));
        const assetFile = path.join(root, '原型', a.path);
        if (!structure && !check) fs.writeFileSync(assetFile, render(t, sample, a.role));
        const svg = fs.readFileSync(assetFile, 'utf8');
        if (!structure) assert.equal(svg, render(t, sample, a.role), 'Rebuild new original SVG structure asset');
        assert(!/<(?:script|image|foreignObject)\b|\bon\w+\s*=|(?:href|url)\s*[=(]/i.test(svg));
    }
    assert.equal(t.img, t.generatedReferences[0].path);
    assert.deepEqual(t.shots, t.generatedReferences.map(a => a.path));
    assert.equal(t.validation.referenceImage, t.img);
    assert.equal(t.validation.aiTested, false);

}
assert.deepEqual([...referenceFiles.keys()].sort(), catalog.templates.flatMap(t => t.generatedReferences.map(r => path.basename(r.path))).sort(), 'Reference inventory must exactly match catalog');
const js = `/* Generated by builtin-templates/generate.mjs. Edit catalog.json instead. */\n(function(root){\n  const templates = ${JSON.stringify(catalog.templates, null, 2)};\n  const legacy = ${JSON.stringify(legacy, null, 2)};\n  if(typeof module === 'object' && module.exports) { module.exports = templates; module.exports.legacy = legacy; }\n  if(root) { root.NCH_BUILTIN_TEMPLATES = templates; root.NCH_BUILTIN_LEGACY = legacy; }\n})(typeof window !== 'undefined' ? window : null);\n`;
const browserFile = path.join(root, '原型', 'builtin-templates.js');
if (check) assert.equal(fs.readFileSync(browserFile, 'utf8'), js, 'Rebuild builtin-templates.js');
else fs.writeFileSync(browserFile, js);
console.log(`${check ? 'Verified' : 'Generated'} ${catalog.templates.length} v4 template groups (11 general / 4 AI), 36 preserved and 6 new SVG structure assets, ${catalog.templates.reduce((n, t) => n + t.generatedReferences.length, 0)} PNG visual references and ${legacy.length} legacy definitions.`);
