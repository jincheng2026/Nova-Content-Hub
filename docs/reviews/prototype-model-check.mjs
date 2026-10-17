// Historical 2026-10-16 audit: asserts defects in the pre-upgrade snapshot.
// These assertions should fail after fixes. Use `npm run verify` for the current product prototype.
// Each context uses an isolated in-memory localStorage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const dataPath = new URL('../../原型/data.js', import.meta.url);
const appPath = new URL('../../原型/app.js', import.meta.url);
const dataSource = readFileSync(dataPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');
const storage = new Map();
function load() {
  const context = vm.createContext({
    window: {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  });
  vm.runInContext(dataSource, context, { filename: dataPath.pathname });
  return context.window.NCH;
}

const observations = [];
const first = load();
first.PROJECTS.push({ id: 'audit-only', name: '内存诊断，不写业务库' });
const reloaded = load();
assert.equal(reloaded.byId('audit-only'), undefined);
observations.push({ case: 'business-state-reload', observed: '内存新增内容在重新初始化后消失' });

first.chanSetNeed('抖音', '方图');
assert.equal(first.chanOf('抖音').need, '方图');
assert.equal(load().chanOf('抖音').need, '竖版');
observations.push({ case: 'builtin-channel-reload', observed: '内置渠道修改规格后重新初始化恢复默认值' });

first.chanAdd('诊断渠道');
first.chanSetNeed('诊断渠道', '横版');
assert.equal(load().chanOf('诊断渠道').need, '横版');
observations.push({ case: 'custom-channel-control', observed: '对照组：自定义渠道规格可以跨初始化保存' });

assert.equal(first.presetOfRatio('3:4'), '竖版');
assert.equal(first.presetOfRatio('1080:1440'), '');
assert.equal(first.isCustomFmt('1080:1440'), true);
observations.push({ case: 'equivalent-ratios', observed: '3:4识别为竖版，1080:1440识别为另一自定义规格' });

const start = appSource.indexOf('  const normDate = v => {');
const end = appSource.indexOf('\n\n  /*', start);
assert.ok(start >= 0 && end > start, 'normDate source location changed; update this diagnostic');
const dateContext = vm.createContext({ D: { TODAY: '2026-10-16' } });
vm.runInContext(appSource.slice(start, end) + '\nglobalThis.auditNormDate = normDate;', dateContext);
assert.equal(dateContext.auditNormDate('2026-99-99'), '2026-99-99');
assert.equal(dateContext.auditNormDate('2026-02-30'), '2026-02-30');
assert.equal(dateContext.auditNormDate('2026-10-16'), '2026-10-16');
observations.push({ case: 'invalid-calendar-dates', observed: '2026-99-99和2026-02-30通过日期规范化；有效日期对照也通过' });

const project = reloaded.PROJECTS.find(p => p.kind === '内容');
project.posts = [{ id: 'audit-post', date: '2026-10-17', time: '12:00', channel: '抖音', pub: { at: '2026-10-19', link: '' } }];
assert.equal(reloaded.postsOn('2026-10-19').some(p => p.id === 'audit-post'), false);
assert.equal(reloaded.postsOn('2026-10-17').some(p => p.id === 'audit-post'), true);
observations.push({ case: 'planned-vs-actual-calendar', observed: '计划17日实际19日发布，postsOn仍归17日；需明确日历展示口径' });

const hash = source => createHash('sha256').update(source).digest('hex');
console.log(JSON.stringify({
  scope: '源码模型隔离诊断，非DOM/浏览器/真实宿主/生产数据测试；断言确认当前缺陷表现，非修复后通过',
  sourceSha256: { '原型/data.js': hash(dataSource), '原型/app.js': hash(appSource) },
  observations,
}, null, 2));
