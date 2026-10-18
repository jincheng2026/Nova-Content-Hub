const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync('原型/styles.css', 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, value]) => [name, value]));

function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}

function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
}

test('semantic foregrounds retain readable contrast on their actual surfaces', () => {
    const pairs = [['card', 'brand'], ['card', 'brand-hi'], ['brand', 'brand-bg'], ['brand-hi', 'brand-line'], ['attention', 'attention-bg'], ['warn', 'warn-bg'], ['ok', 'ok-bg'], ['run', 'run-bg']];
    for (const fg of ['ink', 'ink2', 'ink3']) for (const bg of ['page', 'card', 'fill', 'fill2']) pairs.push([fg, bg]);
    for (const [fg, bg] of pairs) assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${fg} / ${bg} must reach 4.5:1`);
    assert.doesNotMatch(css, /rgba\(\s*228\s*,\s*0\s*,\s*75|#fbdfe9/i, 'remove the old red glow and pink waiting hover');
});
test('all 13 demo illustrations are original local geometry with safe SVG elements', () => {
    const dir = '原型/图库/示例';
    const names = fs.readdirSync(dir).sort();
    assert.deepEqual(names, ['avatar.svg', ...Array.from({length: 10}, (_, i) => `cover-${String(i + 1).padStart(2, '0')}.svg`), 'sample.svg', 'selected.svg'].sort());
    const allowed = new Set(['svg', 'title', 'desc', 'g', 'rect', 'circle', 'path', 'text']);
    for (const name of names) {
        const svg = fs.readFileSync(path.join(dir, name), 'utf8');
        assert.match(svg, /原创几何插画/);
        assert.match(svg, /虚构演示素材/);
        assert.doesNotMatch(svg, /<image|<script|\bhref\s*=|foreignObject|data:|\bon\w+\s*=/i);
        for (const [, element] of svg.matchAll(/<\/?([\w:-]+)/g)) assert.ok(allowed.has(element), `${name}: unexpected element ${element}`);
        assert.match(svg, /<title>[^<]+<\/title>/);
    }
    const avatar = fs.readFileSync(path.join(dir, 'avatar.svg'), 'utf8');
    assert.match(avatar, /viewBox="0 0 800 800"/, 'the avatar uses a square composition for profile crops');
});
