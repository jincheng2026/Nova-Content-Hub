/* 创作页界面：一个外壳（主干）加按内容类型长出的枝干。纯原生 JS，不依赖网络。
 * 页面上的一切都从 jc-doc 数据块画出来；所有编辑都交给保存脚本 kit（window.jcKit）写回文件：
 * 文本框带 data-item / data-field 由 kit 自动保存；按钮类操作（采纳、撤销、用这一版等）走 jcKit.edit，
 * 一次要改好几格的操作用同一个 group 提交，保存服务保证全成或全不成。
 * 本脚本必须放在 kit 后面加载：它在解析期间同步画出格子（只读、带 data-jc-wait），kit 在 DOMContentLoaded 时接管并解锁。
 * 加新内容类型：在下面的 TYPES 配置表里加一行，需要新模块时写一个模块函数并在 modules 里列上。
 *
 * 模板只有一份：保存服务按 /p/ 提供页面时，会把页面里的这份脚本换成模板目录里的当前版本，所以旧页面也跑新脚本。
 * 因此这里读 jc-doc 一律「只加不删」地兼容：可选的键缺了照样能显示（按没有处理），不认识的键、字段、条目种类不报错，
 * 由兜底模块 extras 按原样列出（可改字段照样能改、能存）。最后一行的结束标记不能删，保存服务靠它判断文件没写一半。
 */
(function () {
  'use strict';

  // ======================= 类型 → 模块 配置表 =======================
  // 主干模块（所有类型都有）：
  //   topbar 顶栏、compare 段落对照区、notes 写给 AI 的话、suggestions 建议卡、reading 通读视图、history 改动痕迹、copy 复制提词稿与复制给 AI、
  //   extras 兜底（专门模块还没做的格子和条目按原样列出）、spare 参考里有、这一稿没用上的段落（页面信息 spare_refs 有内容才显示）
  // 枝干模块（按类型打开）：narrative 叙事卡；visual 画面栏（段落的画面类型、我方画面）；steps 录屏步骤（step 条目）；
  //   record 录制视图（整篇排成录屏清单，能复制给剪辑的画面脚本）。参考上的角色、对方画面、本地原片是主干就认的，有就显示
  // 建议类别的默认筛选：defaultCategories 是默认只看哪几类，只在 filterStages 列的阶段（以及以后的审稿视图）生效；
  //   其他阶段（例如写稿）默认显示全部类别。锦成点过类别按钮后按阶段分别记住。
  var TRUNK = ['topbar', 'compare', 'notes', 'suggestions', 'reading', 'history', 'copy', 'extras', 'spare'];
  var TYPES = {
    '口播': {
      modules: TRUNK.concat(['narrative']),
      stages: ['写稿', '审稿', '定稿'],
      narrativeOpen: true,                    // 叙事卡默认展开
      showRole: true,                         // 段标题旁显示这段的作用
      sugTitle: '修改建议',
      sugNote: '只有点「采纳」，锦成版才会改动',
      defaultCategories: ['衔接', '拗口', '口径'],
      filterStages: ['审稿'],                 // 默认筛选只在审稿阶段生效；写稿阶段默认显示全部类别
      openingSeconds: 5                       // 通读视图里的开头 5 秒线
    },
    'AI教程': {
      modules: TRUNK.concat(['narrative', 'visual', 'steps', 'record']),
      stages: ['写稿', '审稿', '定稿', '录制准备'],
      narrativeOpen: true, showRole: true,
      sugTitle: '修改建议', sugNote: '只有点「采纳」，锦成版才会改动',
      defaultCategories: null, filterStages: ['审稿'], openingSeconds: 5,
      // 画面类型的选项，都是锦成自己的叫法（「口播就好」「录屏」「截图出镜」「AI 生成画面」「替换画面交给剪辑」）；数据里有表外的值照样显示
      visualTypes: ['真人口播', '录屏', '截图', '图片', 'AI 画面', '实拍', '字卡', '交给剪辑'],
      recordStage: '录制准备'                 // 到这个阶段默认打开录制视图（锦成点过视图按钮就按他点的）
    }
    // 'AI科普': { modules: TRUNK.concat(['narrative', 'coloring']), defaultCategories: ['事实', …], filterStages: ['审稿'], … }  以后加
  };
  var TRUNK_ONLY = {
    modules: TRUNK, stages: ['写稿', '审稿', '定稿', '录制准备'], narrativeOpen: false, showRole: false,
    sugTitle: '修改建议', sugNote: '只有点「采纳」，锦成版才会改动', defaultCategories: null, filterStages: ['审稿'], openingSeconds: 5
  };
  var REVIEW_VIEW = 'review'; // 审稿视图（左边全文、右边一列建议卡）还没做；做了以后在这个视图里也按默认筛选
  var CATEGORIES = ['表达', '衔接', '拗口', '口径', '事实'];
  var BASIS_CLASS = { '参考口播': 'b-voice', '参考画面': 'b-visual', '你之前定的': 'b-you', 'AI 自己的判断': 'b-ai', '运营': 'b-op' };
  var VERDICT_CLASS = { '已定要改': 'v-must', '待你定': 'v-wait', '等录屏再定': 'v-rec', '不用改': 'v-keep' };
  // 数据值只在显示时换说法：文件里的值、比较和复制给 AI 的清单一律用原值
  var VERDICT_TEXT = { '已定要改': '需要修改', '待你定': '建议修改', '等录屏再定': '录屏后再定', '不用改': '无需修改' };
  var DECISION_TEXT = { '采纳': '已采纳', '不采纳': '未采纳' }; // 「部分采纳」原样显示
  var BASIS_TEXT = { '你之前定的': '此前的决定', 'AI 自己的判断': 'AI 自行判断' }; // 「参考口播」「运营」原样
  var SOURCE_TEXT = { 'AI': 'AI 建议', '运营': '运营建议' };
  var FIELD_LABEL = { mine: '锦成版', note: '写给 AI 的话', proposed: '改成', decision: '决定', overall_note: '整体意见', approved: '内容已确认', recorded: '录完的定稿',
    our_visual: '我方画面', visual_type: '画面类型', prompt: '要发送的内容' };
  // 兜底模块用的叫法；不在表里的键直接显示键名。step 和画面相关的键是教程枝干的暂定名（和 creation_doc.py 的 KIND_LABELS、KEY_LABELS 一致）
  var KIND_LABEL = { info: '页面信息', segment: '段落', suggestion: '建议', step: '录屏步骤' };
  var LOCKED_LABEL = { visual: '画面', where: '在哪发', line: '对应口播', expect: '发完应该看到', caution: '录之前注意', role: '角色', video: '本地原片', why: '为什么没用上' };
  var REF_ROLE_CLASS = { '对标': 'r-main', '补充参考': 'r-extra', '效果样例': 'r-sample' };
  // 各种条目里有专门模块画的键；其余的键由兜底模块 extras 按原样列出。以后枝干模块画了哪些键，就加进这里
  var OWN_FIELDS = { info: ['overall_note', 'approved', 'recorded'], segment: ['mine', 'note'], suggestion: ['proposed', 'decision'] };
  var OWN_LOCKED = {
    info: ['type', 'stage', 'title', 'narrative', 'speech_rate', 'ai_state', 'spare_refs'],
    segment: ['order', 'title', 'role', 'refs', 'baseline', 'ai_state', 'teleprompter'],
    suggestion: ['segment', 'category', 'source', 'original', 'reason', 'basis', 'verdict', 'ai_state']
  };
  var REF_OWN = ['who', 'source_type', 'time', 'text', 'url', 'role', 'visual', 'video', 'why'];
  var EXPLAIN = '说明'; // 参考里的「说明」：不是谁的原话，用灰色说明样式，不显示时间和「看原片」，不参与「连续 8 字相同」
  var MERGE_MS = 2 * 60 * 1000; // 改动记录：两分钟内的保存合并算一版
  // 窄屏版式的分界，和 style.css 里两个顶栏媒体查询（min-width: 1200px / max-width: 1199px）保持一致。
  // 锦成常在客户端右侧约 650（有时 380）宽的面板里看；宽屏三行顶栏的第二行要约 1190 宽才排得下（「内容已确认」带上日期时最宽），
  // 再窄就会折成四五行、钉住的部分一下变高，所以 1200 以下一律用两行细条
  var COMPACT_MQ = '(max-width: 1199px)';

  // ======================= 读数据 =======================
  var root = document.getElementById('app');
  var raw = null;
  try { raw = JSON.parse(document.getElementById('jc-doc').textContent); } catch (e) { raw = null; }
  if (!root) return;
  if (!raw || !Array.isArray(raw.items)) {
    root.textContent = '';
    root.appendChild(h('div', { class: 'fatal' }, '页面数据读不出来，无法显示。请让 AI 重新生成这个页面。'));
    return;
  }
  var kit = window.jcKit || null;
  var PID = raw.page_id || '';
  var byId = {}, info = null, segs = [], sugs = [], others = []; // others：不认识种类的条目（例如录屏步骤），交给兜底模块
  raw.items.forEach(function (it, i) {
    if (!it || !it.id) return;
    if (!it.locked || typeof it.locked !== 'object') it.locked = {};
    if (!it.fields || typeof it.fields !== 'object') it.fields = {};
    var kind = typeof it.kind === 'string' && it.kind ? it.kind : (String(it.id).indexOf('info-') === 0 ? 'info' : ('original' in it.locked && 'segment' in it.locked ? 'suggestion' : 'segment'));
    it._kind = kind; it._pos = i;
    byId[it.id] = it;
    if (kind === 'info') { if (!info) info = it; } else if (kind === 'suggestion') sugs.push(it); else if (kind === 'segment') segs.push(it); else others.push(it);
  });
  segs.sort(function (a, b) {
    var x = Number(a.locked.order), y = Number(b.locked.order);
    x = isFinite(x) ? x : 1e9 + a._pos; y = isFinite(y) ? y : 1e9 + b._pos;
    return x - y || a._pos - b._pos;
  });
  segs.forEach(function (s, i) { s._no = i + 1; });
  if (!info) info = { id: '', locked: {}, fields: {}, _kind: 'info' };
  var TYPE = String(info.locked.type || '');
  var CFG = TYPES[TYPE] || TRUNK_ONLY;
  // 锦成的语速：平均每秒约 7 个字，快慢不超过 0.5 个字（2026-09-27 他本人说的）。页面信息里写了就按写的算
  var RATE = Number(info.locked.speech_rate) > 0 ? Number(info.locked.speech_rate) : 7, RATE_SPREAD = 0.5;
  var STAGE = String(info.locked.stage || '');
  function has(mod) { return CFG.modules.indexOf(mod) >= 0; }
  // 枝干模块画了的键和条目，兜底模块就不再重复列：画面栏管段落的画面类型、我方画面；录屏步骤模块管 step 条目
  if (has('visual')) OWN_FIELDS.segment = OWN_FIELDS.segment.concat(['visual_type', 'our_visual']);
  var steps = [];
  if (has('steps')) {
    others = others.filter(function (o) { if (o._kind === 'step') { steps.push(o); return false; } return true; });
    steps.sort(function (a, b) {
      var x = Number(a.locked.order), y = Number(b.locked.order);
      x = isFinite(x) ? x : 1e9 + a._pos; y = isFinite(y) ? y : 1e9 + b._pos;
      return x - y || a._pos - b._pos;
    });
    steps.forEach(function (st, i) { st._no = i + 1; });
  }
  function stepsOf(seg) { return steps.filter(function (st) { return st.locked.segment === seg.id; }); }
  // 参考分析（主干就认，编导的功课）：每段一条 refnote、全片一条 skeleton，不交给兜底模块
  var refnoteOf = {}, skeleton = null;
  others = others.filter(function (o) {
    if (o._kind === 'refnote') { var sg = o.locked.segment; if (sg && !refnoteOf[sg]) refnoteOf[sg] = o; return false; }
    if (o._kind === 'skeleton') { if (!skeleton) skeleton = o; return false; }
    return true;
  });
  function sugsOf(seg) { return sugs.filter(function (s) { return s.locked.segment === seg.id; }); }
  function segOf(sug) { return byId[sug.locked.segment] || null; }

  // ======================= 小工具 =======================
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'hidden') el.hidden = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids == null || kids === false) return el;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (k) {
      if (k == null || k === false) return;
      if (Array.isArray(k)) return add(el, k); // 嵌套的数组摊平
      el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function norm(v) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').normalize('NFC'); }
  function same(a, b) { return norm(a) === norm(b); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayTime(t) { var d = new Date(t); return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + hhmm(d); }
  function shortTime(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hhmm(d); }
  function isoNow() {
    var d = new Date(), o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-';
    o = Math.abs(o);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + hhmm(d) + ':' + pad(d.getSeconds()) + s + pad(Math.floor(o / 60)) + ':' + pad(o % 60);
  }
  function lsGet() { try { return JSON.parse(localStorage.getItem('jc-cp-' + PID) || '{}') || {}; } catch (e) { return {}; } }
  function lsSet(o) { try { localStorage.setItem('jc-cp-' + PID, JSON.stringify(o)); } catch (e) { /* 存不了就算了 */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* 存不了就算了 */ } }
  function snippet(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  function isEditable(el) { return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.isContentEditable); }

  // 字数：汉字、字母、数字各算一个（和 T020 对照页一样）；秒数按页面信息里的每秒字数
  var COUNTED = /[\p{Script=Han}\p{L}\p{N}]/gu;
  function chars(t) { var m = String(t || '').match(COUNTED); return m ? m.length : 0; }
  function secs(n) { return Math.round(n / RATE); }
  function fmtSecs(s) { return s < 60 ? s + ' 秒' : Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒'; }
  function countOcc(hay, needle) { // 重叠出现也算
    hay = norm(hay); needle = norm(needle);
    if (!needle) return 0;
    var n = 0, i = hay.indexOf(needle);
    while (i >= 0) { n++; i = hay.indexOf(needle, i + 1); }
    return n;
  }

  // ---------- 删改对比（逐字，Myers 算法），用在「和底稿比」「改动记录」「建议的改法」「复制给 AI」 ----------
  function diffChars(a, b) {
    var A = Array.from(norm(a)), B = Array.from(norm(b)), pre = 0, suf = 0;
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    var mid = myers(A.slice(pre, A.length - suf), B.slice(pre, B.length - suf)), out = [];
    if (pre) out.push([0, A.slice(0, pre).join('')]);
    mid.forEach(function (op) { out.push(op); });
    if (suf) out.push([0, A.slice(A.length - suf).join('')]);
    return tidy(out);
  }
  function myers(a, b) {
    var n = a.length, m = b.length, max = n + m;
    if (!n && !m) return [];
    if (!n) return [[1, b.join('')]];
    if (!m) return [[-1, a.join('')]];
    var off = max + 1, V = new Int32Array(2 * max + 3), trace = [];
    for (var d = 0; d <= max; d++) {
      if (d > 900) return [[-1, a.join('')], [1, b.join('')]]; // 差得太多：整段换，免得算太久
      trace.push(V.slice());
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1, y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= n && y >= m) return back(trace, a, b, off, d);
      }
    }
    return [[-1, a.join('')], [1, b.join('')]];
  }
  function back(trace, a, b, off, dEnd) {
    var x = a.length, y = b.length, ops = [];
    for (var d = dEnd; d > 0; d--) {
      var V = trace[d], k = x - y;
      var pk = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? k + 1 : k - 1;
      var px = V[off + pk], py = px - pk;
      while (x > px && y > py) { ops.push([0, a[x - 1]]); x--; y--; }
      if (x === px) { ops.push([1, b[y - 1]]); y--; } else { ops.push([-1, a[x - 1]]); x--; }
    }
    while (x > 0 && y > 0) { ops.push([0, a[x - 1]]); x--; y--; }
    return ops.reverse();
  }
  function tidy(ops) {
    // 先合并同类；再把夹在两处改动之间、不超过 2 个字的相同片段并进改动，读起来不碎
    var m = [];
    ops.forEach(function (o) { if (!o[1]) return; var last = m[m.length - 1]; if (last && last[0] === o[0]) last[1] += o[1]; else m.push([o[0], o[1]]); });
    for (var i = 1; i < m.length - 1; i++) {
      if (m[i][0] === 0 && Array.from(m[i][1]).length <= 2 && m[i - 1][0] !== 0 && m[i + 1][0] !== 0) m.splice(i, 1, [-1, m[i][1]], [1, m[i][1]]);
    }
    var out = [], del = '', ins = '';
    function flushOut() { if (del) out.push([-1, del]); if (ins) out.push([1, ins]); del = ins = ''; }
    m.forEach(function (o) { if (o[0] === -1) del += o[1]; else if (o[0] === 1) ins += o[1]; else { flushOut(); out.push(o); } });
    flushOut();
    return out;
  }
  function diffStat(ops) {
    var d = 0, a = 0;
    ops.forEach(function (o) { if (o[0] < 0) d += chars(o[1]); else if (o[0] > 0) a += chars(o[1]); });
    return { del: d, add: a, changed: ops.some(function (o) { return o[0] !== 0; }) };
  }
  function diffNode(ops) {
    var box = h('div', { class: 'diff' });
    ops.forEach(function (o) { box.appendChild(o[0] === 0 ? document.createTextNode(o[1]) : h(o[0] < 0 ? 'del' : 'ins', null, o[1])); });
    return box;
  }
  function critic(ops) {
    var out = '';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o[0] === -1 && ops[i + 1] && ops[i + 1][0] === 1) { out += '{~~' + o[1] + '~>' + ops[i + 1][1] + '~~}'; i++; }
      else if (o[0] === -1) out += '{--' + o[1] + '--}';
      else if (o[0] === 1) out += '{++' + o[1] + '++}';
      else out += o[1];
    }
    return out;
  }

  // ---------- 和参考连续 8 字相同：只数汉字、字母、数字，忽略空格和标点 ----------
  function seq(text) {
    var out = { ch: [], at: [], len: [] }, re = new RegExp(COUNTED.source, 'gu'), m;
    text = String(text || '');
    while ((m = re.exec(text))) { out.ch.push(m[0].toLowerCase()); out.at.push(m.index); out.len.push(m[0].length); }
    return out;
  }
  function sameRanges(text, others, N) {
    N = N || 8;
    var t = seq(text), grams = {}, i, j;
    if (t.ch.length < N) return [];
    others.forEach(function (o) { var s = seq(o); for (var k = 0; k + N <= s.ch.length; k++) grams[s.ch.slice(k, k + N).join('')] = true; });
    var cover = new Uint8Array(t.ch.length);
    for (i = 0; i + N <= t.ch.length; i++) if (grams[t.ch.slice(i, i + N).join('')]) for (j = i; j < i + N; j++) cover[j] = 1;
    var out = [];
    for (i = 0; i < cover.length; i++) {
      if (!cover[i]) continue;
      j = i; while (j + 1 < cover.length && cover[j + 1]) j++;
      out.push([t.at[i], t.at[j] + t.len[j]]);
      i = j;
    }
    return out;
  }
  function markedText(el, text, ranges, cls, extra) {
    // extra：再叠几层标记，每层 [开始, 结束, 类名]（锦成版里批注框对着的原句；参考原文里讲法点的原句），
    // 可以传一层或一个数组；和 ranges 可以重叠，重叠处几个类名都带上
    clear(el);
    text = String(text || '');
    var ex = !extra ? [] : Array.isArray(extra[0]) ? extra : [extra];
    var cuts = [0, text.length];
    ranges.forEach(function (r) { cuts.push(r[0], r[1]); });
    ex.forEach(function (e) { cuts.push(e[0], e[1]); });
    cuts = cuts.filter(function (x, i, a) { return x >= 0 && x <= text.length && a.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i + 1 < cuts.length; i++) {
      var a = cuts[i], b = cuts[i + 1], names = [];
      if (ranges.some(function (r) { return r[0] <= a && b <= r[1]; })) names.push(cls);
      ex.forEach(function (e) { if (e[0] <= a && b <= e[1] && names.indexOf(e[2]) < 0) names.push(e[2]); });
      var piece = text.slice(a, b);
      el.appendChild(names.length ? h('span', { class: names.join(' ') }, piece) : document.createTextNode(piece));
    }
    return el;
  }

  // ======================= 取值与保存 =======================
  function val(id, field) {
    if (kit && id) { var v = kit.value(id, field); if (v !== undefined) return v == null ? '' : String(v); }
    var it = byId[id];
    return it && it.fields && it.fields[field] != null ? String(it.fields[field]) : '';
  }
  function hasField(it, field) { return !!it && !!it.fields && Object.prototype.hasOwnProperty.call(it.fields, field); }
  function aiState(it) { var s = it && it.locked ? it.locked.ai_state : null; return s && typeof s === 'object' ? s : {}; }
  function kitReady() { return !!(kit && kit.ready && !kit.failed); }

  // 撤销：按页面上的操作一步一步退，每一步是把格子改回旧值（改回去本身也写回文件）
  var UNDO_KEY = 'jc-cp-undo-' + PID;
  var undoStack = [], redoStack = [];
  try { var us = JSON.parse(ssGet(UNDO_KEY) || '{}'); undoStack = us.u || []; redoStack = us.r || []; } catch (e) { undoStack = []; redoStack = []; }
  function saveUndo() { ssSet(UNDO_KEY, JSON.stringify({ u: undoStack.slice(-60), r: redoStack.slice(-60) })); updateUndoBtn(); }
  function applySteps(steps, label, opts) {
    opts = opts || {};
    steps = steps.filter(function (s) { return !same(s.old, s.new); });
    if (!steps.length) return Promise.resolve(true);
    if (!kitReady()) { toast(kit && kit.failed ? '保存功能出错，无法修改：' + kit.failed : '保存功能启动中，请稍后再试'); return Promise.resolve(false); }
    var list = steps.map(function (s) { return { item: s.item, field: s.field, value: s.new }; });
    return kit.edit(list, steps.length > 1 ? { group: true } : {}).then(function (r) {
      if (!r.ok) { toast(r.message || '操作未完成，请重试'); return false; }
      var rec = steps.filter(function (s) { return !s.noUndo; }); // 顺带一起提交、但撤销时不退回的格子（例如采纳时改过的「改成」）
      if (!opts.noUndo && rec.length) { undoStack.push({ label: label, steps: rec }); redoStack = []; saveUndo(); }
      refreshAfterValues();
      return true;
    });
  }
  function undo(redo) {
    var from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
    var st = from.pop();
    if (!st) { toast(redo ? '没有可以重做的操作' : '没有可以撤销的操作'); saveUndo(); return; }
    var key = redo ? 'old' : 'new', target = redo ? 'new' : 'old';
    var moved = st.steps.filter(function (s) { return !same(val(s.item, s.field), s[key]); });
    if (moved.length) { saveUndo(); toast('「' + st.label + '」之后，这' + (moved.length > 1 ? '几' : '一') + '处内容又被修改过（可能是 AI 或其他窗口）。为了不覆盖后来的改动，这次没有' + (redo ? '重做' : '撤销') + '。'); return; }
    if (!kitReady()) { from.push(st); toast('保存功能启动中，请稍后再试'); return; }
    kit.edit(st.steps.map(function (s) { return { item: s.item, field: s.field, value: s[target] }; }), st.steps.length > 1 ? { group: true } : {}).then(function (r) {
      if (!r.ok) { from.push(st); saveUndo(); toast(r.message || (redo ? '重做未完成，请重试' : '撤销未完成，请重试')); return; }
      to.push(st); saveUndo();
      toast((redo ? '已重做：' : '已撤销：') + st.label);
      refreshAfterValues();
    });
  }
  // 在文本框里打字也算一步：离开这一格时记下「进来时的值 → 离开时的值」
  var typingStart = {};
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'TEXTAREA' || !t.hasAttribute('data-field')) return;
    typingStart[t.getAttribute('data-item') + '|' + t.getAttribute('data-field')] = t.value;
  });
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'TEXTAREA' || !t.hasAttribute('data-field')) return;
    var item = t.getAttribute('data-item'), field = t.getAttribute('data-field'), key = item + '|' + field;
    if (!(key in typingStart)) return;
    var old = typingStart[key]; delete typingStart[key];
    if (t.classList.contains('jc-kit-locked') || same(old, t.value)) return;
    undoStack.push({ label: '在' + where(item) + '输入的文字', steps: [{ item: item, field: field, old: old, new: t.value }] });
    redoStack = []; saveUndo();
  });
  function where(item) {
    var it = byId[item];
    if (!it) return '这里';
    if (it._kind === 'segment') return '第 ' + it._no + ' 段';
    if (it._kind === 'suggestion') { var s = segOf(it); return (s ? '第 ' + s._no + ' 段' : '') + '建议「' + snippet(it.locked.original, 10) + '」'; }
    if (it._kind === 'info') return '页面信息';
    var os = byId[it.locked.segment];
    return (os && os._kind === 'segment' ? '第 ' + os._no + ' 段的' : '') + kindLabel(it._kind);
  }
  function kindLabel(k) { return KIND_LABEL[k] || ('「' + k + '」条目'); }
  function keyLabel(k) { return FIELD_LABEL[k] || LOCKED_LABEL[k] || k; }
  if (kit && kit.setDescriber) kit.setDescriber(function (item, field) { return where(item) + '的「' + keyLabel(field) + '」'; });

  // ======================= 页面状态（只记在这台浏览器） =======================
  var saved = lsGet();
  var ST = {
    view: saved.view === 'reading' || (saved.view === 'record' && has('record')) ? saved.view : (!saved.view && has('record') && STAGE === CFG.recordStage ? 'record' : 'compare'),
    seg: 0,
    font: Math.min(24, Math.max(14, Number(saved.font) || 17)),
    onlyPending: !!saved.onlyPending,
    catsBy: saved.catsBy && typeof saved.catsBy === 'object' ? saved.catsBy : {}, // 锦成点过的类别筛选，按阶段分别记（旧版只记一份的 cats 不再用）
    refsHidden: saved.refsHidden && typeof saved.refsHidden === 'object' ? saved.refsHidden : {},
    // 叙事卡展开还是收起：宽屏、窄屏分开记（锦成点过才记）；没点过时宽屏按类型配置，窄屏默认收起，第一屏先看稿子。
    // 旧版不管点没点都记一个 narrOpen，只当宽屏的来用
    narrOpenBy: saved.narrOpenBy && typeof saved.narrOpenBy === 'object' ? saved.narrOpenBy : (typeof saved.narrOpen === 'boolean' ? { wide: saved.narrOpen } : {}),
    narrOpen: false,
    baseOpen: {}, // 「和底稿比」锦成手动展开或收起过的段；没动过的按删改多少自动定
    activeSug: null,
    famOpen: {}, // 分析模式下每段展开的是哪一家的原文（只在这个窗口记）
    draftDismissed: {}
  };
  ST.narrOpen = typeof ST.narrOpenBy[layoutMode()] === 'boolean' ? ST.narrOpenBy[layoutMode()] : !!CFG.narrativeOpen && layoutMode() === 'wide';
  var segIdx = ssGet('jc-cp-seg-' + PID) || saved.seg;
  segs.forEach(function (s, i) { if (s.id === segIdx) ST.seg = i; });
  function persist() {
    lsSet({ view: ST.view, font: ST.font, onlyPending: ST.onlyPending, catsBy: ST.catsBy, refsHidden: ST.refsHidden, narrOpenBy: ST.narrOpenBy, seg: segs[ST.seg] ? segs[ST.seg].id : '' });
    ssSet('jc-cp-seg-' + PID, segs[ST.seg] ? segs[ST.seg].id : '');
  }

  // ======================= 画页面 =======================
  var R = {}; // 画出来的元素，按用途存
  var segUi = {}; // 段 id → 这一段的元素
  var cardUi = {}; // 建议 id → 这张卡的元素
  var stepUi = {}; // 录屏步骤 id → 这张卡的元素（页面一开始画段落时就要用，所以放在这里）
  var extraTas = []; // 兜底模块画的文本框，刷新时一起调高度
  clear(root);
  document.documentElement.style.setProperty('--fs', ST.font + 'px');
  if (has('topbar')) root.appendChild(buildTopbar());
  root.appendChild(R.gone = h('div', { class: 'gone-slot', 'data-jc-kit-gone': true }));
  if (!kit) root.appendChild(h('div', { class: 'fatal' }, '保存功能没有启动，改动无法保存，页面已锁定。请告诉 AI 检查这个页面。'));
  if (has('narrative')) root.appendChild(buildNarrative());
  R.main = h('main', { class: 'wrap' });
  root.appendChild(R.main);
  if (has('record')) R.main.appendChild(buildRecordHead());
  if (has('compare')) R.main.appendChild(buildCompare());
  if (has('reading')) R.main.appendChild(buildReading());
  if (has('spare')) add(R.main, buildSpare());
  if (has('extras')) add(R.main, buildPageExtras());
  R.main.appendChild(buildOverall());
  R.main.appendChild(h('p', { class: 'foot-hint' }, '快捷键（光标不在输入框里时）：J 下一段，K 上一段，A 采纳，R 不采纳，⌘Z 撤销，⇧⌘Z 重做。所有改动自动保存到文件，AI 直接读得到。'));
  document.body.appendChild(R.toast = h('div', { class: 'toast', role: 'status', hidden: true }));
  document.body.appendChild(R.pop = h('div', { class: 'sel-pop', hidden: true }, [
    h('button', { type: 'button', onmousedown: function (e) { e.preventDefault(); }, onclick: onPopClick }, '写给 AI')
  ]));
  document.body.appendChild(R.cp = buildComposer());

  // ---------- 顶栏 ----------
  // 宽屏和窄屏用同一套元素，版式靠 style.css 的两个媒体查询（分界见 COMPACT_MQ）：
  //   宽屏三行：编号、标题、类型、阶段、保存状态整条 / 计数、复制提词稿、复制给 AI、内容已确认、更多（字号、撤销重做）、全稿字数、对照通读、只看待确认 / 段落条（带段标题）；
  //   窄屏两行细条都钉住：编号、截断的标题、保存圆点、两个小计数、复制提词稿、更多 / 对照通读、只有段号的段落条（横向滚动）。
  // 「复制给 AI」「内容已确认」「只看待确认」宽屏排在第二行，窄屏收进「更多」菜单：由 placeTopbar 在宽窄切换时挪位置。
  function buildTopbar() {
    var stages = CFG.stages.slice(), cur = String(info.locked.stage || '');
    if (cur && stages.indexOf(cur) < 0) stages.push(cur);
    var ci = stages.indexOf(cur);
    var typeLabel = TYPE ? TYPE + (TYPES[TYPE] ? '' : '（这个类型还没有专门的显示方式，先按通用方式显示）') : '未设置类型';
    var title = info.locked.title || document.title || '';
    // 计数：宽屏写「7 条待确认」「3 条待 AI 处理」，窄屏排成「待确认 7」「待 AI 处理 3」（「条」在窄屏藏起来）
    R.counterSug = h('button', { type: 'button', class: 'counter c-sug', onclick: jumpFirstPendingSug, title: '跳到第一条待确认的建议' });
    R.counterNote = h('button', { type: 'button', class: 'counter c-note', onclick: jumpFirstPendingNote, title: '跳到第一条待 AI 处理的「写给 AI 的话」' });
    // 保存状态：宽屏由 kit 在 save-slot 里画整条；窄屏只显示圆点（黄、红或有冲突时带简短文字），点圆点弹出整条，悬停也能看全文
    R.saveShort = h('span', { class: 'save-short' });
    R.saveInd = h('button', { type: 'button', class: 'save-ind', 'data-state': 'grey', 'aria-expanded': 'false', 'aria-controls': 'jc-save-pop', onclick: function () { toggleSavePop(); } }, [
      h('i', { class: 'save-dot', 'aria-hidden': 'true' }), R.saveShort
    ]);
    R.saveSlot = h('div', { class: 'save-slot', id: 'jc-save-pop', 'data-jc-kit-bar': true }, h('span', { class: 'save-wait' }, '保存功能启动中，暂时无法编辑…'));
    R.approve = h('button', { type: 'button', class: 'btn approve', onclick: menuAct(toggleApprove) });
    R.undoBtn = h('button', { type: 'button', class: 'btn ghost undo-btn', onclick: function () { undo(false); } }, '撤销');
    R.redoBtn = h('button', { type: 'button', class: 'btn ghost redo-btn', onclick: function () { undo(true); } }, '重做');
    R.fontNow = h('span', { class: 'font-now', 'aria-live': 'polite' }, String(ST.font));
    R.viewBtns = {
      compare: h('button', { type: 'button', 'aria-pressed': 'false', onclick: function () { setView('compare'); } }, '对照'),
      reading: h('button', { type: 'button', 'aria-pressed': 'false', onclick: function () { setView('reading'); } }, '通读')
    };
    if (has('record')) R.viewBtns.record = h('button', { type: 'button', 'aria-pressed': 'false', title: '整篇排成录屏清单：口播、画面、录屏步骤', onclick: function () { setView('record'); } }, '录制');
    R.onlyPending = h('input', { type: 'checkbox', onchange: function () { ST.onlyPending = R.onlyPending.checked; persist(); refreshAll(); } });
    R.onlyPending.checked = ST.onlyPending;
    R.nav = h('nav', { class: 'segnav', 'aria-label': '段落' });
    R.total = h('span', { class: 'total' });
    R.menuTotal = h('span', { class: 'menu-total' });
    R.moreBtn = h('button', { type: 'button', class: 'btn more-toggle', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'jc-more-menu', onclick: function () { toggleMore(); } }, ['更多', h('i', { class: 'caret', 'aria-hidden': 'true' })]);
    R.mAi = has('copy') ? h('button', { type: 'button', class: 'btn m-ai', onclick: menuAct(copyForAi), title: '把待 AI 处理的话、各条建议的决定，以及和 AI 交稿版相比的改动，整理成清单并复制' }, '复制给 AI') : null;
    R.mApprove = hasField(info, 'approved') ? h('div', { class: 'm-approve' }, R.approve) : null;
    R.mOnly = has('suggestions') ? h('label', { class: 'only-pending m-only', title: '只显示待确认的建议' }, [R.onlyPending, ' 只看待确认']) : null;
    R.mKitcopy = h('button', { type: 'button', class: 'btn m-kitcopy', onclick: menuAct(copyKitChanges), title: '把还没保存到文件的改动和冲突整理成清单并复制，出问题时用来留底' }, '复制未保存的改动');
    R.mFont = h('div', { class: 'm-font', role: 'group', 'aria-label': '字号' });
    R.moreMenu = h('div', { class: 'more-menu', id: 'jc-more-menu' }, [
      h('div', { class: 'menu-info' }, [h('b', null, typeLabel), ' · ', cur ? '当前阶段：' + cur : '未设置阶段', h('br'), R.menuTotal]),
      R.mAi, R.mApprove,
      add(R.mFont, [
        h('span', { class: 'm-k' }, '字号'),
        h('button', { type: 'button', class: 'btn ghost', 'aria-label': '缩小字号', onclick: function () { setFont(-1); } }, 'A−'),
        R.fontNow,
        h('button', { type: 'button', class: 'btn ghost', 'aria-label': '放大字号', onclick: function () { setFont(1); } }, 'A＋')
      ]),
      h('div', { class: 'm-undo', role: 'group', 'aria-label': '撤销与重做' }, [R.undoBtn, R.redoBtn]),
      R.mOnly, R.mKitcopy
    ]);
    R.more = h('div', { class: 'more' }, [R.moreBtn, R.moreMenu]);
    R.topIn = h('div', { class: 'top-in' });
    var top = h('header', { class: 'topbar' }, add(R.topIn, [
      h('div', { class: 'ident' }, [
        h('span', { class: 'cid' }, raw.content_id || ''),
        h('h1', { title: title }, title),
        h('span', { class: 'type-tag' }, typeLabel)
      ]),
      h('ol', { class: 'stages', 'aria-label': '阶段（由 AI 推进）' }, stages.map(function (s, i) {
        return h('li', { class: i === ci ? 'now' : (ci >= 0 && i < ci ? 'done' : ''), 'aria-current': i === ci ? 'step' : null }, s);
      })),
      R.saveInd,
      R.saveSlot,
      h('span', { class: 'brk brk-a', 'aria-hidden': 'true' }),
      h('div', { class: 'counters' }, [R.counterSug, R.counterNote]),
      has('copy') ? h('button', { type: 'button', class: 'btn primary copy-tele', onclick: menuAct(copyTeleprompter), title: '只复制锦成版正文，按段落顺序排列，不含空行' }, '复制提词稿') : null,
      R.more,
      R.total,
      h('div', { class: 'seg-switch', role: 'group', 'aria-label': '视图' }, [R.viewBtns.compare, has('reading') ? R.viewBtns.reading : null, R.viewBtns.record || null]),
      h('span', { class: 'brk brk-b', 'aria-hidden': 'true' }),
      R.nav
    ]));
    R.topbar = top;
    placeTopbar();
    if (window.matchMedia) { var mq = window.matchMedia(COMPACT_MQ); if (mq.addEventListener) mq.addEventListener('change', placeTopbar); else if (mq.addListener) mq.addListener(placeTopbar); }
    segs.forEach(function (s, i) {
      var b = h('button', { type: 'button', class: 'nav-btn', onclick: function () { if (ST.view === 'reading') setView('compare'); goSeg(i, true); }, title: s.locked.title || '' }, [
        h('b', null, String(i + 1)), h('span', { class: 'nav-t' }, snippet(s.locked.title, 7)), h('i', { class: 'nav-dot', hidden: true })
      ]);
      s._nav = b;
      R.nav.appendChild(b);
    });
    return top;
  }
  // 窄屏的两个弹出层：「更多」菜单和保存状态全文。点别处、按 Esc 关掉；一次只开一个
  function isCompact() { return !!(window.matchMedia && window.matchMedia(COMPACT_MQ).matches); }
  function layoutMode() { return isCompact() ? 'compact' : 'wide'; }
  function placeTopbar() { // 宽窄切换时挪「复制给 AI」「内容已确认」「只看待确认」：宽屏排在顶栏第二行（位置由样式的 order 定），窄屏收进「更多」菜单
    if (!R.topIn) return;
    var compact = isCompact();
    [[R.mAi, R.mFont], [R.mApprove, R.mFont], [R.mOnly, R.mKitcopy]].forEach(function (x) {
      if (!x[0]) return;
      if (compact) { if (x[0].parentNode !== R.moreMenu) R.moreMenu.insertBefore(x[0], x[1]); }
      else if (x[0].parentNode !== R.topIn) R.topIn.insertBefore(x[0], R.more);
    });
    closePops();
  }
  function menuAct(fn) { return function (e) { closePops(); fn(e); }; } // 菜单里点了会离开的操作：先关菜单再做（字号、撤销重做、只看待确认可以连着点，不关）
  function toggleMore(open) {
    if (!R.more) return;
    open = open == null ? !R.more.classList.contains('open') : !!open;
    if (open) toggleSavePop(false);
    R.more.classList.toggle('open', open);
    R.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function toggleSavePop(open) {
    if (!R.topbar) return;
    open = open == null ? !R.topbar.classList.contains('save-open') : !!open;
    if (open) toggleMore(false);
    R.topbar.classList.toggle('save-open', open);
    R.saveInd.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closePops() { toggleMore(false); toggleSavePop(false); }
  document.addEventListener('click', function (e) {
    if (!R.topbar) return;
    if (R.more.classList.contains('open') && !R.more.contains(e.target)) toggleMore(false);
    if (R.topbar.classList.contains('save-open') && !R.saveInd.contains(e.target) && !R.saveSlot.contains(e.target)) toggleSavePop(false);
  });
  // 保存状态的简短说法：绿、灰只要圆点；黄、红必须带几个字说清是什么问题；有冲突时写几处冲突。全文用 kit 自己的说法
  function saveLabel(st, ks) {
    if (!kit) return { state: 'red', short: '无法保存', msg: '保存功能没有启动，改动无法保存，页面已锁定' };
    st = st || {}; ks = ks || {};
    var state = st.state || 'grey', short = '', conf = Number(st.conflicts) || 0;
    if (kit.failed) { state = 'red'; short = '保存出错'; }
    else if (state === 'red') short = ks.storeError ? '暂存出错' : ks.saveRefused ? '保存被拒绝' : ks.unregistered ? '部分无法保存' : ks.online === false ? '服务已断开' : ks.metaProblem ? '文件异常' : '保存出错';
    else if (state === 'yellow') short = ks.online === false ? '服务未连接' : ks.storeKind === 'memory' ? '暂存不可用' : conf ? conf + ' 处冲突' : '需要留意';
    else if (conf) short = conf + ' 处冲突';
    var msg = st.msg || (kit.failed ? '保存功能出错：' + kit.failed : '保存功能启动中，暂时无法编辑…');
    if (conf && msg.indexOf('冲突') < 0) msg += '；' + conf + ' 处冲突待处理';
    return { state: state, short: short, msg: msg, conflicts: conf };
  }
  function refreshSaveInd() {
    if (!R.saveInd) return;
    var s = saveLabel(kit && kit.status ? kit.status() : null, kit && kit.state ? kit.state() : null);
    R.saveInd.setAttribute('data-state', s.state);
    R.saveInd.classList.toggle('has-conf', !!s.conflicts);
    R.saveShort.textContent = s.short;
    R.saveShort.hidden = !s.short;
    R.saveInd.title = s.msg + '（点击查看完整状态）';
    R.saveInd.setAttribute('aria-label', '保存状态：' + s.msg);
  }
  function copyKitChanges() {
    if (!kit || !kit.markdown) return toast('保存功能没有启动，没有可复制的改动');
    var ks = kit.state ? kit.state() : {}, n = (Number(ks.pending) || 0) + (Number(ks.conflicts) || 0);
    copyText(kit.markdown(), n ? '已复制未保存的改动清单，可以直接粘贴给 AI' : '当前没有未保存的改动，已复制清单');
  }
  function navIntoView(b) { // 窄屏段落条横向滚动：让当前段号露在条里（只动条自己，不动页面）
    var n = R.nav;
    if (!n || !b || n.scrollWidth <= n.clientWidth + 1) return;
    var l = b.offsetLeft, r = l + b.offsetWidth;
    if (l < n.scrollLeft) n.scrollLeft = Math.max(0, l - 8);
    else if (r > n.scrollLeft + n.clientWidth) n.scrollLeft = r - n.clientWidth + 8;
  }

  // ---------- 叙事卡（口播枝干） ----------
  function buildNarrative() {
    var n = info.locked.narrative && typeof info.locked.narrative === 'object' ? info.locked.narrative : {};
    var rows = [['讲了个什么故事', n.story], ['给谁', n.audience], ['解决什么问题', n.problem]].filter(function (r) { return r[1]; });
    var body = h('div', { class: 'narr-body', hidden: !ST.narrOpen }, [
      h('div', { class: 'narr-grid' }, rows.map(function (r) { return h('div', { class: 'narr-cell' }, [h('div', { class: 'narr-k' }, r[0]), h('p', null, String(r[1]))]); })),
      CFG.showRole ? h('details', { class: 'narr-roles' }, [
        h('summary', null, '每段起什么作用（' + segs.length + ' 段）'),
        h('ol', null, segs.map(function (s) { return h('li', null, [h('b', null, s.locked.title || ''), s.locked.role ? '：' + s.locked.role : '']); }))
      ]) : null
    ]);
    var tog = h('button', { type: 'button', class: 'narr-toggle', 'aria-expanded': ST.narrOpen ? 'true' : 'false', onclick: function () {
      ST.narrOpen = !ST.narrOpen; ST.narrOpenBy[layoutMode()] = ST.narrOpen; body.hidden = !ST.narrOpen; tog.setAttribute('aria-expanded', ST.narrOpen ? 'true' : 'false');
      tog.lastChild.textContent = ST.narrOpen ? '收起' : '展开'; persist();
    } }, [h('b', null, '叙事'), h('span', { class: 'narr-sum' }, rows.length ? snippet(rows[0][1], 40) : '（AI 还没写叙事）'), h('span', { class: 'narr-act' }, ST.narrOpen ? '收起' : '展开')]);
    return h('section', { class: 'narrative wrap' }, [tog, body]);
  }

  // ---------- 段落对照区 ----------
  function buildCompare() {
    var view = h('div', { class: 'compare-view' });
    add(view, buildSkeleton());
    segs.forEach(function (seg) { view.appendChild(buildSegment(seg)); });
    R.compare = view;
    return view;
  }
  function isExplain(r) { return r.source_type === EXPLAIN; }
  // 一条参考的头：谁、角色（对标 / 补充参考 / 效果样例）、来源类型、时间、看原片
  function refHead(r) {
    var w = watchLink(r);
    return h('div', { class: 'ref-head' }, [
      h('b', null, r.who || '参考'),
      typeof r.role === 'string' && r.role ? h('span', { class: 'role-tag ' + (REF_ROLE_CLASS[r.role] || 'r-other') }, r.role) : null,
      r.source_type ? h('span', { class: 'src-tag' }, r.source_type) : null,
      r.time ? h('span', { class: 'time' }, r.time) : null,
      w
    ]);
  }
  // 对方这段的画面（教程写稿要知道对方画面上是什么）：原文下面一行灰字
  function refVisual(r) {
    return typeof r.visual === 'string' && r.visual.trim() ? h('div', { class: 'ref-visual' }, [h('span', { class: 'rv-k' }, '画面'), r.visual]) : null;
  }
  // 「看原片」：有本地原片就用本地的，从这一段的开头播（抖音原片被作者删了也能看）；没有就用网上的链接
  function startSec(time) {
    var m = String(time || '').match(/(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return 0;
    return m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
  }
  function localHref(rel, time) {
    // rel 是相对页面文件的位置。经保存服务打开时，换成只读文件地址（localhost 那个来源的 /f/）；直接打开文件时就用相对位置
    if (typeof rel !== 'string' || !rel.trim() || /^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.charAt(0) === '/' || rel.indexOf('\\') >= 0) return null;
    var enc = rel.split('/').map(function (p) { return p === '..' || p === '.' ? p : encodeURIComponent(p); }).join('/');
    var t = startSec(time), frag = t ? '#t=' + t : '';
    var served = window.JC_SERVED && typeof window.JC_SERVED.path === 'string' && /^https?:$/.test(location.protocol);
    if (!served) return enc + frag;
    var dir = window.JC_SERVED.path.split('/').slice(0, -1).map(encodeURIComponent).join('/');
    try { return new URL((dir ? dir + '/' : '') + enc, location.protocol + '//localhost:' + location.port + '/f/').href + frag; } catch (e) { return null; }
  }
  function watchLink(r) {
    var local = localHref(r.video, r.time);
    if (local) return h('a', { class: 'watch', href: local, target: '_blank', rel: 'noopener', title: r.time ? '用本地原片从 ' + (String(r.time).match(/\d+:\d{1,2}(?::\d{1,2})?/) || [''])[0] + ' 开始播放' : '用本地原片播放' }, '看原片');
    if (typeof r.url === 'string' && /^https?:\/\//.test(r.url)) return h('a', { class: 'watch', href: r.url, target: '_blank', rel: 'noopener' }, '看原片');
    return null;
  }
  function buildSegment(seg) {
    var L = seg.locked, ui = segUi[seg.id] = {};
    var refs = Array.isArray(L.refs) ? L.refs.filter(function (r) { return r && typeof r === 'object' && (r.text || r.who); }) : [];
    ui.refs = refs.filter(function (r) { return !isExplain(r); }); // 原话类参考：参与勾选显示和「连续 8 字相同」
    // 左边：参考，只读。「说明」不是谁的原话，灰色显示、一直显示。
    // 有两家及以上参考、又有 AI 写的参考分析时（分析模式）：上面是「这一段参考怎么讲」，原文按家收成一行一行，点一家只展开这一家；
    // 只有一家参考时原文照旧直接展开（一家不会看花眼），有分析就放在原文上面
    var refCol = h('div', { class: 'refs' });
    var whos = [];
    ui.refs.forEach(function (r) { var w = r.who || '参考'; if (whos.indexOf(w) < 0) whos.push(w); });
    var note = refnoteOf[seg.id] || null;
    ui.anaMode = !!note && whos.length >= 2;
    if (note) refCol.appendChild(buildAnalysis(seg, note, whos));
    if (ui.anaMode) refCol.appendChild(buildFamilies(seg, note, whos));
    // 按「谁」勾选：同一家在这段里有好几条（例如教程按步骤摘了三处），只出一个勾选框；分析模式下由上面的按家展开代替
    if (whos.length > 1 && !ui.anaMode) {
      refCol.appendChild(h('div', { class: 'ref-pick' }, ['显示：'].concat(whos.map(function (who) {
        var cb = h('input', { type: 'checkbox', 'data-who': who, onchange: function () { ST.refsHidden[who] = !cb.checked; persist(); refreshRefs(); } });
        cb.checked = !ST.refsHidden[who];
        return h('label', null, [cb, ' ' + who]);
      }))));
    }
    ui.refEls = [];
    refs.forEach(function (r) {
      if (isExplain(r)) {
        refCol.appendChild(h('aside', { class: 'ref ref-explain' }, [
          h('div', { class: 'ref-head' }, [h('span', { class: 'explain-tag' }, '说明'), r.who ? h('span', { class: 'muted' }, '参考：' + r.who) : null]),
          h('div', { class: 'explain-text' }, String(r.text || '')),
          refExtras(r)
        ]));
        return;
      }
      var t = h('div', { class: 'ref-text', 'data-quote-seg': seg.id });
      var art = h('article', { class: 'ref', 'data-who': r.who || '参考', hidden: !ui.anaMode && !!ST.refsHidden[r.who || '参考'] }, [
        refHead(r),
        t,
        refVisual(r),
        refExtras(r)
      ]);
      if (ui.anaMode) ui.fam[r.who || '参考'].body.appendChild(art); else refCol.appendChild(art);
      ui.refEls.push({ art: art, text: t, ref: r });
    });
    if (!refs.length) refCol.appendChild(h('p', { class: 'muted' }, '这一段没有参考'));
    // 右边：锦成版，直接改
    ui.mine = h('textarea', { class: 'mine', 'data-item': seg.id, 'data-field': 'mine', autocomplete: 'off', spellcheck: 'false', 'data-jc-wait': true, readonly: true, rows: 3, 'aria-label': '第 ' + seg._no + ' 段锦成版' });
    ui.mine.value = val(seg.id, 'mine');
    ui.back = h('div', { class: 'mine-back', 'aria-hidden': 'true' });
    ui.count = h('span', { class: 'count' });
    ui.baseSum = h('summary');
    ui.baseDiff = h('div');
    ui.vsBase = h('details', { class: 'vs-base', open: true }, [ui.baseSum, ui.baseDiff]);
    ui.vsBase.addEventListener('toggle', function () { if (!ui.settingBase) ST.baseOpen[seg.id] = ui.vsBase.open; });
    var mineCell = h('div', { class: 'mine-cell jc-field' }, [
      h('div', { class: 'cell-head' }, [h('b', null, '锦成版'), h('span', { class: 'muted' }, '可直接修改，停止输入 1 秒后自动保存'), ui.count]),
      ui.ctxPrev = seg._no > 1 ? h('button', { type: 'button', class: 'ctx ctx-prev', title: '点一下跳到上一段', onclick: function () { goSeg(seg._no - 2, true); } }) : null,
      h('div', { class: 'mine-wrap' }, [ui.back, ui.mine]),
      ui.ctxNext = seg._no < segs.length ? h('button', { type: 'button', class: 'ctx ctx-next', title: '点一下跳到下一段', onclick: function () { goSeg(seg._no, true); } }) : null,
      has('visual') ? buildVisual(seg) : null,
      L.baseline != null ? ui.vsBase : null
    ]);
    ui.mine.addEventListener('input', function () { autoGrow(ui.mine); scheduleSeg(seg); });
    // 标题行
    ui.histBtn = has('history') ? h('button', { type: 'button', class: 'btn ghost small', onclick: function () { toggleHistory(seg); } }, '本段改动记录') : null;
    ui.head = h('div', { class: 'seg-head' }, [
      h('h2', null, [h('span', { class: 'no' }, String(seg._no)), L.title || '（无标题）']),
      CFG.showRole && L.role ? h('span', { class: 'role', title: '这段起什么作用' }, L.role) : null,
      h('span', { class: 'grow' }),
      ui.histBtn
    ]);
    ui.hist = h('div', { class: 'hist-panel', hidden: true });
    var sec = h('section', { class: 'seg', id: 'seg-' + seg.id, 'data-seg': seg.id }, [
      ui.head,
      has('record') ? (ui.recFlag = h('p', { class: 'rec-flag', hidden: true })) : null,
      h('div', { class: 'grid' + (refs.length ? '' : ' no-ref') }, [refCol, mineCell]),
      ui.hist,
      has('steps') ? buildSteps(seg) : null,
      has('suggestions') ? buildSugs(seg) : null,
      has('notes') ? buildNote(seg) : null,
      has('extras') ? buildSegExtras(seg) : null,
      h('div', { class: 'seg-foot' }, [
        h('button', { type: 'button', class: 'btn', onclick: function () { goSeg(ST.seg - 1, true); }, disabled: seg._no === 1 }, '上一段 K'),
        h('span', { class: 'muted' }, '第 ' + seg._no + ' / ' + segs.length + ' 段'),
        h('button', { type: 'button', class: 'btn', onclick: function () { goSeg(ST.seg + 1, true); }, disabled: seg._no === segs.length }, '下一段 J')
      ])
    ]);
    ui.sec = sec;
    return sec;
  }

  // ---------- 建议卡 ----------
  function buildSugs(seg) {
    var ui = segUi[seg.id], list = sugsOf(seg);
    ui.cards = h('div', { class: 'cards' });
    ui.sugHidden = h('p', { class: 'sug-hidden', hidden: true });
    ui.sugEmpty = h('p', { class: 'muted sug-empty', hidden: true });
    ui.catBar = h('div', { class: 'cat-bar' });
    list.forEach(function (sug) { ui.cards.appendChild(buildCard(sug)); });
    ui.sugBox = h('section', { class: 'sugs', hidden: !list.length }, [
      h('div', { class: 'sugs-head' }, [h('h3', { title: CFG.sugNote }, CFG.sugTitle), h('span', { class: 'muted sugs-note' }, CFG.sugNote), h('span', { class: 'grow' }), ui.catBar]),
      ui.cards, ui.sugEmpty, ui.sugHidden
    ]);
    return ui.sugBox;
  }
  // 建议卡：先给「原句 → 改成」的删改对照（删的划掉、加的下划线）、结论和按钮；
  // 「为什么改」默认两行，超出的点「展开」；「依据」收成一个彩色小标签，点开看说明；「改成」的输入框点「先改再采纳」才出来。
  // 「改成」是空的表示整句删掉：卡片写「删掉这句」，采纳就从锦成版删去原句。
  // 整张卡带 jc-field：这张卡里的格子（「改成」）有冲突时，kit 把冲突框挂在卡片最后，输入框收着也看得见。
  function buildCard(sug) {
    var L = sug.locked, c = cardUi[sug.id] = {};
    var basis = L.basis && typeof L.basis === 'object' ? L.basis : { type: '', text: String(L.basis || '') };
    c.proposed = hasField(sug, 'proposed') ? h('textarea', { class: 'proposed', 'data-item': sug.id, 'data-field': 'proposed', autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 2, 'aria-label': '改成' }) : null;
    if (c.proposed) { c.proposed.value = val(sug.id, 'proposed'); c.proposed.addEventListener('input', function () { autoGrow(c.proposed); updateCard(sug); }); }
    c.editBox = c.proposed ? h('div', { class: 'edit-box', hidden: true }, [h('div', { class: 'lbl' }, '改成（改好后点「采纳」；清空表示删掉这句）'), c.proposed]) : null;
    c.change = h('div', { class: 'change' });
    if (L.reason) {
      c.reason = h('p', { class: 'reason clamp' }, [h('span', { class: 'k' }, '为什么改：'), String(L.reason)]);
      c.reasonMore = h('button', { type: 'button', class: 'reason-more', hidden: true, 'aria-expanded': 'false', onclick: function () {
        c.reasonOpen = !c.reasonOpen; updateReason(c);
      } }, '展开');
      c.reasonBox = h('div', { class: 'reason-box' }, [c.reason, c.reasonMore]);
    }
    if (basis.type || basis.text) {
      c.basisText = h('div', { class: 'basis-text', hidden: true }, [basis.type ? h('b', null, (BASIS_TEXT[basis.type] || basis.type) + '：') : null, basis.text || '（暂无说明）']);
      c.basisTag = h('button', { type: 'button', class: 'basis-tag ' + (BASIS_CLASS[basis.type] || 'b-other'), 'aria-expanded': 'false', title: '查看依据说明', onclick: function () {
        c.basisText.hidden = !c.basisText.hidden; c.basisTag.setAttribute('aria-expanded', c.basisText.hidden ? 'false' : 'true');
      } }, ['依据：' + (BASIS_TEXT[basis.type] || basis.type || '说明'), h('i', { class: 'caret', 'aria-hidden': 'true' })]);
    }
    c.miss = h('div', { class: 'miss', hidden: true });
    c.warn = h('div', { class: 'warn', hidden: true });
    c.yes = h('button', { type: 'button', class: 'yes', onclick: function () { adopt(sug); } }, ['采纳 ', h('kbd', null, 'A')]);
    c.no = h('button', { type: 'button', onclick: function () { reject(sug); } }, ['不采纳 ', h('kbd', null, 'R')]);
    c.editFirst = c.proposed ? h('button', { type: 'button', class: 'edit-first', 'aria-expanded': 'false', onclick: function () { editFirst(sug); } }, '先改再采纳') : null;
    c.pendingActs = h('div', { class: 'card-actions' }, [c.yes, c.no, c.editFirst]);
    c.decided = h('span', { class: 'decided-text' });
    c.revoke = h('button', { type: 'button', title: '撤销这个决定，改回待确认', onclick: function () { revoke(sug); } }, '撤销决定');
    c.doneActs = h('div', { class: 'card-actions done', hidden: true }, [c.decided, c.revoke]);
    c.badge = h('span', { class: 'dec-badge' });
    c.verdict = L.verdict ? h('span', { class: 'verdict ' + (VERDICT_CLASS[L.verdict] || '') }, '结论：' + (VERDICT_TEXT[L.verdict] || L.verdict)) : null;
    c.el = h('article', { class: 'card jc-field', 'data-sug': sug.id, tabindex: '-1', onclick: function (e) { if (!e.target.closest('button,textarea,a')) setActive(sug.id); }, onfocusin: function () { setActive(sug.id); } }, [
      h('div', { class: 'card-head' }, [
        L.category ? h('span', { class: 'cat' }, L.category) : null,
        c.verdict,
        c.basisTag,
        h('span', { class: 'by muted' }, SOURCE_TEXT[L.source || 'AI'] || (L.source + (/[A-Za-z0-9]$/.test(L.source) ? ' ' : '') + '建议')),
        h('span', { class: 'grow' }), c.badge
      ]),
      c.change,
      c.reasonBox,
      c.basisText,
      c.editBox,
      c.miss, c.warn, c.pendingActs, c.doneActs
    ]);
    return c.el;
  }
  function updateReason(c) { // 「为什么改」超过两行才给「展开」；卡片没显示出来时量不了，等显示时（换段、筛选、窗口变宽窄）再量
    if (!c.reason) return;
    c.reason.classList.toggle('clamp', !c.reasonOpen);
    c.reasonBox.classList.toggle('open', !!c.reasonOpen);
    c.reasonMore.textContent = c.reasonOpen ? '收起' : '展开';
    c.reasonMore.setAttribute('aria-expanded', c.reasonOpen ? 'true' : 'false');
    if (c.reasonOpen) { c.reasonMore.hidden = false; return; }
    if (!c.el.offsetParent) return;
    c.reasonMore.hidden = c.reason.scrollHeight <= c.reason.clientHeight + 2;
  }
  // 「改成」是空的（或只有空白）就是建议整句删掉
  function isDeletion(prop) { return !String(prop == null ? '' : prop).trim(); }
  // 把锦成版里恰好出现一次的原句换成新句；找不到返回 null。新句是空的就删掉原句：
  // 删的是整行（前后都是换行或开头结尾）时顺手收掉多出来的空行，前后原来隔几个换行就留几个（取多的那边），不会凭空多出空段
  function replaceOnce(mine, original, next) {
    var nm = norm(mine), no = norm(original), at = nm.indexOf(no);
    if (!no || at < 0) return null;
    var before = nm.slice(0, at), after = nm.slice(at + no.length);
    if (!isDeletion(next)) return before + norm(next) + after;
    var b = before.replace(/[ \t]+$/, ''), a = after.replace(/^[ \t]+/, '');
    var wholeLine = (b === '' || b.slice(-1) === '\n') && (a === '' || a.charAt(0) === '\n');
    if (!wholeLine) return before + after;
    if (a === '') return b.replace(/\s+$/, '');
    if (b === '') return a.replace(/^\s+/, '');
    var nb = b.match(/\n*$/)[0].length, na = a.match(/^\n*/)[0].length;
    return b.replace(/\n+$/, '') + new Array(Math.max(nb, na) + 1).join('\n') + a.replace(/^\n+/, '');
  }

  // ---------- 参考分析（主干，编导的功课）：这一段参考怎么讲 ----------
  // 先结论，再按「讲法点」合并的几行（几家都这么讲的只出一句代表原句；谁独有、谁多做了单独一行），最后「可以借的」。
  // 同一种颜色＝同一个讲法点：展开原文时，那几句原句用同样的颜色标出来。原句都是生成时校验过、逐字出自原文的。
  var PT_COLORS = 4;
  function coverText(p, famCount) {
    var who = Array.isArray(p.who) ? p.who : [];
    if (p.cover === '共性') return who.length >= famCount && famCount > 1 ? famCount + ' 家都这么讲' : who.join('、') + ' 都这么讲';
    if (p.cover === '多做') return (who[0] || '') + ' 在 ' + (p.over || '') + ' 的基础上多做';
    return '只有 ' + (who[0] || '');
  }
  function srcLink(seg, q) { // 原句或画面的出处：谁 几分几秒；有本地原片就点了从这一秒播
    var refs = (Array.isArray(seg.locked.refs) ? seg.locked.refs : []).filter(function (r) { return r && r.who === q.who; });
    var local = null;
    refs.some(function (r) { local = localHref(r.video, q.time); return !!local; });
    var label = q.who + (q.time ? ' ' + q.time : '');
    return local ? h('a', { class: 'pt-src', href: local, target: '_blank', rel: 'noopener', title: '用本地原片从 ' + q.time + ' 开始播放' }, label) : h('span', { class: 'pt-src' }, label);
  }
  function buildAnalysis(seg, note, whos) {
    var L = note.locked, pts = Array.isArray(L.points) ? L.points : [], bw = Array.isArray(L.borrow) ? L.borrow : [];
    var ui = segUi[seg.id];
    ui.ana = h('section', { class: 'ana', 'data-quote-seg': seg.id, 'data-ana': note.id }, [
      h('div', { class: 'ana-head' }, [h('b', null, '这一段参考怎么讲'), h('span', { class: 'muted' }, whos.length + ' 家参考，AI 看过原片后整理')]),
      L.summary ? h('p', { class: 'ana-sum' }, String(L.summary)) : null,
      pts.length ? h('ol', { class: 'ana-pts' }, pts.map(function (p, k) {
        var q0 = Array.isArray(p.quotes) ? p.quotes[0] : null;
        return h('li', { class: 'pt pc' + (k % PT_COLORS) + (p.cover === '多做' ? ' more' : '') }, [
          h('div', { class: 'pt-top' }, [h('span', { class: 'pt-tag' }, String(p.tag || '')), h('span', { class: 'pt-say' }, String(p.say || '')), h('span', { class: 'pt-cover' }, coverText(p, whos.length))]),
          q0 && q0.text ? h('div', { class: 'pt-q' }, ['「' + q0.text + '」', srcLink(seg, q0)]) : null,
          p.visual && p.visual.text ? h('div', { class: 'pt-v' }, [h('span', { class: 'rv-k' }, '画面'), String(p.visual.text), srcLink(seg, p.visual)]) : null
        ]);
      })) : null,
      bw.length ? h('div', { class: 'ana-bw' }, [h('div', { class: 'bw-head' }, '可以借的')].concat(bw.map(function (b) {
        var g = b.sug && byId[b.sug] && byId[b.sug]._kind === 'suggestion' ? byId[b.sug] : null;
        return h('div', { class: 'bw' }, [
          h('span', { class: 'bw-type' + (b.type === '超一步' ? ' up' : '') }, String(b.type || '')),
          h('span', null, String(b.text || '')),
          g ? h('button', { type: 'button', class: 'link bw-go', onclick: function () { focusCard(g); } }, '看对应的修改建议') : null
        ]);
      }))) : null
    ]);
    return ui.ana;
  }
  // 原文按家收成一行：谁、角色、这段有几条原文、在原片里的时间段、和谁中译中；每家单独展开收起，可以同时展开几家对照着看，也能一键全部展开
  function buildFamilies(seg, note, whos) {
    var ui = segUi[seg.id], refs = Array.isArray(seg.locked.refs) ? seg.locked.refs : [];
    var merged = Array.isArray(note.locked.merged) ? note.locked.merged : [];
    ui.fam = {};
    ui.famAll = h('button', { type: 'button', class: 'link fams-all', onclick: function () { toggleAllFams(seg); } }, '全部展开');
    var list = h('div', { class: 'fams' }, [h('div', { class: 'fams-head' }, [h('span', null, '原文（点一家展开，可以同时展开几家；关键句按上面讲法点的颜色标出）'), h('span', { class: 'grow' }), ui.famAll])]);
    whos.forEach(function (who) {
      var rs = refs.filter(function (r) { return r && !isExplain(r) && (r.who || '参考') === who; });
      var spans = rs.map(function (r) { return cd_range(r.time); }).filter(Boolean);
      var span = spans.length ? spans[0][0] + ' 到 ' + spans[spans.length - 1][1] : '';
      var mg = merged.filter(function (g) { return g && g.who === who; })[0];
      var act = h('span', { class: 'fam-act' }, '展开原文');
      var btn = h('button', { type: 'button', class: 'fam-row', 'aria-expanded': 'false', onclick: function () { toggleFam(seg, who); } }, [
        h('b', null, who),
        rs[0] && rs[0].role ? h('span', { class: 'role-tag ' + (REF_ROLE_CLASS[rs[0].role] || 'r-other') }, rs[0].role) : null,
        h('span', { class: 'muted' }, '本段 ' + rs.length + ' 条原文' + (span ? ' · ' + span : '')),
        mg ? h('span', { class: 'fam-merged' }, '≈' + mg.base + (typeof mg.ratio === 'number' ? '，本段 ' + Math.round(mg.ratio * 100) + '% 逐字相同' : '') + '，展开后灰色字和' + mg.base + '一样，只看黑色的改动') : null,
        h('span', { class: 'grow' }), act
      ]);
      var body = h('div', { class: 'fam-body', hidden: true });
      list.appendChild(btn); list.appendChild(body);
      ui.fam[who] = { btn: btn, body: body, act: act };
    });
    return list;
  }
  function cd_range(t) { var m = String(t || '').match(/(\d+:\d{1,2}(?::\d{1,2})?)\D+(\d+:\d{1,2}(?::\d{1,2})?)/); return m ? [m[1], m[2]] : null; }
  function toggleFam(seg, who) {
    var open = ST.famOpen[seg.id] || (ST.famOpen[seg.id] = {});
    open[who] = !open[who];
    paintFams(seg);
  }
  function toggleAllFams(seg) {
    var ui = segUi[seg.id], open = ST.famOpen[seg.id] || (ST.famOpen[seg.id] = {}), names = Object.keys(ui.fam);
    var all = names.every(function (w) { return open[w]; });
    names.forEach(function (w) { open[w] = !all; });
    paintFams(seg);
  }
  function paintFams(seg) {
    var ui = segUi[seg.id], open = ST.famOpen[seg.id] || {}, names = Object.keys(ui.fam);
    names.forEach(function (w) {
      var f = ui.fam[w], on = !!open[w];
      f.body.hidden = !on; f.btn.setAttribute('aria-expanded', on ? 'true' : 'false'); f.btn.classList.toggle('open', on);
      f.act.textContent = on ? '收起原文' : '展开原文';
    });
    ui.famAll.textContent = names.every(function (w) { return open[w]; }) ? '全部收起' : '全部展开';
    refreshSeg(seg);
  }
  // 参考原文里属于讲法点的原句：按讲法点的颜色标出来（找不到的就不标）
  function pointMarks(seg, ref) {
    var note = refnoteOf[seg.id], out = [];
    if (!note || !Array.isArray(note.locked.points)) return out;
    var text = norm(ref.text || '');
    note.locked.points.forEach(function (p, k) {
      (Array.isArray(p.quotes) ? p.quotes : []).forEach(function (q) {
        if (!q || q.who !== (ref.who || '') || !q.text) return;
        var i = text.indexOf(norm(q.text));
        if (i >= 0) out.push([i, i + norm(q.text).length, 'pm pc' + (k % PT_COLORS)]);
      });
    });
    return out;
  }
  // 全片「几家参考的关系」：默认收成一行（几家是什么关系），展开是一张窄表：每一步各家怎么做、对应你的第几段
  function buildSkeleton() {
    if (!skeleton) return null;
    var L = skeleton.locked, fams = (Array.isArray(L.families) ? L.families : []).filter(function (f) { return f && f.who; }), rows = Array.isArray(L.rows) ? L.rows : [];
    if (!fams.length || !rows.length) return null;
    var table = h('table', { class: 'skel-t' }, [
      h('thead', null, h('tr', null, [h('th', null, '这一步')].concat(fams.map(function (f) {
        return h('th', { title: [f.role, f.date, f.stat].filter(Boolean).join(' · ') }, [f.who, f.role ? h('span', { class: 'role-tag ' + (REF_ROLE_CLASS[f.role] || 'r-other') }, f.role) : null]);
      }), [h('th', null, '你的稿子')]))),
      h('tbody', null, rows.map(function (r) {
        var sg = r.segment == null ? null : (typeof r.segment === 'number' ? segs[r.segment - 1] : byId[r.segment]);
        var more = Array.isArray(r.more) ? r.more : [];
        return h('tr', null, [h('td', { class: 'sk-step' }, String(r.step || ''))].concat(fams.map(function (f) {
          var c = r.cells && r.cells[f.who];
          return h('td', { class: more.indexOf(f.who) >= 0 ? 'sk-more' : (c ? '' : 'sk-none') }, c ? String(c) : '无');
        }), [h('td', null, sg && sg._no ? h('button', { type: 'button', class: 'link', onclick: function () { setView('compare'); goSeg(sg._no - 1, true); } }, '第 ' + sg._no + ' 段') : h('span', { class: 'sk-none' }, '没有对应'))]));
      }))
    ]);
    return h('details', { class: 'skel' }, [
      h('summary', null, [h('b', null, '几家参考的关系'), h('span', { class: 'skel-rel' }, String(L.relation || '')), h('span', { class: 'muted' }, '展开骨架对照（' + rows.length + ' 步）')]),
      h('div', { class: 'skel-scroll' }, table),
      L.inference ? h('p', { class: 'skel-inf' }, String(L.inference)) : null
    ]);
  }

  // ---------- 画面栏（教程枝干）：锦成版下面，这段用什么画面、观众看到什么 ----------
  // 画面类型点选（可以多选，存成「录屏、字卡」这样用顿号连起来的一格），我方画面是一小格文字；两格都是锦成可改、AI 也能改的
  function buildVisual(seg) {
    var ui = segUi[seg.id], hasVt = hasField(seg, 'visual_type'), hasOv = hasField(seg, 'our_visual');
    if (!hasVt && !hasOv) return null;
    ui.vtBox = hasVt ? h('div', { class: 'vt-chips', role: 'group', 'aria-label': '第 ' + seg._no + ' 段画面类型' }) : null;
    ui.ov = hasOv ? h('textarea', { class: 'our-visual', 'data-item': seg.id, 'data-field': 'our_visual', autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 1,
      placeholder: '这段观众看到什么，例如录屏停在哪一步、放哪张图', 'aria-label': '第 ' + seg._no + ' 段我方画面' }) : null;
    if (ui.ov) { ui.ov.value = val(seg.id, 'our_visual'); ui.ov.addEventListener('input', function () { autoGrow(ui.ov); }); }
    return h('div', { class: 'visual-box' }, [
      h('div', { class: 'vb-head' }, [h('b', null, '画面'), ui.vtBox]),
      ui.ov
    ]);
  }
  function vtList(v) { return String(v || '').split(/[、,，;；\/+＋]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function renderVt(seg) {
    var ui = segUi[seg.id];
    if (!ui || !ui.vtBox) return;
    var cur = vtList(val(seg.id, 'visual_type')), opts = (CFG.visualTypes || []).slice(), ready = kitReady();
    cur.forEach(function (c) { if (opts.indexOf(c) < 0) opts.push(c); }); // 表外的值（AI 写的别的叫法）也显示出来，能取消
    clear(ui.vtBox);
    opts.forEach(function (o) {
      var on = cur.indexOf(o) >= 0;
      ui.vtBox.appendChild(h('button', { type: 'button', class: 'vt', 'aria-pressed': on ? 'true' : 'false', disabled: !ready,
        title: on ? '点一下取消「' + o + '」' : '点一下选上「' + o + '」', onclick: function () { toggleVt(seg, o); } }, o));
    });
  }
  function toggleVt(seg, o) {
    var old = val(seg.id, 'visual_type'), cur = vtList(old), i = cur.indexOf(o), order = CFG.visualTypes || [];
    if (i >= 0) cur.splice(i, 1); else cur.push(o);
    cur.sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    applySteps([{ item: seg.id, field: 'visual_type', old: old, new: cur.join('、') }], '第 ' + seg._no + ' 段画面类型' + (i >= 0 ? '取消' : '选上') + '「' + o + '」');
  }

  // ---------- 录屏步骤（教程枝干）：一步一张卡，照 T028 录屏提示词页 ----------
  // 每张卡写清：在哪发（先点哪里）、对应哪句口播、要发送的内容（可以改，一键复制）、发完应该看到什么、录之前注意什么。
  // 写稿时默认收起（先看稿子），到录制准备阶段或录制视图里展开
  function buildSteps(seg) {
    var ui = segUi[seg.id], list = stepsOf(seg);
    if (!list.length) return null;
    ui.stepsBox = h('details', { class: 'steps-box', open: STAGE === CFG.recordStage }, [
      h('summary', null, [h('b', null, '录屏步骤'), h('span', { class: 'muted' }, list.length + ' 步，提示词可以直接修改，点「复制」后到工具里发送')])
    ]);
    list.forEach(function (st) { ui.stepsBox.appendChild(buildStep(st)); });
    ui.stepsBox.addEventListener('toggle', function () { // 收着时量不了高度，展开时再把提示词框撑开
      if (ui.stepsBox.open) Array.prototype.forEach.call(ui.stepsBox.querySelectorAll('textarea'), autoGrow);
    });
    return ui.stepsBox;
  }
  function buildStep(st) {
    var L = st.locked, sc = stepUi[st.id] = {};
    if (hasField(st, 'prompt')) {
      sc.prompt = h('textarea', { class: 'step-prompt', 'data-item': st.id, 'data-field': 'prompt', autocomplete: 'off', spellcheck: 'false', 'data-jc-wait': true, readonly: true, rows: 2,
        'aria-label': '第 ' + st._no + ' 步要发送的内容' });
      sc.prompt.value = val(st.id, 'prompt');
      sc.prompt.addEventListener('input', function () { autoGrow(sc.prompt); });
    } else if (L.prompt) sc.prompt = h('pre', { class: 'step-prompt ro' }, String(L.prompt));
    var copy = sc.prompt ? h('button', { type: 'button', class: 'btn small', onclick: function () {
      var t = hasField(st, 'prompt') ? sc.prompt.value : String(L.prompt || '');
      copyText(t, '已复制第 ' + st._no + ' 步要发送的内容');
    } }, '复制') : null;
    var known = ['segment', 'order', 'line', 'where', 'expect', 'caution', 'prompt', 'ai_state'];
    return h('article', { class: 'step jc-field', 'data-step': st.id }, [
      h('div', { class: 'step-head' }, [h('span', { class: 'step-no' }, '第 ' + st._no + ' 步'), L.where ? h('span', { class: 'step-where' }, String(L.where)) : null]),
      L.line ? h('div', { class: 'step-row' }, [h('span', { class: 'sk' }, '对应口播'), '「' + String(L.line) + '」']) : null,
      sc.prompt ? h('div', { class: 'step-pbox' }, [h('div', { class: 'step-prow' }, [h('span', { class: 'sk' }, '要发送的内容'), h('span', { class: 'grow' }), copy]), sc.prompt]) : null,
      L.expect ? h('div', { class: 'step-row' }, [h('span', { class: 'sk' }, '发完应该看到'), String(L.expect)]) : null,
      L.caution ? h('div', { class: 'step-caution' }, [h('span', { class: 'sk' }, '录之前注意'), String(L.caution)]) : null,
      extraKeys(L, known).map(function (k) { return exLine(k, L[k]); }),
      extraKeys(st.fields, ['prompt']).map(function (f) { return fieldBox(st, f); })
    ]);
  }

  // ---------- 参考里有、这一稿没用上的（主干，页面信息 spare_refs 有内容才显示） ----------
  // 取长补短的素材不能丢：对方讲了、我们这稿没用的段落放在这里，每段附一句为什么没用上
  function buildSpare() {
    var list = Array.isArray(info.locked.spare_refs) ? info.locked.spare_refs.filter(function (r) { return r && typeof r === 'object' && r.text; }) : [];
    if (!list.length) return null;
    return h('details', { class: 'spare wrap' }, [
      h('summary', null, [h('b', null, '参考里有、这一稿没用上的'), h('span', { class: 'muted' }, list.length + ' 段，想借用哪段，写给 AI 即可')]),
      list.map(function (r) {
        return h('article', { class: 'ref spare-ref' }, [
          refHead(r),
          r.why ? h('div', { class: 'spare-why' }, String(r.why)) : null,
          h('div', { class: 'ref-text' }, String(r.text)),
          refVisual(r),
          refExtras(r)
        ]);
      })
    ]);
  }

  // ---------- 录制视图（教程枝干）：整篇排成录屏清单 ----------
  // 不另画一套格子：还是对照区那些段落，靠 body.view-record 的样式改成一栏、全部展开、藏起参考和建议，
  // 所以在这里改锦成版、画面、提示词和对照里是同一格，不会有两份
  function buildRecordHead() {
    R.recStat = h('span', { class: 'muted' });
    R.recordHead = h('section', { class: 'record-head', hidden: true }, [
      h('div', { class: 'rh-top' }, [h('b', null, '录制清单'), R.recStat, h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn', onclick: copyVisualScript, title: '每段一行：口播和画面，贴进飞书就是一张表，可以直接发给剪辑' }, '复制画面脚本')]),
      h('p', { class: 'rh-tip' }, '录屏时屏幕上打出来的字，要和观众在口播里听到的一致：口播没说的工具名、数字不要出现在提示词里。')
    ]);
    return R.recordHead;
  }
  function refreshRecord() {
    if (!R.recordHead) return;
    var wait = 0;
    segs.forEach(function (seg) {
      var ui = segUi[seg.id], list = sugsOf(seg).filter(function (g) { return g.locked.verdict === '等录屏再定' && !val(g.id, 'decision'); });
      wait += list.length;
      if (!ui || !ui.recFlag) return;
      ui.recFlag.hidden = !list.length;
      clear(ui.recFlag);
      if (list.length) add(ui.recFlag, ['这段有 ' + list.length + ' 句要看录屏结果再写：', list.map(function (g, i) { return (i ? '、' : '') + '「' + snippet(g.locked.original, 24) + '」'; })]);
    });
    R.recStat.textContent = segs.length + ' 段，' + steps.length + ' 个录屏步骤' + (wait ? '，' + wait + ' 句录屏后再定' : '');
  }
  function visualScript() { // 给剪辑的画面脚本：每段一行，口播（锦成版）和画面（类型加我方画面）
    var rows = segs.map(function (s) {
      var vt = val(s.id, 'visual_type'), ov = val(s.id, 'our_visual');
      return { no: s._no, title: s.locked.title || '', say: val(s.id, 'mine').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n'),
        see: (vt ? '【' + vt + '】' : '') + ov };
    });
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); };
    var html = '<table><thead><tr><th>段</th><th>口播</th><th>画面</th></tr></thead><tbody>' + rows.map(function (r) {
      return '<tr><td>' + r.no + ' ' + esc(r.title) + '</td><td>' + esc(r.say) + '</td><td>' + esc(r.see) + '</td></tr>';
    }).join('') + '</tbody></table>';
    var text = rows.map(function (r) { return '第 ' + r.no + ' 段 ' + r.title + '\n口播：' + r.say + '\n画面：' + (r.see || '（没写）'); }).join('\n\n');
    return { html: html, text: text };
  }
  function copyVisualScript() {
    var v = visualScript(), msg = '已复制画面脚本（' + segs.length + ' 段），贴进飞书就是一张表';
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([v.html], { type: 'text/html' }), 'text/plain': new Blob([v.text], { type: 'text/plain' }) })])
        .then(function () { toast(msg); }, function () { copyText(v.text, '已复制画面脚本（纯文字）'); });
    } else copyText(v.text, '已复制画面脚本（纯文字）');
  }

  // ---------- 写给 AI 的话 ----------
  function buildNote(seg) {
    var ui = segUi[seg.id];
    if (!hasField(seg, 'note')) return null;
    ui.note = h('textarea', { class: 'note', 'data-item': seg.id, 'data-field': 'note', autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 2,
      placeholder: '写下哪句不认可、为什么、想怎么改；也可以选中参考或锦成版里的文字，点「写给 AI」', 'aria-label': '第 ' + seg._no + ' 段写给 AI 的话' });
    ui.note.value = val(seg.id, 'note');
    ui.noteStatus = h('span', { class: 'note-status' });
    ui.reply = h('div', { class: 'ai-reply', hidden: true });
    ui.draft = h('div', { class: 'draft-hint', hidden: true }, [
      h('span', null, '这段像稿子，要挪进锦成版吗？'),
      h('button', { type: 'button', class: 'btn small', onclick: function () { moveNoteToMine(seg); } }, '挪进锦成版'),
      h('button', { type: 'button', class: 'btn small ghost', onclick: function () { ST.draftDismissed[seg.id] = draftBody(ui.note.value); ui.draft.hidden = true; } }, '不用，就是写给 AI 的')
    ]);
    ui.note.addEventListener('input', function () { autoGrow(ui.note); scheduleSeg(seg); });
    return h('section', { class: 'note-box jc-field' }, [
      h('div', { class: 'note-head' }, [h('b', null, '写给 AI 的话（不进稿子）'), ui.noteStatus]),
      ui.note, ui.draft, ui.reply
    ]);
  }

  // ---------- 兜底：专门模块还没做的格子和条目，按原样列出（只加不删：新加的键不会看不见，可改字段照样能改、能存） ----------
  function valueText(v) { return typeof v === 'string' ? v : JSON.stringify(v); }
  function extraKeys(obj, own) { return Object.keys(obj || {}).filter(function (k) { return own.indexOf(k) < 0; }); }
  function exLine(k, v) { return h('div', { class: 'ex-line' }, [h('span', { class: 'ex-k' }, keyLabel(k)), valueText(v)]); }
  function refExtras(r) {
    if (!has('extras')) return null;
    var ks = extraKeys(r, REF_OWN);
    return ks.length ? h('div', { class: 'ref-extra' }, ks.map(function (k) { return exLine(k, r[k]); })) : null;
  }
  function fieldBox(it, f) {
    var ta = h('textarea', { class: 'extra-field', 'data-item': it.id, 'data-field': f, autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 2,
      'aria-label': where(it.id) + '的「' + keyLabel(f) + '」' });
    ta.value = val(it.id, f);
    ta.addEventListener('input', function () { autoGrow(ta); });
    extraTas.push(ta);
    return h('label', { class: 'extra-row jc-field' }, [h('span', { class: 'ex-k' }, keyLabel(f)), ta]);
  }
  function extraBody(it, ownLocked, ownFields) {
    var out = [];
    extraKeys(it.locked, ownLocked).forEach(function (k) { out.push(exLine(k, it.locked[k])); });
    extraKeys(it.fields, ownFields).forEach(function (f) { out.push(fieldBox(it, f)); });
    return out;
  }
  function buildOther(it) { // 一个不认识种类的条目（例如录屏步骤）
    var body = extraBody(it, ['segment', 'order', 'ai_state'], []);
    return h('article', { class: 'other-item', 'data-other': it.id }, [
      h('div', { class: 'other-head' }, [h('span', { class: 'kind-tag', title: '条目编号 ' + it.id }, kindLabel(it._kind))]),
      body.length ? body : h('p', { class: 'muted' }, '（这一条没有内容）')
    ]);
  }
  function othersOf(seg) { return others.filter(function (o) { return o.locked.segment === seg.id; }); }
  function extrasBox(title, kids) {
    return h('section', { class: 'extras' }, [
      h('div', { class: 'extras-head' }, [h('b', null, title), h('span', { class: 'muted' }, '这部分还没有专门的显示方式，先按原样列出；可修改的内容照样自动保存到文件')]),
      kids
    ]);
  }
  function buildSegExtras(seg) {
    var own = extraBody(seg, OWN_LOCKED.segment, OWN_FIELDS.segment), items = othersOf(seg).map(buildOther);
    if (!own.length && !items.length) return null;
    return extrasBox('这一段的其他内容', own.concat(items));
  }
  function buildPageExtras() {
    var segIds = {};
    segs.forEach(function (s) { segIds[s.id] = true; });
    var own = info.id ? extraBody(info, OWN_LOCKED.info, OWN_FIELDS.info) : [];
    var loose = others.filter(function (o) { return !segIds[o.locked.segment]; }).map(buildOther);
    if (!own.length && !loose.length) return null;
    return extrasBox('其他内容', own.concat(loose));
  }

  // ---------- 通读视图 ----------
  function buildReading() {
    R.readText = h('div', { class: 'read-body' });
    R.readHead = h('div', { class: 'read-head' });
    R.recorded = hasField(info, 'recorded') ? h('textarea', { class: 'recorded', 'data-item': info.id, 'data-field': 'recorded', autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 4,
      placeholder: '录完以后，把最终念的稿子贴在这里，自动保存；AI 读到后会和锦成版逐句比对', 'aria-label': '录完的定稿' }) : null;
    if (R.recorded) { R.recorded.value = val(info.id, 'recorded'); R.recorded.addEventListener('input', function () { autoGrow(R.recorded); }); }
    R.reading = h('div', { class: 'reading-view', hidden: true }, [
      h('div', { class: 'paper' }, [R.readHead, R.readText]),
      R.recorded ? h('section', { class: 'recorded-box jc-field' }, [h('h3', null, '录完的定稿贴这里'), R.recorded]) : null
    ]);
    return R.reading;
  }
  function renderReading() {
    if (!R.readText) return;
    clear(R.readText);
    var total = 0, need = RATE * (CFG.openingSeconds || 5), placed = false;
    segs.forEach(function (seg) { total += chars(val(seg.id, 'mine')); });
    clear(R.readHead);
    add(R.readHead, [h('b', null, '通读'), h('span', { class: 'muted' }, '全稿 ' + total + ' 字，约 ' + fmtSecs(secs(total)) + '（每秒 ' + RATE + ' 字）。红色竖线是开头 ' + (CFG.openingSeconds || 5) + ' 秒说到的地方（第 ' + need + ' 字）。选中文字可以写给 AI。')]);
    var seen = 0;
    segs.forEach(function (seg) {
      var text = val(seg.id, 'mine'), n = chars(text), body = h('div', { class: 'r-text', 'data-quote-seg': seg.id });
      // 和提词稿一样按行排、不留空行；开头 5 秒线画在全稿第 need 个字后面
      text.split('\n').filter(function (l) { return l.trim(); }).forEach(function (line) {
        var ln = chars(line), row = h('p', { class: 'r-line' });
        if (!placed && need > 0 && seen + ln >= need) {
          var re = new RegExp(COUNTED.source, 'gu'), m, k = seen, cut = line.length;
          while ((m = re.exec(line))) { k++; if (k === need) { cut = m.index + m[0].length; break; } }
          row.appendChild(document.createTextNode(line.slice(0, cut)));
          row.appendChild(h('span', { class: 'five-sec', title: '开头 ' + (CFG.openingSeconds || 5) + ' 秒说到这里（第 ' + need + ' 字）' }));
          row.appendChild(document.createTextNode(line.slice(cut)));
          placed = true;
        } else row.textContent = line;
        seen += ln;
        body.appendChild(row);
      });
      var pend = sugsOf(seg).filter(isUndecided);
      R.readText.appendChild(h('section', { class: 'r-seg', 'data-seg': seg.id }, [
        h('div', { class: 'r-label' }, [h('span', { class: 'no' }, String(seg._no)), (seg.locked.title || '') + ' · ' + n + ' 字，约 ' + secs(n) + ' 秒', h('button', { type: 'button', class: 'link', onclick: function () { setView('compare'); goSeg(seg._no - 1, true); } }, '去对照里改')]),
        body,
        pend.length ? h('button', { type: 'button', class: 'r-flag', onclick: function () { setView('compare'); goSeg(seg._no - 1, true); } },
          '这一段有 ' + pend.length + ' 条' + CFG.sugTitle + '待确认（' + catSummary(pend) + '），点击查看') : null
      ]));
    });
    if (CP && CP.src === 'read') paintQuote(); // 通读重画过，批注框对着的原句要重新标黄
  }
  function catSummary(list) {
    var c = {};
    list.forEach(function (s) { var k = s.locked.category || '其他'; c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).map(function (k) { return k + ' ' + c[k]; }).join('、');
  }

  // ---------- 整体意见 ----------
  function buildOverall() {
    if (!hasField(info, 'overall_note')) return null;
    R.overall = h('textarea', { class: 'note', 'data-item': info.id, 'data-field': 'overall_note', autocomplete: 'off', 'data-jc-wait': true, readonly: true, rows: 2,
      placeholder: '对整篇稿子的意见写在这里，比如节奏、结尾、要不要加一段', 'aria-label': '整体意见' });
    R.overall.value = val(info.id, 'overall_note');
    R.overallStatus = h('span', { class: 'note-status' });
    R.overallReply = h('div', { class: 'ai-reply', hidden: true });
    R.overall.addEventListener('input', function () { autoGrow(R.overall); refreshOverall(); refreshCounters(); });
    return h('section', { class: 'note-box overall jc-field' }, [
      h('div', { class: 'note-head' }, [h('b', null, '整体意见（写给 AI，不进稿子）'), R.overallStatus]),
      R.overall, R.overallReply
    ]);
  }

  // ======================= 刷新显示 =======================
  function autoGrow(ta) {
    if (!ta || !ta.offsetParent) return;
    var y = window.scrollY;
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + ta.offsetHeight - ta.clientHeight) + 'px';
    if (window.scrollY !== y) window.scrollTo(window.scrollX, y);
  }
  var segTimers = {};
  function scheduleSeg(seg) {
    if (segTimers[seg.id]) return;
    segTimers[seg.id] = requestAnimationFrame(function () { segTimers[seg.id] = 0; refreshSeg(seg); refreshCounters(); refreshTotal(); });
  }
  function refreshSeg(seg) {
    var ui = segUi[seg.id];
    if (!ui) return;
    var mine = ui.mine ? ui.mine.value : val(seg.id, 'mine'), n = chars(mine);
    ui.count.textContent = n + ' 字 · 约 ' + secs(n) + ' 秒';
    // 和参考连续 8 字相同：锦成版画在文本框背后的底层上，参考里直接画
    var refTexts = ui.refs.filter(function (r) { return ui.anaMode || !ST.refsHidden[r.who || '参考']; }).map(function (r) { return r.text || ''; });
    var qr = mineQuoteRange(seg, mine);
    markedText(ui.back, mine + '\n', sameRanges(mine, refTexts), 'same', qr ? [qr[0], qr[1], 'quote-mark'] : null);
    // 中译中：参考分析里标了「照着别家改写」的那家，和被照着的那家逐字相同的部分灰掉，剩下正常颜色的就是他改的地方
    var rn = refnoteOf[seg.id], mergedList = rn && Array.isArray(rn.locked.merged) ? rn.locked.merged : [];
    ui.refEls.forEach(function (x) {
      var who = x.ref.who || '参考', extra = pointMarks(seg, x.ref);
      var mg = mergedList.filter(function (g) { return g && g.who === who && g.base; })[0];
      if (mg) {
        var baseTexts = ui.refs.filter(function (r) { return (r.who || '参考') === mg.base; }).map(function (r) { return r.text || ''; });
        sameRanges(x.ref.text || '', baseTexts).forEach(function (r) { extra.push([r[0], r[1], 'dup']); });
      }
      markedText(x.text, x.ref.text || '', sameRanges(x.ref.text || '', [mine]), 'same', extra);
    });
    if (CP && CP.seg === seg.id && CP.src === 'ref') paintQuote(); // 参考重画过，批注框对着的原句要重新标黄
    // 和底稿比
    if (seg.locked.baseline != null) {
      var ops = diffChars(seg.locked.baseline, mine), st = diffStat(ops);
      var big = st.del + st.add > 80; // 改得多时默认收起，免得红绿一大片把下面的改法挤出屏幕
      ui.baseSum.textContent = st.changed ? '和 AI 交稿版相比：删去 ' + st.del + ' 字，新增 ' + st.add + ' 字' + (big ? '（改动较多，点击展开）' : '') : '和 AI 交稿版相同，还没有修改';
      ui.baseSum.title = 'AI 交稿版：AI 上次交稿时的锦成版';
      clear(ui.baseDiff);
      if (st.changed) ui.baseDiff.appendChild(diffNode(ops));
      var want = seg.id in ST.baseOpen ? ST.baseOpen[seg.id] : !big;
      if (ui.vsBase.open !== want) { ui.settingBase = true; ui.vsBase.open = want; setTimeout(function () { ui.settingBase = false; }, 0); }
    }
    // 写给 AI 的话：待处理 / AI 已处理
    if (ui.note) {
      var note = ui.note.value, s = aiState(seg), handled = s.handled_note, reply = s.reply;
      var pendingNote = !!note.trim() && !same(note, handled || '');
      ui.noteStatus.className = 'note-status ' + (pendingNote ? 'st-pend' : (reply && handled != null && same(note, handled) && note.trim() ? 'st-done' : 'st-none'));
      ui.noteStatus.textContent = pendingNote ? '待 AI 处理' : (reply && note.trim() && same(note, handled || '') ? 'AI 已处理' : '');
      ui.reply.hidden = !reply;
      clear(ui.reply);
      if (reply) add(ui.reply, [h('b', null, pendingNote ? 'AI 上次的回复（之后你又修改过，等待 AI 重新查看）：' : 'AI 已处理：'), h('span', null, reply), s.replied_at ? h('span', { class: 'muted' }, '（' + dayTime(Date.parse(s.replied_at) || Date.now()) + '）') : null]);
      var body = draftBody(note);
      ui.draft.hidden = !body || ST.draftDismissed[seg.id] === body;
    }
    // 建议卡
    sugsOf(seg).forEach(updateCard);
    refreshSugBox(seg);
    if (ui.mine) autoGrow(ui.mine);
    if (ui.note) autoGrow(ui.note);
    renderVt(seg);
    if (ui.ov) autoGrow(ui.ov);
    refreshCtx(seg);
    if (ui.sec) Array.prototype.forEach.call(ui.sec.querySelectorAll('textarea.extra-field, textarea.step-prompt'), autoGrow);
  }
  // 段和段之间的衔接：写这一段时，锦成版上面露出上一段的结尾，下面露出下一段的开头（起承转合要接得上）。
  // 取的是当前锦成版（他刚改过的也算），上一段取最后一两句、下一段取第一句
  function sentences(t) { return (String(t || '').replace(/\s*\n+\s*/g, '\n').match(/[^。！？!?…\n]+[。！？!?…]*|\n/g) || []).map(function (x) { return x.trim(); }).filter(Boolean); }
  function tailOf(t) {
    var ss = sentences(t), out = '';
    for (var i = ss.length - 1; i >= 0 && (chars(out) < 20 || ss.length - i <= 1) && ss.length - i <= 2; i--) out = ss[i] + out;
    return out.length > 90 ? '…' + out.slice(out.length - 90) : out;
  }
  function headOf(t) { var f = sentences(t)[0] || ''; return f.length > 60 ? f.slice(0, 60) + '…' : f; }
  function refreshCtx(seg) {
    var ui = segUi[seg.id];
    if (!ui) return;
    var prev = segs[seg._no - 2], next = segs[seg._no];
    if (ui.ctxPrev && prev) {
      var t = tailOf(val(prev.id, 'mine'));
      clear(ui.ctxPrev);
      add(ui.ctxPrev, [h('span', { class: 'ctx-k' }, '接上一段「' + snippet(prev.locked.title, 10) + '」结尾'), t ? '「' + t + '」' : '（上一段还没写）']);
    }
    if (ui.ctxNext && next) {
      var f = headOf(val(next.id, 'mine'));
      clear(ui.ctxNext);
      add(ui.ctxNext, [h('span', { class: 'ctx-k' }, '下一段「' + snippet(next.locked.title, 10) + '」开头'), f ? '「' + f + '」' : '（下一段还没写）']);
    }
  }
  function isUndecided(sug) { return !val(sug.id, 'decision') && sug.locked.verdict !== '不用改'; }
  // 类别筛选：锦成在这个阶段点过类别按钮就按他点的；没点过时，只有审稿阶段（或审稿视图）按类型配置的默认类别筛，其他阶段显示全部
  function catKey() { return STAGE + (ST.view === REVIEW_VIEW ? '|审稿视图' : ''); }
  function catFilterOn() {
    return !!(CFG.defaultCategories && CFG.defaultCategories.length) && ((CFG.filterStages || []).indexOf(STAGE) >= 0 || ST.view === REVIEW_VIEW);
  }
  function setCats(list) { ST.catsBy[catKey()] = list; persist(); }
  function effectiveCats() {
    var present = presentCats(), chosen = ST.catsBy[catKey()];
    if (Array.isArray(chosen)) return chosen.filter(function (c) { return present.indexOf(c) >= 0; });
    if (catFilterOn()) { var d = CFG.defaultCategories.filter(function (c) { return present.indexOf(c) >= 0; }); if (d.length) return d; }
    return present;
  }
  function presentCats() {
    var present = CATEGORIES.filter(function (c) { return sugs.some(function (s) { return s.locked.category === c; }); });
    sugs.forEach(function (s) { var c = s.locked.category; if (c && present.indexOf(c) < 0) present.push(c); });
    return present;
  }
  function cardVisible(sug) {
    var cats = effectiveCats(), c = sug.locked.category;
    if (c && cats.indexOf(c) < 0) return false;
    if (ST.onlyPending && !isUndecided(sug)) return false;
    return true;
  }
  function refreshSugBox(seg) {
    var ui = segUi[seg.id];
    if (!ui || !ui.sugBox) return;
    var list = sugsOf(seg), shown = list.filter(cardVisible), hiddenByCat = list.filter(function (s) { var c = s.locked.category; return c && effectiveCats().indexOf(c) < 0 && (!ST.onlyPending || isUndecided(s)); });
    list.forEach(function (s) { cardUi[s.id].el.hidden = !cardVisible(s); });
    ui.sugBox.hidden = !list.length;
    ui.sugEmpty.hidden = !!shown.length || !list.length;
    ui.sugEmpty.textContent = ST.onlyPending ? '当前筛选下，这一段没有待确认的修改建议' : '这一段的修改建议都被上方的类别筛选隐藏了';
    ui.sugHidden.hidden = !hiddenByCat.length;
    clear(ui.sugHidden);
    if (hiddenByCat.length) add(ui.sugHidden, ['另有 ' + hiddenByCat.length + ' 条（' + catSummary(hiddenByCat) + '）被类别筛选隐藏，', h('button', { type: 'button', class: 'link', onclick: function () { setCats(presentCats()); refreshAll(); } }, '全部显示')]);
    // 类别筛选
    clear(ui.catBar);
    var cats = effectiveCats(), present = presentCats();
    if (present.length > 1) present.forEach(function (c) {
      var n = sugs.filter(function (s) { return s.locked.category === c; }).length, on = cats.indexOf(c) >= 0;
      ui.catBar.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
        var cur = effectiveCats().slice(), i = cur.indexOf(c);
        if (i >= 0) cur.splice(i, 1); else cur.push(c);
        setCats(cur); refreshAll();
      } }, c + ' ' + n));
    });
  }
  function updateCard(sug) {
    var c = cardUi[sug.id];
    if (!c) return;
    var seg = segOf(sug), dec = val(sug.id, 'decision'), L = sug.locked;
    var prop = c.proposed ? c.proposed.value : val(sug.id, 'proposed');
    var mine = seg ? val(seg.id, 'mine') : '', occ = countOcc(mine, L.original);
    var del = isDeletion(prop);
    c.el.className = 'card jc-field' + (dec === '采纳' ? ' is-adopted' : dec === '不采纳' ? ' is-rejected' : dec === '部分采纳' ? ' is-partial' : L.verdict === '不用改' ? ' is-keep' : ' is-pending') + (ST.activeSug === sug.id ? ' is-active' : '') + (del ? ' is-delete' : '');
    // 原句 → 改成：一段删改对照；删整句时前面标「删掉这句」
    clear(c.change);
    var ops = diffChars(L.original || '', del ? '' : prop);
    add(c.change, [
      del ? h('span', { class: 'del-tag' }, '删掉这句') : null,
      diffNode(ops),
      !del && !diffStat(ops).changed ? h('span', { class: 'muted same-note' }, '（改成和原句一样）') : null
    ]);
    c.change.title = '原句：' + (L.original || '（缺少原句）') + '\n改成：' + (del ? '（删掉这句）' : prop);
    // 结论值是「待你定」（显示「建议修改」）的卡片还没决定时每张都一样，不显示结论标签，只留右上角的「待确认」
    if (c.verdict) c.verdict.hidden = L.verdict === '待你定' && !dec;
    c.badge.textContent = dec ? (DECISION_TEXT[dec] || dec) : (L.verdict === '不用改' ? '' : '待确认');
    c.badge.className = 'dec-badge ' + (dec === '采纳' ? 'ok' : dec === '不采纳' ? 'no' : dec ? 'part' : 'wait');
    var ready = kitReady();
    c.pendingActs.hidden = !!dec; c.doneActs.hidden = !dec;
    c.decided.textContent = dec === '采纳' ? (del ? '已从锦成版删掉这句' : '已替换锦成版里的原句') : dec === '不采纳' ? '锦成版保持不变' : dec ? '决定：' + dec : '';
    c.revoke.disabled = !ready;
    c.yes.disabled = !ready || occ !== 1; c.no.disabled = !ready; if (c.editFirst) c.editFirst.disabled = !ready || occ !== 1;
    c.yes.title = del ? '采纳：从锦成版删掉这句' : '采纳：用这句替换锦成版里的原句';
    c.miss.hidden = dec || occ === 1;
    c.miss.textContent = occ === 0 ? '这句你已经改过，这条建议对不上了' : occ > 1 ? '这句在锦成版里出现了 ' + occ + ' 次，无法确定替换哪一处，请先在锦成版里改掉多余的，再采纳' : '';
    var warn = L.verdict === '已定要改' && dec === '不采纳' ? '此前已决定要改，这次未采纳' : L.verdict === '不用改' && dec === '采纳' ? '结论是无需修改，这次已采纳' : '';
    c.warn.hidden = !warn; c.warn.textContent = warn;
    // 「改成」输入框：点了「先改再采纳」才出来；已经定了就收起；这一格被 kit 锁住（有冲突）时一直露着
    if (c.editBox) {
      if (dec) c.editing = false;
      var locked = c.proposed.classList.contains('jc-kit-locked');
      c.editBox.hidden = !(c.editing || locked);
      c.editFirst.textContent = c.editing ? '收起修改框' : '先改再采纳';
      c.editFirst.setAttribute('aria-expanded', c.editing ? 'true' : 'false');
      if (!c.editBox.hidden) autoGrow(c.proposed);
    }
    updateReason(c);
  }
  function draftBody(note) {
    var body = String(note || '').split('\n').filter(function (l) { return !/^\s*(原句|分析)[：:]/.test(l); }).join('\n').trim();
    return chars(body) > 60 && !/[?？]/.test(body) && body.indexOf('你') < 0 ? body : '';
  }
  function notePending(it, field) {
    var v = val(it.id, field);
    return !!v.trim() && !same(v, aiState(it).handled_note || '');
  }
  function refreshOverall() {
    if (!R.overall) return;
    var v = R.overall.value, s = aiState(info), pend = !!v.trim() && !same(v, s.handled_note || '');
    R.overallStatus.className = 'note-status ' + (pend ? 'st-pend' : s.reply && v.trim() ? 'st-done' : 'st-none');
    R.overallStatus.textContent = pend ? '待 AI 处理' : s.reply && v.trim() ? 'AI 已处理' : '';
    R.overallReply.hidden = !s.reply;
    clear(R.overallReply);
    if (s.reply) add(R.overallReply, [h('b', null, pend ? 'AI 上次的回复：' : 'AI 已处理：'), h('span', null, s.reply)]);
    autoGrow(R.overall);
  }
  function refreshCounters() {
    if (!R.counterSug) return;
    var ps = sugs.filter(isUndecided).length;
    var pn = segs.filter(function (s) { return hasField(s, 'note') && notePending(s, 'note'); }).length + (hasField(info, 'overall_note') && notePending(info, 'overall_note') ? 1 : 0);
    counterText(R.counterSug, ps, '待确认');
    R.counterSug.classList.toggle('zero', !ps);
    R.counterSug.hidden = !has('suggestions') || !sugs.length;
    counterText(R.counterNote, pn, '待 AI 处理');
    R.counterNote.classList.toggle('zero', !pn);
    var ap = val(info.id, 'approved');
    if (R.approve) {
      // 「内容已确认」是一个勾选按钮：没勾时前面是空框，勾上后变绿、打勾，后面带确认时间（日期写短，宽屏第二行才排得下）
      R.approve.textContent = ap ? '内容已确认（' + (isNaN(Date.parse(ap)) ? ap : shortTime(Date.parse(ap))) + '）' : '内容已确认';
      R.approve.setAttribute('aria-pressed', ap ? 'true' : 'false');
      R.approve.title = ap ? '你在 ' + (isNaN(Date.parse(ap)) ? ap : dayTime(Date.parse(ap))) + ' 确认了这一稿的内容，AI 可以进入下一步。再点一下取消确认' : '勾选后告诉 AI：这一稿的内容你已确认，可以进入下一步';
      R.approve.disabled = !kitReady();
    }
    segs.forEach(function (s) {
      if (!s._nav) return;
      var dot = s._nav.querySelector('.nav-dot'), p = sugsOf(s).some(isUndecided) || (hasField(s, 'note') && notePending(s, 'note'));
      dot.hidden = !p;
      s._nav.title = (s.locked.title || '') + (p ? '（有待确认的建议或待 AI 处理的话）' : '');
    });
  }
  function counterText(el, n, label) { // 宽屏「7 条待确认」；窄屏由样式把 c-label 排到前面、藏起「条」，显示「待确认 7」；textContent 始终是「7 条待确认」
    clear(el);
    add(el, [h('b', null, String(n)), h('span', { class: 'c-unit' }, ' 条'), h('span', { class: 'c-label' }, label)]);
  }
  function refreshTotal() {
    if (!R.total) return;
    var n = 0;
    segs.forEach(function (s) { n += chars(val(s.id, 'mine')); });
    // 宽屏第二行放不下时，「（每秒 N 字）」由样式藏起来，悬停看；窄屏「更多」菜单里写全
    clear(R.total);
    add(R.total, ['全稿 ' + n + ' 字，约 ' + fmtSecs(secs(n)), h('span', { class: 'rate' }, '（每秒 ' + RATE + ' 字）')]);
    // 悬停看快慢范围：语速上下浮动 0.5 个字，时长对应在这个范围里
    var fast = Math.round(n / (RATE + RATE_SPREAD)), slow = RATE > RATE_SPREAD ? Math.round(n / (RATE - RATE_SPREAD)) : secs(n);
    R.total.title = R.total.textContent + '；语速在每秒 ' + (RATE - RATE_SPREAD) + ' 到 ' + (RATE + RATE_SPREAD) + ' 字之间，大约 ' + fmtSecs(fast) + ' 到 ' + fmtSecs(slow);
    if (R.menuTotal) R.menuTotal.textContent = R.total.textContent;
  }
  function refreshRefs() {
    segs.forEach(function (seg) {
      var ui = segUi[seg.id];
      if (!ui) return;
      ui.refEls.forEach(function (x) { x.art.hidden = !ui.anaMode && !!ST.refsHidden[x.ref.who || '参考']; });
      var boxes = ui.sec.querySelectorAll('.ref-pick input');
      Array.prototype.forEach.call(boxes, function (cb) { cb.checked = !ST.refsHidden[cb.getAttribute('data-who')]; });
      refreshSeg(seg);
    });
  }
  function updateUndoBtn() {
    if (!R.undoBtn) return;
    var last = undoStack[undoStack.length - 1], next = redoStack[redoStack.length - 1];
    R.undoBtn.disabled = !last;
    R.undoBtn.title = last ? '撤销：' + last.label + '（⌘Z）' : '没有可以撤销的操作';
    if (R.redoBtn) {
      R.redoBtn.disabled = !next;
      R.redoBtn.title = next ? '重做：' + next.label + '（⇧⌘Z）' : '没有可以重做的操作';
    }
  }
  function refreshAll() {
    segs.forEach(refreshSeg);
    extraTas.forEach(autoGrow);
    refreshOverall();
    refreshCounters();
    refreshTotal();
    if (ST.view === 'reading') renderReading();
    updateUndoBtn();
    Object.keys(R.viewBtns || {}).forEach(function (k) { R.viewBtns[k].setAttribute('aria-pressed', ST.view === k ? 'true' : 'false'); });
    if (R.onlyPending) R.onlyPending.checked = ST.onlyPending;
    refreshSaveInd();
    refreshStickyPad();
    refreshRecord();
    if (CP) placeComposer(false);
  }
  var valuesTimer = 0;
  function refreshAfterValues() {
    if (valuesTimer) return;
    valuesTimer = requestAnimationFrame(function () { valuesTimer = 0; refreshAll(); });
  }

  // ======================= 导航与视图 =======================
  function goSeg(i, scroll) {
    if (!segs.length) return;
    i = Math.max(0, Math.min(segs.length - 1, i));
    ST.seg = i;
    segs.forEach(function (s, j) {
      var ui = segUi[s.id];
      if (ui && ui.sec) ui.sec.classList.toggle('current', j === i);
      if (s._nav) { s._nav.classList.toggle('now', j === i); s._nav.setAttribute('aria-current', j === i ? 'true' : 'false'); }
    });
    var seg = segs[i];
    navIntoView(seg._nav);
    var first = sugsOf(seg).filter(function (s) { return cardVisible(s) && isUndecided(s); })[0];
    ST.activeSug = first ? first.id : null;
    refreshSeg(seg);
    persist();
    if (scroll && segUi[seg.id]) {
      var top = segUi[seg.id].sec.getBoundingClientRect().top, bar = stickyHeight();
      if (top < bar || top > window.innerHeight * 0.6) window.scrollTo(0, Math.max(0, window.scrollY + top - bar - 8));
    }
  }
  function stickyHeight() {
    var t = document.querySelector('.topbar');
    return t && getComputedStyle(t).position === 'sticky' ? t.offsetHeight : 0;
  }
  function refreshStickyPad() { // 用 Tab 或查找跳到某个格子时，浏览器把它滚到钉住的顶栏下面，而不是藏在顶栏后面
    var px = stickyHeight() + 8 + 'px', de = document.documentElement;
    if (de.style.scrollPaddingTop !== px) de.style.scrollPaddingTop = px;
    if (de.style.getPropertyValue('--sticky-top') !== px) de.style.setProperty('--sticky-top', px); // 宽屏时锦成版钉在顶栏下面，见 style.css
  }
  var stepsOpenBefore = null; // 进录制视图前各段「录屏步骤」开没开，出来时还原
  function setView(v) {
    if (v === 'reading' && !R.reading) return;
    if (v === 'record' && !R.recordHead) return;
    if (CP && v !== ST.view) { if (R.cpText.value.trim()) saveComposer(); else closeComposer(); } // 换视图后原文不在同一处了：写了字的先保存，空的直接关
    var was = ST.view;
    ST.view = v;
    if (R.compare) R.compare.hidden = !(v === 'compare' || v === 'record'); // 录制视图用的就是对照区那些段落，只是排法不同
    if (R.reading) R.reading.hidden = v !== 'reading';
    if (R.recordHead) R.recordHead.hidden = v !== 'record';
    document.body.classList.toggle('view-reading', v === 'reading');
    document.body.classList.toggle('view-record', v === 'record');
    if (v === 'record' && was !== 'record') {
      stepsOpenBefore = {};
      segs.forEach(function (s) { var b = segUi[s.id] && segUi[s.id].stepsBox; if (b) { stepsOpenBefore[s.id] = b.open; b.open = true; } });
    } else if (v !== 'record' && was === 'record' && stepsOpenBefore) {
      segs.forEach(function (s) { var b = segUi[s.id] && segUi[s.id].stepsBox; if (b && s.id in stepsOpenBefore) b.open = stepsOpenBefore[s.id]; });
      stepsOpenBefore = null;
    }
    if (v === 'reading') { renderReading(); if (R.recorded) autoGrow(R.recorded); }
    else if (segs[ST.seg]) refreshSeg(segs[ST.seg]);
    persist();
    refreshAll();
    // 录制视图是一整张清单：切过去时从清单顶上看起；从录制切回对照时回到当前这一段（对照只显示这一段）
    if (v === 'record' && was !== 'record' && R.recordHead) window.scrollTo(0, Math.max(0, R.recordHead.getBoundingClientRect().top + window.scrollY - stickyHeight() - 8));
    else if (v === 'compare' && was === 'record') goSeg(ST.seg, true);
  }
  function setFont(d) {
    ST.font = Math.min(24, Math.max(14, ST.font + d));
    document.documentElement.style.setProperty('--fs', ST.font + 'px');
    if (R.fontNow) R.fontNow.textContent = String(ST.font);
    persist();
    refreshAll();
    toast('字号 ' + ST.font);
  }
  function setActive(id) {
    if (ST.activeSug === id) return;
    ST.activeSug = id;
    sugs.forEach(function (s) { if (cardUi[s.id]) cardUi[s.id].el.classList.toggle('is-active', s.id === id); });
  }
  function focusCard(sug) {
    var seg = segOf(sug);
    if (!seg) return;
    var c = sug.locked.category;
    if (c && effectiveCats().indexOf(c) < 0) setCats(effectiveCats().concat([c]));
    if (ST.onlyPending && !isUndecided(sug)) { ST.onlyPending = false; persist(); }
    setView('compare');
    goSeg(seg._no - 1, false);
    setActive(sug.id);
    refreshAll();
    var el = cardUi[sug.id].el;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1400);
  }
  function jumpFirstPendingSug() {
    for (var i = 0; i < segs.length; i++) {
      var p = sugsOf(segs[i]).filter(isUndecided)[0];
      if (p) return focusCard(p);
    }
    toast('没有待确认的建议');
  }
  function jumpFirstPendingNote() {
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (hasField(s, 'note') && notePending(s, 'note')) {
        setView('compare'); goSeg(i, false);
        var n = segUi[s.id].note;
        n.scrollIntoView({ block: 'center' }); n.focus({ preventScroll: true });
        return;
      }
    }
    if (R.overall && notePending(info, 'overall_note')) { R.overall.scrollIntoView({ block: 'center' }); R.overall.focus({ preventScroll: true }); return; }
    toast('没有待 AI 处理的话');
  }

  // ======================= 操作 =======================
  function adopt(sug) {
    var seg = segOf(sug), L = sug.locked, c = cardUi[sug.id];
    if (!seg) return toast('找不到这条建议对应的段落，请让 AI 检查这条建议');
    if (!kitReady()) return toast('保存功能启动中，请稍后再试');
    if (val(sug.id, 'decision')) return toast('这条建议' + (DECISION_TEXT[val(sug.id, 'decision')] || '已有决定') + '，如需重新决定，请先点卡片上的「撤销决定」');
    var mine = val(seg.id, 'mine'), prop = c && c.proposed ? c.proposed.value : val(sug.id, 'proposed'), occ = countOcc(mine, L.original);
    if (occ === 0) return toast('这句你已经改过，这条建议对不上了');
    if (occ > 1) return toast('这句在锦成版里出现了不止一次，无法确定替换哪一处');
    var del = isDeletion(prop), next = replaceOnce(mine, L.original, prop);
    if (next == null) return toast('这句你已经改过，这条建议对不上了');
    // 锦成版和决定同组提交，全成或全不成；删掉整句也一样
    var steps = [{ item: seg.id, field: 'mine', old: mine, new: next }, { item: sug.id, field: 'decision', old: val(sug.id, 'decision'), new: '采纳' }];
    if (c && c.proposed && !same(prop, kit.fileValue(sug.id, 'proposed'))) steps.push({ item: sug.id, field: 'proposed', old: kit.fileValue(sug.id, 'proposed'), new: prop, noUndo: true }); // 先改再采纳：改过的「改成」一起提交
    applySteps(steps, '采纳第 ' + seg._no + ' 段「' + snippet(L.original, 10) + '」' + (del ? '（删掉这句）' : '')).then(function (ok) {
      if (!ok) return;
      toast(del ? '已采纳并从第 ' + seg._no + ' 段锦成版删掉这句' : '已采纳并替换第 ' + seg._no + ' 段锦成版里的原句');
      nextActive(seg);
    });
  }
  function reject(sug) {
    var seg = segOf(sug);
    if (val(sug.id, 'decision')) return toast('这条建议' + (DECISION_TEXT[val(sug.id, 'decision')] || '已有决定') + '，如需重新决定，请先点卡片上的「撤销决定」');
    applySteps([{ item: sug.id, field: 'decision', old: val(sug.id, 'decision'), new: '不采纳' }], '不采纳' + (seg ? '第 ' + seg._no + ' 段' : '') + '「' + snippet(sug.locked.original, 10) + '」').then(function (ok) {
      if (ok && seg) nextActive(seg);
    });
  }
  function editFirst(sug) { // 打开「改成」输入框并全选；再点一下收起（改过的字照样自动写回）
    var c = cardUi[sug.id];
    if (!c || !c.proposed) return;
    setActive(sug.id);
    c.editing = !c.editing;
    updateCard(sug);
    if (!c.editing) return;
    c.proposed.focus(); c.proposed.select();
    toast('改好「改成」后点「采纳」；清空表示删掉这句');
  }
  function revoke(sug) {
    var seg = segOf(sug), dec = val(sug.id, 'decision'), steps = [{ item: sug.id, field: 'decision', old: dec, new: '' }];
    if (dec === '采纳' && seg) {
      var mine = val(seg.id, 'mine'), prop = val(sug.id, 'proposed');
      if (isDeletion(prop)) { // 删掉的句子没留位置，只能靠这次采纳记下的「采纳前的锦成版」放回去；采纳后这段又改过就放不回
        var prev = adoptedFrom(sug, seg, mine);
        if (prev != null) steps.unshift({ item: seg.id, field: 'mine', old: mine, new: prev });
        else toast('删掉的那句无法放回原处（这一段后来又修改过，或者不是在这个窗口采纳的），只把这条建议改回「待确认」，原句仍在卡片上');
      } else if (countOcc(mine, prop) === 1 && countOcc(mine, sug.locked.original) === 0) {
        var nm = norm(mine), np = norm(prop), at = nm.indexOf(np);
        steps.unshift({ item: seg.id, field: 'mine', old: mine, new: nm.slice(0, at) + norm(sug.locked.original) + nm.slice(at + np.length) });
      } else toast('锦成版里已找不到采纳时换上的那句，只把这条建议改回「待确认」');
    }
    applySteps(steps, '把' + (seg ? '第 ' + seg._no + ' 段' : '') + '「' + snippet(sug.locked.original, 10) + '」改回待确认');
  }
  function adoptedFrom(sug, seg, mine) { // 在撤销记录里找「采纳这条」那一步：采纳后锦成版没再动过，就返回采纳前的锦成版
    var all = undoStack.concat(redoStack);
    for (var i = all.length - 1; i >= 0; i--) {
      var st = all[i].steps || [], m = null, d = false;
      st.forEach(function (x) {
        if (x.item === sug.id && x.field === 'decision' && x.new === '采纳') d = true;
        if (x.item === seg.id && x.field === 'mine') m = x;
      });
      if (d && m && same(m.new, mine)) return m.old;
    }
    return null;
  }
  function nextActive(seg) {
    var next = sugsOf(seg).filter(function (s) { return cardVisible(s) && isUndecided(s); })[0];
    setActive(next ? next.id : null);
  }
  function toggleApprove() {
    var cur = val(info.id, 'approved');
    applySteps([{ item: info.id, field: 'approved', old: cur, new: cur ? '' : isoNow() }], cur ? '取消「内容已确认」' : '勾选「内容已确认」').then(function (ok) {
      if (ok) toast(cur ? '已取消「内容已确认」' : '已勾选「内容已确认」，请回到聊天告知 AI');
    });
  }
  function moveNoteToMine(seg) {
    var ui = segUi[seg.id], note = val(seg.id, 'note'), body = draftBody(note);
    if (!body) return;
    var mine = val(seg.id, 'mine'), next = mine.replace(/\s+$/, '') + (mine.trim() ? '\n' : '') + body;
    applySteps([{ item: seg.id, field: 'mine', old: mine, new: next }, { item: seg.id, field: 'note', old: note, new: '' }], '把第 ' + seg._no + ' 段写给 AI 的话挪进锦成版').then(function (ok) {
      if (ok) { toast('已挪进锦成版末尾，写给 AI 的话已清空；要恢复，请按 ⌘Z 或在「更多」里点「撤销」'); ui.mine.focus({ preventScroll: true }); }
    });
  }

  // ---------- 选中文字 → 写给 AI（就地批注框） ----------
  // 选中参考、锦成版或通读里的文字，浮出「写给 AI」；点了在原文旁边打开批注框，页面不滚动，选中的字一直标黄，
  // 对照着原文写。点「保存」把「原句：「…」」和写的话一起追加进这段的「写给 AI 的话」（数据格式不变，AI 照旧读这一格）。
  // 选区按「在哪个元素里的第几个字到第几个字」记，页面重画（例如 AI 改了文件）以后按原文重新找回来；
  // 没保存的字存在这个窗口的 sessionStorage，刷新页面后批注框和字都还在。
  var popState = null;
  var CP = null; // 打开着的批注框：{ seg, src: 'ref' | 'mine' | 'read', who, start, end, raw }
  var CP_KEY = 'jc-cp-note-draft-' + PID;
  function showPop(x, y, s) {
    popState = s;
    R.pop.hidden = false;
    var w = R.pop.offsetWidth || 90, left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)), top = y + 14;
    if (top + 44 > window.innerHeight) top = y - 50;
    R.pop.style.left = left + 'px'; R.pop.style.top = Math.max(8, top) + 'px';
  }
  function hidePop() { R.pop.hidden = true; popState = null; }
  // 选区在某个元素里从第几个字到第几个字（按 textContent 数），选区超出这个元素的部分不算
  function offsetsIn(host, range) {
    var pre = document.createRange();
    pre.selectNodeContents(host);
    if (host.contains(range.startContainer)) pre.setEnd(range.startContainer, range.startOffset); else pre.collapse(true);
    var start = pre.toString().length, all = host.textContent.length, end;
    if (host.contains(range.endContainer)) { pre.setEnd(range.endContainer, range.endOffset); end = pre.toString().length; } else end = all;
    return { start: start, end: Math.max(start, end) };
  }
  function rangeAt(host, start, end) { // 反过来：从第几个字到第几个字，做成一个选区
    var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT), n, p = 0, r = document.createRange(), s = false;
    while ((n = w.nextNode())) {
      var len = n.nodeValue.length;
      if (!s && start <= p + len) { r.setStart(n, start - p); s = true; }
      if (s && end <= p + len) { r.setEnd(n, end - p); return r; }
      p += len;
    }
    return null;
  }
  function selectionFrom(target) {
    var ta = target && target.closest ? target.closest('textarea.mine') : null;
    if (ta) {
      var a = ta.selectionStart, b = ta.selectionEnd;
      return { seg: ta.getAttribute('data-item'), src: 'mine', start: a, end: b, raw: ta.value.slice(a, b) };
    }
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var node = sel.anchorNode, el = node && (node.nodeType === 1 ? node : node.parentNode);
    var host = el && el.closest ? el.closest('[data-quote-seg]') : null;
    if (!host) return null;
    var o = offsetsIn(host, sel.getRangeAt(0)), art = host.closest('.ref');
    return { seg: host.getAttribute('data-quote-seg'), src: host.classList.contains('r-text') ? 'read' : host.classList.contains('ana') ? 'ana' : 'ref', who: art ? art.getAttribute('data-who') : '',
      start: o.start, end: o.end, raw: host.textContent.slice(o.start, o.end), range: sel.getRangeAt(0) };
  }
  function quoteHead(src) { return src === 'ana' ? '分析：' : '原句：'; } // 批注引的是参考分析里的话，就写「分析：」，免得 AI 当成稿子或原片里的原句
  function quoteText(raw) { return String(raw || '').replace(/\s+/g, ' ').trim(); }
  document.addEventListener('mouseup', function (e) {
    if (R.pop.contains(e.target) || R.cp.contains(e.target)) return;
    setTimeout(function () {
      var s = selectionFrom(e.target);
      if (!s || !quoteText(s.raw) || !has('notes')) return hidePop();
      showPop(e.clientX, e.clientY, s);
    }, 0);
  });
  var selTimer = 0;
  document.addEventListener('selectionchange', function () { // 手机上长按选字没有 mouseup
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      if (!R.pop.hidden || !has('notes')) return;
      var a = document.activeElement;
      if (a && R.cp.contains(a)) return;
      var s = selectionFrom(a && a.tagName === 'TEXTAREA' ? a : null);
      if (!s || !quoteText(s.raw)) return;
      var r = s.range ? s.range.getBoundingClientRect() : a.getBoundingClientRect();
      showPop(r.left + Math.min(r.width, 160) / 2, s.range ? r.bottom : r.top + 20, s);
    }, 500);
  });
  document.addEventListener('mousedown', function (e) {
    if (!R.pop.contains(e.target)) hidePop();
    if (CP && !R.cp.contains(e.target) && !R.pop.contains(e.target) && !R.cpText.value.trim()) closeComposer(); // 批注框里有字时点别处不关，免得写了一半的话丢掉
  });
  window.addEventListener('scroll', function () { if (!R.pop.hidden) hidePop(); }, { passive: true });
  function onPopClick() {
    if (!popState) return;
    var st = popState;
    hidePop();
    openComposer(st, '');
  }

  // 批注框本体：建一次，反复用
  function buildComposer() {
    R.cpText = h('textarea', { class: 'cp-text', rows: 3, autocomplete: 'off', placeholder: '写下你的意见，比如为什么不认可、想怎么改', 'aria-label': '写给 AI 的批注',
      oninput: function () { autoGrow(R.cpText); saveDraft(); R.cpSave.disabled = !R.cpText.value.trim(); },
      onkeydown: function (e) {
        if (e.isComposing) return;
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveComposer(); }
        else if (e.key === 'Escape') { e.preventDefault(); if (!R.cpText.value.trim()) closeComposer(); else toast('批注还没保存。不需要的话，点「取消」'); }
      } });
    R.cpWhere = h('span', { class: 'cp-where' });
    R.cpQuote = h('div', { class: 'cp-quote' });
    R.cpSave = h('button', { type: 'button', class: 'btn primary small', disabled: true, onclick: function () { saveComposer(); } }, '保存');
    return h('div', { class: 'composer', role: 'dialog', 'aria-label': '写给 AI', hidden: true }, [
      h('div', { class: 'cp-head' }, [h('b', null, '写给 AI'), R.cpWhere]),
      R.cpQuote,
      R.cpText,
      h('div', { class: 'cp-foot' }, [
        h('span', { class: 'cp-hint' }, '⌘ Enter 保存'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn ghost small', onclick: function () { closeComposer(); } }, '取消'),
        R.cpSave
      ])
    ]);
  }
  function cpHost(c) { // 批注框对着的那段原文所在的元素；找不到（例如换了视图）返回 null
    var ui = segUi[c.seg];
    if (c.src === 'mine') return ui && ui.back && ui.back.offsetParent ? ui.back : null;
    if (c.src === 'ana') { var an = ui && ui.ana; return an && an.offsetParent ? an : null; } // 选的是参考分析里的字
    if (c.src === 'read') { var el = R.readText ? R.readText.querySelector('.r-text[data-quote-seg="' + c.seg + '"]') : null; return el && el.offsetParent ? el : null; }
    var x = ui ? ui.refEls.filter(function (r) { return (r.ref.who || '参考') === c.who; })[0] : null;
    return x && x.text.offsetParent ? x.text : null;
  }
  function cpSource(c) { // 在锦成版里就对 textarea 的值找，其余对元素里的字找
    if (c.src === 'mine') { var ui = segUi[c.seg]; return ui && ui.mine ? ui.mine.value : ''; }
    var host = cpHost(c);
    return host ? host.textContent : null;
  }
  function relocate(c) { // 原文变了（AI 改了文件、锦成在别处改了）：原位置对不上就按原文找唯一的一处，找不到就不标
    var text = cpSource(c);
    if (text == null) return false;
    if (text.slice(c.start, c.end) === c.raw) return true;
    var i = text.indexOf(c.raw);
    if (i < 0 || text.indexOf(c.raw, i + 1) >= 0) return false;
    c.start = i; c.end = i + c.raw.length;
    return true;
  }
  var HL = window.CSS && CSS.highlights && typeof window.Highlight === 'function';
  function paintQuote() { // 参考和通读里的原文用浏览器的高亮标黄；锦成版里的在文本框背后的底层画（见 refreshSeg）
    if (HL) CSS.highlights.delete('jc-quote');
    if (!CP || CP.src === 'mine' || !relocate(CP)) return;
    var host = cpHost(CP), r = host && rangeAt(host, CP.start, CP.end);
    if (r && HL) CSS.highlights.set('jc-quote', new Highlight(r));
  }
  function mineQuoteRange(seg, mine) {
    if (!CP || CP.src !== 'mine' || CP.seg !== seg.id) return null;
    if (mine.slice(CP.start, CP.end) !== CP.raw) {
      var i = mine.indexOf(CP.raw);
      if (i < 0 || mine.indexOf(CP.raw, i + 1) >= 0) return null;
      CP.start = i; CP.end = i + CP.raw.length;
    }
    return [CP.start, CP.end];
  }
  function anchorRect() { // 原文在屏幕上的位置：第一行的左边、最上沿、最下沿
    if (!CP) return null;
    var rects = [];
    if (CP.src === 'mine') {
      var ui = segUi[CP.seg];
      Array.prototype.forEach.call(ui && ui.back ? ui.back.querySelectorAll('.quote-mark') : [], function (m) { rects = rects.concat(Array.prototype.slice.call(m.getClientRects())); });
    } else if (relocate(CP)) {
      var host = cpHost(CP), r = host && rangeAt(host, CP.start, CP.end);
      if (r) rects = Array.prototype.slice.call(r.getClientRects());
    }
    rects = rects.filter(function (x) { return x.width || x.height; });
    if (!rects.length) return null;
    var top = Infinity, bottom = -Infinity;
    rects.forEach(function (x) { top = Math.min(top, x.top); bottom = Math.max(bottom, x.bottom); });
    return { left: rects[0].left, top: top, bottom: bottom };
  }
  // 批注框放在原文正下方，盖住的是后面的字，选中的原句和前文都看得见。
  // 打开时下面放不下：先试着往下滚一点点，只要原句不滚到顶栏下面就行；滚了也放不下（原句太长）才放到原句上面；
  // 上面也放不下就放下面，滚到原句顶端贴着顶栏为止。之后页面重画时只跟着原文挪位置，不再滚动。
  function placeComposer(opening) {
    if (!CP) return;
    var el = R.cp, vw = document.documentElement.clientWidth, vh = window.innerHeight, r = anchorRect();
    el.style.width = Math.min(460, vw - 32) + 'px';
    if (!r) return; // 原文暂时找不到：批注框留在原处
    var hgt = el.offsetHeight, bar = stickyHeight(), w = el.offsetWidth;
    var need = r.bottom + 10 + hgt + 8 - vh, room = Math.max(0, r.top - bar - 8), scroll = 0, place = opening ? 'below' : (CP.place || 'below');
    if (opening && need > 0) {
      if (need <= room) scroll = need;
      else if (r.top - 10 - hgt >= bar + 8) place = 'above';
      else scroll = room;
    }
    var sx = window.scrollX, sy = window.scrollY; // r 是按现在的滚动位置量的，换算成页面上的位置要用滚动前的值
    var top = place === 'above' ? r.top - 10 - hgt : r.bottom + 10;
    el.style.left = (Math.max(16, Math.min(vw - w - 16, r.left)) + sx) + 'px';
    el.style.top = (top + sy) + 'px';
    if (scroll) window.scrollBy(0, scroll);
    CP.place = place;
  }
  function openComposer(s, text, restoring) {
    var seg = byId[s.seg];
    if (!seg || !hasField(seg, 'note')) return toast('这一段没有「写给 AI 的话」，无法写批注');
    if (CP && R.cpText.value.trim() && !restoring) {
      R.cpText.focus({ preventScroll: true });
      return toast('上一条批注还没保存，请先保存或取消');
    }
    CP = { seg: s.seg, src: s.src, who: s.who || '', start: s.start, end: s.end, raw: s.raw };
    var from = s.src === 'mine' ? '锦成版' : s.src === 'read' ? '通读' : s.src === 'ana' ? '参考分析' : (s.who || '参考');
    R.cpWhere.textContent = '第 ' + seg._no + ' 段 · 选自' + from;
    R.cpQuote.textContent = quoteHead(s.src) + '「' + quoteText(s.raw) + '」';
    R.cpQuote.title = quoteText(s.raw);
    R.cpText.value = text || '';
    R.cpSave.disabled = !R.cpText.value.trim();
    R.cp.hidden = false;
    if (s.src === 'mine') refreshSeg(seg); else paintQuote();
    var sel = window.getSelection(); if (sel && sel.removeAllRanges && s.src !== 'mine') sel.removeAllRanges();
    autoGrow(R.cpText);
    placeComposer(true);
    R.cpText.focus({ preventScroll: true });
    R.cpText.setSelectionRange(R.cpText.value.length, R.cpText.value.length);
    saveDraft();
  }
  function closeComposer() {
    if (!CP) return;
    var seg = byId[CP.seg], wasMine = CP.src === 'mine';
    CP = null;
    R.cp.hidden = true;
    R.cpText.value = '';
    ssSet(CP_KEY, null);
    if (HL) CSS.highlights.delete('jc-quote');
    if (wasMine && seg) refreshSeg(seg);
  }
  function saveDraft() {
    if (!CP) return;
    ssSet(CP_KEY, JSON.stringify({ seg: CP.seg, src: CP.src, who: CP.who, start: CP.start, end: CP.end, raw: CP.raw, text: R.cpText.value }));
  }
  function saveComposer() {
    if (!CP) return;
    var c = CP, seg = byId[c.seg], words = R.cpText.value.trim();
    if (!words) { R.cpText.focus({ preventScroll: true }); return toast('请先写下你的意见'); }
    var cur = val(c.seg, 'note'), block = quoteHead(c.src) + '「' + quoteText(c.raw) + '」\n' + words;
    var next = cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' + block : block;
    R.cpSave.disabled = true;
    applySteps([{ item: c.seg, field: 'note', old: cur, new: next }], '给第 ' + seg._no + ' 段写批注「' + snippet(quoteText(c.raw), 10) + '」').then(function (ok) {
      if (!ok) { R.cpSave.disabled = !R.cpText.value.trim(); return; } // 没存上：批注框和字都留着
      if (CP === c) closeComposer();
      toast('已保存到第 ' + seg._no + ' 段的「写给 AI 的话」');
    });
  }
  function restoreDraft() { // 刷新页面前批注框里还有没保存的字：原文找得到就原样打开，找不到就把字放进这段的「写给 AI 的话」，不丢
    var d = null;
    try { d = JSON.parse(ssGet(CP_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || !d.seg || !byId[d.seg] || !String(d.text || '').trim()) { ssSet(CP_KEY, null); return; }
    if (d.src === 'read' && ST.view !== 'reading') setView('reading');
    if (d.src !== 'read' && ST.view !== 'compare') setView('compare');
    var probe = { seg: d.seg, src: d.src, who: d.who, start: d.start, end: d.end, raw: d.raw };
    if (relocate(probe)) return openComposer(probe, d.text, true);
    var seg = byId[d.seg], cur = val(d.seg, 'note'), block = quoteHead(d.src) + '「' + quoteText(d.raw) + '」\n' + String(d.text).trim();
    applySteps([{ item: d.seg, field: 'note', old: cur, new: cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' + block : block }], '给第 ' + seg._no + ' 段补存刷新前未保存的批注').then(function (ok) {
      if (ok) { ssSet(CP_KEY, null); toast('刷新前未保存的批注无法定位原句，已直接保存到第 ' + seg._no + ' 段的「写给 AI 的话」'); }
    });
  }

  // ---------- 改动痕迹 ----------
  function toggleHistory(seg) {
    var ui = segUi[seg.id];
    ui.hist.hidden = !ui.hist.hidden;
    ui.histBtn.setAttribute('aria-expanded', ui.hist.hidden ? 'false' : 'true');
    if (!ui.hist.hidden) loadHistory(seg);
  }
  function loadHistory(seg) {
    var ui = segUi[seg.id];
    clear(ui.hist).appendChild(h('p', { class: 'muted' }, '正在读取改动记录…'));
    if (!kit || !kit.changes) return renderHistory(seg, null, new Error('保存功能没有启动'));
    kit.changes(seg.id).then(function (list) { renderHistory(seg, list); }, function (e) { renderHistory(seg, null, e); });
  }
  function versionsOf(list) {
    var out = [], cur = null;
    list.filter(function (c) { return c && c.field === 'mine'; }).forEach(function (c) {
      var t = Date.parse(c.time) || 0;
      if (cur && t - cur.end <= MERGE_MS) { cur.end = t; cur.after = c.after; cur.n++; if (c.origin === 'brain_page') cur.ai = true; }
      else { cur = { start: t, end: t, before: c.before, after: c.after, n: 1, ai: c.origin === 'brain_page' }; out.push(cur); }
    });
    return out;
  }
  function renderHistory(seg, list, err) {
    var ui = segUi[seg.id], box = clear(ui.hist), mine = val(seg.id, 'mine');
    box.appendChild(h('div', { class: 'hist-head' }, [h('b', null, '第 ' + seg._no + ' 段改动记录'), h('span', { class: 'muted' }, '两分钟内的连续保存合为一个版本；点「恢复此版本」后，恢复本身也会记为一个新版本'),
      h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn ghost small', onclick: function () { loadHistory(seg); } }, '刷新'), h('button', { type: 'button', class: 'btn ghost small', onclick: function () { toggleHistory(seg); } }, '收起')]));
    if (!list) {
      var why = !err ? '' : (err.name === 'TypeError' || err.name === 'AbortError') ? '保存服务未连接' : err.message;
      box.appendChild(h('p', { class: 'hist-off' }, '无法读取改动记录' + (why ? '（' + why + '）' : '') + '，先显示和 AI 交稿版相比的改动：'));
      box.appendChild(diffNode(diffChars(seg.locked.baseline || '', mine)));
      return;
    }
    var vers = versionsOf(list).reverse();
    if (!vers.length) box.appendChild(h('p', { class: 'muted' }, '这一段的锦成版还没有改动记录（只记录从这个页面或由 AI 保存到文件的改动）'));
    vers.forEach(function (v) {
      var ops = diffChars(v.before, v.after), st = diffStat(ops), isNow = same(v.after, mine);
      var d = h('div', { class: 'ver-diff', hidden: true }, diffNode(ops));
      var useBtn = h('button', { type: 'button', class: 'btn small', disabled: isNow || !kitReady(), onclick: function () {
        applySteps([{ item: seg.id, field: 'mine', old: val(seg.id, 'mine'), new: v.after }], '把第 ' + seg._no + ' 段恢复为 ' + dayTime(v.end) + ' 的版本').then(function (ok) {
          if (ok) { toast('已恢复为 ' + dayTime(v.end) + ' 的版本'); setTimeout(function () { if (!ui.hist.hidden) loadHistory(seg); }, 1800); }
        });
      } }, isNow ? '当前版本' : '恢复此版本');
      box.appendChild(h('div', { class: 'ver' + (isNow ? ' now' : '') }, [
        h('div', { class: 'ver-head' }, [
          h('b', null, dayTime(v.end)),
          h('span', { class: 'muted' }, (v.n > 1 ? '（从 ' + hhmm(new Date(v.start)) + ' 起连续修改 ' + v.n + ' 次）' : '') + (v.ai ? '（AI 修改）' : '')),
          h('span', { class: 'ver-stat' }, '删去 ' + st.del + ' 字 · 新增 ' + st.add + ' 字'),
          h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'btn ghost small', onclick: function (e) { d.hidden = !d.hidden; e.target.textContent = d.hidden ? '查看改动' : '收起改动'; } }, '查看改动'),
          useBtn
        ]), d
      ]));
    });
    if (seg.locked.baseline != null) {
      var bops = diffChars(seg.locked.baseline, mine), bd = h('div', { class: 'ver-diff', hidden: true }, diffNode(bops)), bst = diffStat(bops);
      box.appendChild(h('div', { class: 'ver base' }, [
        h('div', { class: 'ver-head' }, [h('b', null, 'AI 交稿版'), h('span', { class: 'muted' }, 'AI 上次交稿时的锦成版；和当前相比删去 ' + bst.del + ' 字、新增 ' + bst.add + ' 字'), h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'btn ghost small', onclick: function (e) { bd.hidden = !bd.hidden; e.target.textContent = bd.hidden ? '查看改动' : '收起改动'; } }, '查看改动'),
          h('button', { type: 'button', class: 'btn small', disabled: !bst.changed || !kitReady(), onclick: function () {
            applySteps([{ item: seg.id, field: 'mine', old: val(seg.id, 'mine'), new: seg.locked.baseline }], '把第 ' + seg._no + ' 段恢复为 AI 交稿版').then(function (ok) { if (ok) { toast('已恢复为 AI 交稿版'); setTimeout(function () { if (!ui.hist.hidden) loadHistory(seg); }, 1800); } });
          } }, bst.changed ? '恢复此版本' : '当前版本')]),
        bd
      ]));
    }
  }

  // ---------- 复制提词稿、复制给 AI ----------
  function teleprompterText() {
    return segs.filter(function (s) { return s.locked.teleprompter !== false; }).map(function (s) {
      return val(s.id, 'mine').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
    }).filter(Boolean).join('\n');
  }
  function aiMarkdown() {
    var inf = kit && kit.info ? kit.info() : { path: '', pageId: PID }, L = [];
    L.push('# ' + (raw.content_id || '') + ' 创作页：给 AI 的清单', '');
    L.push('- 页面：' + (info.locked.title || '') + '（page_id：' + PID + '）');
    L.push('- 文件：' + (inf.path || '（不是经保存服务打开的，路径未知）'));
    L.push('- 类型：' + (TYPE || '未写') + '，阶段：' + (info.locked.stage || '未写'));
    var ap = val(info.id, 'approved');
    L.push('- 内容已确认：' + (ap ? '是（' + ap + '）' : '还没有'));
    L.push('- 导出时间：' + new Date().toLocaleString('zh-CN'), '');
    var ov = val(info.id, 'overall_note');
    if (ov.trim()) L.push('## 整体意见' + (notePending(info, 'overall_note') ? '（待处理）' : '（AI 处理过）'), '', ov.trim(), '');
    var notes = segs.filter(function (s) { return hasField(s, 'note') && notePending(s, 'note'); });
    L.push('## 写给 AI 的话（' + notes.length + ' 条待处理）', '');
    if (!notes.length) L.push('没有待处理的。', '');
    notes.forEach(function (s) { L.push('### 第 ' + s._no + ' 段「' + (s.locked.title || '') + '」（段 id：' + s.id + '）', '', val(s.id, 'note').trim(), ''); });
    L.push('## 建议的决定', '');
    if (!sugs.length) L.push('没有建议。', '');
    segs.forEach(function (s) {
      sugsOf(s).forEach(function (g) {
        var dec = val(g.id, 'decision'), prop = val(g.id, 'proposed');
        L.push('- 第 ' + s._no + ' 段 · ' + (g.locked.category || '') + ' · 建议 id ' + g.id + '：' + (dec || (g.locked.verdict === '不用改' ? '结论是不用改，没表态' : '还没定')) +
          '。原句「' + g.locked.original + '」→ ' + (isDeletion(prop) ? '删掉这句' : '改成「' + prop + '」'));
      });
    });
    L.push('');
    if (has('visual')) { // 教程：画面栏（锦成可能改过）
      var vis = segs.filter(function (s) { return hasField(s, 'visual_type') || hasField(s, 'our_visual'); });
      if (vis.length) {
        L.push('## 画面（段 id、画面类型 visual_type、我方画面 our_visual）', '');
        vis.forEach(function (s) { L.push('- 第 ' + s._no + ' 段「' + (s.locked.title || '') + '」（' + s.id + '）：【' + (val(s.id, 'visual_type') || '没选') + '】' + (val(s.id, 'our_visual') || '（没写）')); });
        L.push('');
      }
    }
    if (has('steps') && steps.length) { // 教程：录屏步骤，要发送的内容以页面上为准（锦成可能改过）
      L.push('## 录屏步骤（要发送的内容 prompt 以这里为准）', '');
      steps.forEach(function (st) {
        var sg = byId[st.locked.segment], pr = hasField(st, 'prompt') ? val(st.id, 'prompt') : String(st.locked.prompt || '');
        L.push('### 第 ' + st._no + ' 步（' + (sg && sg._no ? '第 ' + sg._no + ' 段，' : '') + '条目 id ' + st.id + '）' + (st.locked.where ? '在哪发：' + st.locked.where : ''), '');
        if (pr) L.push('```text', pr, '```', '');
      });
    }
    var ex = [];
    [info].concat(segs, sugs, others).forEach(function (it) {
      if (!it || !it.id) return;
      var own = OWN_FIELDS[it._kind] || [];
      extraKeys(it.fields, own).forEach(function (f) {
        var v = val(it.id, f);
        if (v.trim()) ex.push('- ' + where(it.id) + '的「' + keyLabel(f) + '」（条目 id ' + it.id + '，字段 ' + f + '）：' + v.trim().replace(/\n/g, ' / '));
      });
    });
    if (ex.length) L.push('## 其他格子（专门模块还没做的）', '', ex.join('\n'), '');
    L.push('', '## 锦成版和底稿比的删改（CriticMarkup：{--删掉的--}、{++加上的++}、{~~原来~>现在~~}）', '');
    var any = false;
    segs.forEach(function (s) {
      if (s.locked.baseline == null) return;
      var ops = diffChars(s.locked.baseline, val(s.id, 'mine'));
      if (!diffStat(ops).changed) return;
      any = true;
      L.push('### 第 ' + s._no + ' 段「' + (s.locked.title || '') + '」', '', critic(ops), '');
    });
    if (!any) L.push('和底稿比没有改动。', '');
    var ks = kit && kit.state ? kit.state() : null;
    if (ks && (ks.pending || ks.conflicts)) L.push('## 还没写回文件的改动', '', '页面上还有 ' + ks.pending + ' 处改动没写回、' + ks.conflicts + ' 处冲突。明细：', '', kit.markdown(), '');
    return L.join('\n');
  }
  function copyText(text, okMsg) {
    function legacy() {
      var t = h('textarea'); t.value = text; t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      t.remove();
      return ok;
    }
    function done(ok) {
      if (ok) return toast(okMsg);
      showManual(text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(legacy()); });
    else done(legacy());
  }
  function showManual(text) {
    var ta = h('textarea', { class: 'manual-text', readonly: true }), box;
    ta.value = text;
    box = h('div', { class: 'manual', role: 'dialog', 'aria-label': '手动复制' }, h('div', { class: 'manual-in' }, [
      h('p', null, '浏览器不允许自动复制，内容已全部选中，请按 ⌘C（Windows 按 Ctrl+C）复制'), ta,
      h('button', { type: 'button', class: 'btn', onclick: function () { box.remove(); } }, '关闭')
    ]));
    document.body.appendChild(box);
    ta.focus(); ta.select();
  }
  function copyTeleprompter() {
    var t = teleprompterText();
    copyText(t, '已复制提词稿，共 ' + chars(t) + ' 字，不含空行');
  }
  function copyForAi() { copyText(aiMarkdown(), '已复制给 AI 的清单，粘贴到聊天里即可'); }

  // ---------- 提示 ----------
  var toastTimer = 0;
  function toast(msg) { // 字越多停得越久：40 字约 6 秒，最长 10 秒；鼠标停在提示条上时先不收
    R.toast.textContent = msg; R.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, Math.min(10000, Math.max(3200, String(msg).length * 150)));
  }
  function hideToast() { if (R.toast.matches(':hover')) toastTimer = setTimeout(hideToast, 1000); else R.toast.hidden = true; }

  // ======================= 键盘 =======================
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase(), inField = isEditable(e.target);
    if (k === 'escape' && R.topbar && (R.more.classList.contains('open') || R.topbar.classList.contains('save-open'))) {
      var back = R.more.classList.contains('open') ? R.moreBtn : R.saveInd;
      closePops(); if (back && back.focus) back.focus(); return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && k === 'z') {
      if (inField) return; // 文本框里交给浏览器自己的撤销
      e.preventDefault(); undo(e.shiftKey); return;
    }
    if (inField || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (ST.view === 'reading') return;
    if (k === 'j') { e.preventDefault(); goSeg(ST.seg + 1, true); }
    else if (k === 'k') { e.preventDefault(); goSeg(ST.seg - 1, true); }
    else if ((k === 'a' || k === 'r') && ST.view === 'compare') { // 录制视图里建议卡是藏着的，A、R 不动它
      var s = ST.activeSug && byId[ST.activeSug];
      if (!s) return toast('这一段没有待确认的建议');
      e.preventDefault();
      if (k === 'a') { if (cardUi[s.id].yes.disabled) toast(cardUi[s.id].miss.textContent || '这条建议暂时无法采纳'); else adopt(s); } else reject(s);
    }
    else if (k === 'escape') hidePop();
  });

  // ======================= 和 kit 接上 =======================
  var draftChecked = false;
  if (kit && kit.subscribe) {
    kit.subscribe(function (ev) {
      if (ev.type === 'ready' && !draftChecked) { draftChecked = true; setTimeout(restoreDraft, 0); }
      if (ev.type === 'ready' || ev.type === 'values') refreshAfterValues();
      else if (ev.type === 'state' || ev.type === 'failed') { refreshCounters(); refreshSaveInd(); segs.forEach(function (s) { sugsOf(s).forEach(updateCard); }); }
    });
  }
  window.addEventListener('resize', function () { refreshAfterValues(); });

  // 首次画
  setView(ST.view);
  goSeg(ST.seg, false);
  refreshAll();
  updateUndoBtn();
  // 给自动测试和调试用
  window.jcApp = {
    teleprompterText: teleprompterText, aiMarkdown: aiMarkdown, goSeg: goSeg, setView: setView, undo: function () { undo(false); }, redo: function () { undo(true); },
    state: function () { return { view: ST.view, stage: STAGE, seg: segs[ST.seg] ? segs[ST.seg].id : null, activeSug: ST.activeSug, undo: undoStack.length, redo: redoStack.length, cats: effectiveCats(), catFilter: catFilterOn(), onlyPending: ST.onlyPending, others: others.length, compact: isCompact() }; },
    saveLabel: saveLabel, replaceOnce: replaceOnce, closePops: closePops,
    config: CFG, type: TYPE
  };
})();
/* jc-app:eof */
