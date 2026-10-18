/* 自媒体工作台 · 界面
   一期三件事：模板（拆出来的）· 内容（一条内容一个项目）· 出封面；日历看排出去的事并在上面记发布；提示词是手边的话术库。
   规矩：用状态、数字、清单表达，不写说明句；解释放悬浮提示；出错才弹窗，弹窗最后一个按钮是「取消」。
   浏览器仅演示鉴权状态；构建配置由 release.config.json 生成，真实授权交由未来桌面主进程与 CLI。 */
(function () {
    'use strict';
    const D = window.NCH;
    const {TAG, BTN, STAGE, IMG, BRAND} = D;
    const H = D.HOST_NAME, HOST = () => H(D.SETTINGS.host);
    const CH = c => D.chanOf(c);
    /* AUTH_MODE 仅来自生成的构建配置，不读取 URL / localStorage 的授权开关。 */
    const W = window.NCH_WORKSPACE;
    const FEATURE_AUTH = W.config.AUTH_MODE === 'required';

    const IP = {
        grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
        flag: 'M6 4v16M6 5h11l-2 3.5L17 12H6',
        img: 'M4 5h16v14H4zM8.5 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM20 15.5L15 11l-6 6',
        cal: 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4',
        tpl: 'M4 4h16v5H4zM4 12h7v8H4zM14 12h6v8h-6z',
        plus: 'M12 5v14M5 12h14',
        folder: 'M3 6h6l2 2h10v10H3z',
        down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
        copy: 'M9 9h10v10H9zM4 4h10v3',
        clock: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4.2l3 1.8',
        chev: 'M9 6l6 6-6 6',
        search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2',
        edit: 'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
        menu: 'M4 7h16M4 12h16M4 17h16',
        ext: 'M14 4h6v6M20 4l-9 9M18 13v6H5V6h6',
        check: 'M5 13l4 4L19 7',
        heart: 'M12 20s-7-4.5-7-9.3A3.8 3.8 0 0112 8.6 3.8 3.8 0 0119 10.7C19 15.5 12 20 12 20z',
        dots: 'M6 12h.01M12 12h.01M18 12h.01',
        plug: 'M9 3v5M15 3v5M7 8h10v4a5 5 0 01-10 0zM12 17v4',
        trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
        zin: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2M11 8v6M8 11h6',
        zout: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2M8 11h6',
        fit: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',
        drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
        star: 'M12 4l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z',
        prompt: 'M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4 4v-4H6a2 2 0 01-2-2zM8 8h8M8 11h5'
    };
    const ic = (n, s) => `<svg class="ic" width="${s || 16}" height="${s || 16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${IP[n] || ''}"/></svg>`;

    const LS = 'nch-lib-v5';
    const S = {
        page: 'today', pid: null, tid: null, taudience: '', tscenario: '', calMode: 'month', focusDay: '', chFilter: '',
        month: D.monthOf(D.TODAY), filter: 'run', kw: '', motion: true, sel: {}, old: {}, bad: false,
        pkw: '', pcat: '', ptag: '', pfavOnly: false, pmiss: false, poff: false, pfav: {}, psi: -1
    };
    try {
        Object.assign(S, JSON.parse(localStorage.getItem(LS) || '{}'));
        S.sel = {};
    } catch (e) {
    }
    S.bad = /bad=1/.test(location.search) || /#\/bad/.test(location.hash);
    const save = () => {
        try {
            localStorage.setItem(LS, JSON.stringify({
                page: S.page,
                filter: S.filter,
                month: S.month,
                calMode: S.calMode,
                motion: S.motion,
                pfav: S.pfav
            }));
        } catch (e) {
        }
    };
    const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    }[c]));
    const pubOf = (p, id) => D.pubOf(p, id);
    const isoAdd = (iso, n) => {
        const d = new Date(iso + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    };
    /* 渠道胶囊：三页同一个来源 = 全局渠道登记表（内置那几个 + 用户在内容里自己加的，见 chanAdd）。
     再兜一道：发布安排.json 是插件写的，万一里面出现登记表没有的渠道，也不能让它没处筛。 */
    const chipsRow = () => {
        const chs = [...new Set(D.chanList().concat(D.PROJECTS.flatMap(p => p.channels), D.allPosts().map(x => x.channel)))];
        return `<div class="chips-row">${chs.map(c => `<button class="pill ch ${S.chFilter === c ? 'on' : ''}" style="${S.chFilter === c ? '' : `color:${CH(c).ink};background:${CH(c).bg};border-color:transparent`}" data-act="chf" data-k="${esc(c)}" data-tip="${D.CHANNELS[c] ? '' : '这个渠道是内容里填出来的，还没进登记表'}">${esc(c)}</button>`).join('')}</div>`;
    };

    /* 内容卡上的渠道：每个都带封面规格，没定的明说「未定规格」，不假装不计入 */
    function chanTags(p) {
        if (!p.channels.length) return `<span class="todo">${TAG.toFill}</span>`;
        return p.channels.map(c => {
            const k = CH(c);
            return `<button class="tag ch" data-act="chan-need" data-k="${esc(c)}" style="color:${k.ink};background:${k.bg}" data-tip="${k.need ? `封面规格 ${k.need}（${D.FORMATS[k.need] || ''}）· 点这里改` : '没定封面规格，这一版不计入物料 · 点这里定'}">${esc(c)}<em class="fmt">${k.need || '未定规格'}</em></button>`;
        }).join('');
    }

    /* 渠道输入：内置的只当建议，剩下的自己填。选中态存在 CHSEL 里，加一个删一个只重绘这一块。 */
    const CHSEL = {};

    function chanField(fid, initial) {
        if (initial) CHSEL[fid] = initial.slice();
        const sel = CHSEL[fid] || [];
        const sug = D.chanList().filter(c => sel.indexOf(c) < 0);
        return `<div class="chanfield" id="${fid}"><div class="pills">${sel.map(c => `<button class="pill chp on" data-act="chan-rm" data-f="${fid}" data-k="${esc(c)}" data-tip="点一下去掉">${esc(c)}<span class="x">✕</span></button>`).join('')}${sug.map(c => `<button class="pill chp" data-act="chan-add" data-f="${fid}" data-k="${esc(c)}" style="color:${CH(c).ink};background:${CH(c).bg};border-color:transparent">${esc(c)}</button>`).join('')}</div>
      <div class="chanfree"><input class="inp" data-chanfree="${fid}" placeholder="还有别的渠道？填名字，回车加上" maxlength="16"><button class="btn s" data-act="chan-free" data-f="${fid}">${ic('plus', 14)} 加渠道</button></div></div>`;
    }

    function chanRerender(fid) {
        const box = document.getElementById(fid);
        if (!box) return;
        box.outerHTML = chanField(fid);
        const i = document.querySelector(`[data-chanfree="${fid}"]`);
        if (i) i.focus();
    }

    function chanFree(fid) {
        const i = document.querySelector(`[data-chanfree="${fid}"]`), raw = ((i || {}).value || '').trim();
        if (!raw) return toast('先写个渠道名', 'no');
        const n = D.chanFind(raw) || raw;
        if (CHSEL[fid].indexOf(n) < 0) CHSEL[fid].push(n);
        chanRerender(fid);
    }

    const pic = src => src ? `<img class="pic" src="${esc(src)}" alt="" draggable="true" >` : '';

    /* 图片一律走这个盒子：固定盒 + cover（列表/候选）或 contain（看全构图）+ 没图时诚实空态 */
    function imgBox(o) {
        const body = o.src ? pic(o.src) : o.making ? '<div class="sk"></div>' : `<span class="noimg">${ic('img', 18)}<em>${esc(o.empty || '还没有图')}</em>${o.cta || ''}</span>`;
        return `<div class="ibox ${o.fit === 'contain' ? 'contain' : 'cover'}${o.cls ? ' ' + o.cls : ''}" style="aspect-ratio:${o.ratio || '3/4'}"${o.auto && o.src ? ' data-ar="auto"' : ''}${o.cap ? ` data-cap="${esc(o.cap)}"` : ''}${o.ctx ? ` data-ctx="${o.ctx}"` : ''}>${body}${o.extra || ''}</div>`;
    }

    /* 盒子按图片真实尺寸定 —— 模板里声明的比例可能和原图不符（深色金句写的 1:1，图其实是 3:4），
     信声明就会裁图。加载完量一次，量到之前先用声明的比例占位，不跳版。 */
    function arFix(box, img) {
        if (!box || !img || !img.naturalWidth) return;
        box.style.aspectRatio = (img.naturalWidth / img.naturalHeight).toFixed(4);
    }

    document.addEventListener('load', ev => {
        const img = ev.target;
        if (!img || img.tagName !== 'IMG') return;
        const box = img.closest('[data-ar="auto"]');
        if (box) arFix(box, img);
    }, true);
    const arSweep = () => $$('[data-ar="auto"]').forEach(b => {
        const i = b.querySelector('img');
        if (i && i.complete) arFix(b, i);
    });
    const ratioCss = r => {
        const m = String(r || '3:4').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
        return m ? m[1] + '/' + m[2] : '3/4';
    };
    const coverOfP = p => {
        const m = D.coverOf(p);
        return m ? {m, c: D.usedCand(m)} : null;
    };

    /* ---------- 提示条 / 弹窗 / 右键菜单 ---------- */
    function toast(text, kind) {
        const box = $('#toasts');
        while (box.children.length >= 3) box.firstChild.remove();
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `<span class="b ${kind || 'no'}">${kind === 'ok' ? '✓' : kind === 'go' ? '↗' : kind === 'ai' ? '→' : '!'}</span><span>${esc(text)}</span>`;
        box.appendChild(t);
        setTimeout(() => {
            t.classList.add('out');
            setTimeout(() => t.remove(), 200);
        }, kind === 'ai' ? 6000 : 3000);
    }

    const handedOff = () => handoffInfo();

    function modal(cfg) {
        const returnFocus = $('#m-live')?._returnFocus || document.activeElement;
        closeModal();
        const m = document.createElement('div');
        m.className = 'modal' + (cfg.wide ? ' w' : '') + (cfg.form ? ' form' : '') + (cfg.cls ? ' ' + cfg.cls : '');
        m.id = 'm-live';
        m.innerHTML = `<div class="modal-h"><h3>${esc(cfg.title)}</h3>${cfg.sub ? `<span class="msub">${esc(cfg.sub)}</span>` : ''}<button class="mx" data-close aria-label="关闭弹窗">${ic('chev', 0)}✕</button></div>
      <div class="modal-b ${cfg.form ? 'two' : ''}">${cfg.body}</div>${cfg.foot === false ? '' : `<div class="modal-f">${cfg.actions || ''}</div>`}`;
        $('#layer').appendChild(m);
        $('#mask').classList.add('show');
        requestAnimationFrame(() => m.classList.add('show'));
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-label', cfg.title);
        m._returnFocus = returnFocus;
        requestAnimationFrame(() => (m.querySelector('[data-autofocus]') || m.querySelector('input,textarea,select,button') || m).focus());
        if (cfg.after) cfg.after(m);
        return m;
    }

    function closeModal() {
        const m = $('#m-live');
        if (!m) return;
        const back = m._returnFocus;
        if (back?.isConnected) back.focus();
        m.classList.remove('show');
        m.removeAttribute('id');
        $('#mask').classList.remove('show');
        closeMenu();
        setTimeout(() => m.remove(), 180);
    }

    const cancel = '<button class="btn" data-close>取消</button>';

    function closeMenu() {
        const x = $('#menu-live');
        if (x) x.remove();
    }

    function menu(items, x, y) {
        closeMenu();
        const m = document.createElement('div');
        m.className = 'ctx';
        m.id = 'menu-live';
        m.innerHTML = items.map((it, i) => it === '-' ? '<div class="sep"></div>' : `<button class="${it.danger ? 'danger' : ''}" data-mi="${i}"${it.action ? ` data-menu-action="${it.action}"` : ''}>${it.icon ? ic(it.icon, 15) : '<span style="width:15px"></span>'}${esc(it.label)}</button>`).join('');
        document.body.appendChild(m);
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
        m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
        m.onclick = ev => {
            const b = ev.target.closest('[data-mi]');
            if (!b) return;
            closeMenu();
            const it = items[+b.dataset.mi];
            it.run && it.run();
        };
    }

    /* ---------- 看大图：打开先“适应窗口”，缩放百分比是相对原始尺寸的真实比例 ----------
     以前靠 CSS max-height:100% 兜，grid 容器上它不生效 → 竖图只被宽度限住、底部被 overflow 切掉。
     现在按原图尺寸和盒子实测尺寸自己算。 */
    const V8 = {list: [], i: 0, z: 1, fit: 1, x: 0, y: 0};
    const capOf = img => {
        const h = img.closest('[data-cap]');
        if (h) return h.dataset.cap;
        const c = img.closest('.mcard, .cand, .tpl');
        const b = c && c.querySelector('.cap b');
        return b ? b.textContent : (img.getAttribute('src') || '').split('/').pop();
    };

    function viewImg(img) {
        const g = img.closest('.cands, .shots, .mat-grid, .mat-cols, .cmpgrid') || img.parentElement;
        const list = Array.from(g.querySelectorAll('img.pic')).filter(x => x.getAttribute('src'));
        let i = list.indexOf(img);
        if (i < 0) i = 0;
        openView(list.map(x => ({src: x.getAttribute('src'), cap: capOf(x)})), i);
    }

    const vBox = () => {
        const bd = $('#v-b');
        if (!bd) return {w: 0, h: 0};
        const cs = getComputedStyle(bd);
        return {
            w: bd.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
            h: bd.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        };
    };
    const vFit = img => {
        const b = vBox();
        return !img || !img.naturalWidth || !b.w ? 1 : Math.min(b.w / img.naturalWidth, b.h / img.naturalHeight, 1);
    };

    function openView(list, i) {
        if (!list.length) return;
        closeMenu();
        V8.list = list;
        V8.i = Math.min(i, list.length - 1);
        V8.z = 1;
        V8.x = 0;
        V8.y = 0;
        let v = $('#v-live');
        if (!v) {
            v = document.createElement('div');
            v.className = 'view';
            v.id = 'v-live';
            $('#layer').appendChild(v);
        }
        const multi = list.length > 1;
        v.innerHTML = `<div class="view-h"><b id="v-cap"></b><span class="n" id="v-no"></span><button class="x" data-vb="close" data-tip="Esc">✕</button></div>
      <div class="view-b" id="v-b">${multi ? `<button class="nav p" data-vb="prev" data-tip="上一张 · ←">${ic('chev', 18)}</button>` : ''}<img id="v-img" src="${esc(list[V8.i].src)}" alt="" draggable="false">${multi ? `<button class="nav n" data-vb="next" data-tip="下一张 · →">${ic('chev', 18)}</button>` : ''}</div>
      <div class="view-f"><button class="vb" data-vb="-" data-tip="缩小">${ic('zout', 16)}</button><span class="vb" style="background:none"><span class="pct" id="v-pct">—</span></span><button class="vb" data-vb="+" data-tip="放大">${ic('zin', 16)}</button>
        <button class="vb" data-vb="real" style="margin-left:10px">原始大小</button><button class="vb" data-vb="fit">适应窗口</button>
        <button class="vb" data-vb="dl" style="margin-left:10px">${ic('down', 15)} 下载</button><span class="vhint">滚轮缩放 · 双击看原图 · ←→ 换张 · Esc 关闭</span></div>`;
        const bd = v.querySelector('#v-b'), img = v.querySelector('#v-img');
        img.onload = () => paint();
        img.onerror = () => toast('这张图打不开', 'no');
        const zoom = f => {
            V8.z = Math.min(8, Math.max(.15, V8.z * f));
            clamp();
            paint();
        };
        bd.onwheel = ev => {
            ev.preventDefault();
            zoom(ev.deltaY < 0 ? 1.12 : .9);
        };
        bd.ondblclick = () => {
            if (V8.z > 1.01) {
                V8.z = 1;
                V8.x = V8.y = 0;
            } else {
                V8.z = 1 / (V8.fit || 1);
            }
            clamp();
            paint();
        };
        let drag = null;
        bd.onpointerdown = ev => {
            if (V8.z <= 1.001 || ev.target.closest('[data-vb]')) return;
            drag = {x: ev.clientX - V8.x, y: ev.clientY - V8.y};
            bd.setPointerCapture(ev.pointerId);
            bd.style.cursor = 'grabbing';
        };
        bd.onpointermove = ev => {
            if (!drag) return;
            V8.x = ev.clientX - drag.x;
            V8.y = ev.clientY - drag.y;
            clamp();
            paint(false);
        };
        bd.onpointerup = ev => {
            drag = null;
            bd.style.cursor = '';
            bd.releasePointerCapture && bd.releasePointerCapture(ev.pointerId);
        };
        bd.onclick = ev => {
            if (ev.target === bd) closeView();
        };
        v.onclick = ev => {
            const b = ev.target.closest('[data-vb]');
            if (!b) return;
            const k = b.dataset.vb;
            if (k === 'close') return closeView();
            if (k === '-') return zoom(.8);
            if (k === '+') return zoom(1.25);
            if (k === 'fit') {
                V8.z = 1;
                V8.x = V8.y = 0;
                return paint();
            }
            if (k === 'real') {
                V8.z = 1 / (vFit(img) || 1);
                V8.x = V8.y = 0;
                return paint();
            }
            if (k === 'dl') return downloadSource(V8.list[V8.i].src, V8.list[V8.i].cap);
            if (k === 'prev' || k === 'next') {
                V8.i = (V8.i + (k === 'next' ? 1 : -1) + V8.list.length) % V8.list.length;
                V8.z = 1;
                V8.x = V8.y = 0;
                img.src = V8.list[V8.i].src;
                return;
            }
        };
        addEventListener('resize', vOnResize);
        requestAnimationFrame(() => v.classList.add('show'));
        paint();
    }

    const vOnResize = () => {
        if ($('#v-img')) {
            clamp();
            paint();
        }
    };

    function clamp() {
        const img = $('#v-img');
        if (!img) return;
        const b = vBox(), w = img.offsetWidth, h = img.offsetHeight;
        V8.x = Math.max(-(w - b.w) / 2 - 8, Math.min((w - b.w) / 2 + 8, V8.x));
        V8.y = Math.max(-(h - b.h) / 2 - 8, Math.min((h - b.h) / 2 + 8, V8.y));
    }

    function paint(zoomOnly) {
        const img = $('#v-img');
        if (!img) return;
        if (!img.naturalWidth) {
            if (img.complete) return;
            return;
        }
        V8.fit = vFit(img);
        const s = V8.fit * V8.z;
        img.style.width = Math.round(img.naturalWidth * s) + 'px';
        img.style.height = Math.round(img.naturalHeight * s) + 'px';
        img.style.transform = `translate(${V8.x}px,${V8.y}px)`;
        if (zoomOnly) return;
        img.style.cursor = V8.z > 1.001 ? 'grab' : 'zoom-in';
        const p = $('#v-pct');
        if (p) p.textContent = Math.round(s * 100) + '%';
        const c = $('#v-cap');
        if (c) c.textContent = (V8.list[V8.i] || {}).cap || '';
        const no = $('#v-no');
        if (no) no.textContent = V8.list.length > 1 ? `${V8.i + 1} / ${V8.list.length}` : '';
        const f = $('#v-fit');
        if (f) f.textContent = img.naturalWidth + '×' + img.naturalHeight;
    }

    function closeView() {
        const v = $('#v-live');
        if (!v) return;
        removeEventListener('resize', vOnResize);
        v.classList.remove('show');
        setTimeout(() => v.remove(), 200);
    }

    /* ---------- 悬浮提示：说明只放这里，不写进正文 ---------- */
    let tipT = 0;

    function showTip(el) {
        let box = $('#tip');
        if (!box) {
            box = document.createElement('div');
            box.id = 'tip';
            box.className = 'tip';
            document.body.appendChild(box);
        }
        box.textContent = el.dataset.tip;
        box.classList.add('on');
        const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        box.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2)) + 'px';
        box.style.top = Math.max(8, r.top - b.height - 7 < 8 ? r.bottom + 7 : r.top - b.height - 7) + 'px';
    }

    const hideTip = () => {
        clearTimeout(tipT);
        const b = $('#tip');
        if (b) b.classList.remove('on');
    };
    document.addEventListener('mouseover', ev => {
        clearTimeout(tipT);
        const el = ev.target.closest('[data-tip]');
        if (!el) return hideTip();
        tipT = setTimeout(() => showTip(el), 320);
    });
    document.addEventListener('mouseout', ev => {
        const to = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('[data-tip]');
        if (to && to === ev.target.closest('[data-tip]')) return;
        hideTip();
    });
    addEventListener('scroll', hideTip, true);
    addEventListener('resize', hideTip);

    /* ---------- 就地编辑（不用跳去助手）：只留名称 · 封面名 · 账号 · 提示词处境 ---------- */
    const ie = (o) => `<span class="ie${o.v ? '' : ' need'}" data-act="ie" data-tip="点这里改 · 回车保存，Esc 取消" data-t="${o.t}" data-v="${esc(o.v)}" data-ph="${esc(o.ph || '')}"${Object.keys(o).filter(k => k[0] !== 'v' && k[0] !== 't' && k[0] !== 'ph').map(k => ` data-i-${k}="${esc(o[k])}"`).join('')}>${o.v ? esc(o.v) : `<span class="todo">${TAG.toFill}</span>`}${ic('edit', 13)}</span>`;

    function ieSave(el, raw) {
        return W.mutate('write', () => ieApply(el, raw));
    }

    function ieApply(el, raw) {
        const t = el.dataset.t, id = el.dataset.iId, p = D.byId(id);
        const v = String(raw == null ? '' : raw).trim();
        if (v === (el.dataset.v || '')) return;
        const where = (() => {
            if (t === 'pw') {
                const w = pwOf(id);
                if (!w) return '';
                w.when = v;
                return '提示词/' + w.cat + '/' + w.file + '.md';
            }
            if (t === 'pname') {
                if (!v) return '';
                p.name = v;
                return '项目.json';
            }
            if (t === 'mat') {
                const m = D.matOf(p, el.dataset.iK);
                if (m) m.name = v;
                return '物料.json';
            }
            if (t === 'acct') {
                if (el.dataset.iK === '账号名') D.ACCOUNT.name = v; else if (el.dataset.iK === '账号介绍') D.ACCOUNT.intro = v; else {
                    const x = D.ACCOUNT.marks.find(y => y.k === el.dataset.iK);
                    if (x) x.v = v;
                }
                return '账号.json';
            }
            return '';
        })();
        if (!where) return toast('这里改不了，用旁边的编辑', 'no');
        if (el.closest('.modal')) closeModal();
        render();
        toast(v ? `已保存在浏览器 · ${where}` : `空着了，记在 ${where}`, 'ok');
    }

    const normDate = v => W.date(String(v || '').trim());
    const p2 = n => String(n).padStart(2, '0');

    /* ---------- 侧栏：五页，模板和内容是核心，排在日历前面 ---------- */
    const NAV = [['today', '总览', 'grid'], ['templates', '模板', 'tpl'], ['projects', '内容', 'flag'], ['calendar', '日历', 'cal'], ['prompts', '提示词', 'prompt']];

    function hostSelector(id) {
        return `<select class="inp host-selector" id="${id}" data-act="set-host" aria-label="当前 AI 助手：${esc(HOST())}（所有 AI 操作统一使用）" title="当前助手：${esc(HOST())}">${D.hostChoices().map(h => `<option value="${esc(h)}"${D.SETTINGS.host === h ? ' selected' : ''}>${esc(H(h))}</option>`).join('')}</select>`;
    }

    function shell() {
        const on = p => S.page === p || (p === 'projects' && S.page === 'project') || (p === 'templates' && S.page === 'template');
        $('#nav').innerHTML = NAV.map(n => `<li><button class="${on(n[0]) ? 'on' : ''}" data-page="${n[0]}" aria-label="${esc(n[1])}">${ic(n[2], 18)}<span class="lbl">${n[1]}</span></button></li>`).join('');
        const wait = D.TASKS.filter(isPendingTask).length;
        $('#side-bot').innerHTML = `<button class="btn block host" data-act="open-host" aria-label="${esc(BTN.openHost(HOST()))}">${ic('ext', 15)}<span class="lbl">${esc(BTN.openHost(HOST()))}</span></button>
      <button class="btn block" data-page="more" aria-label="更多">${ic('menu', 15)}<span class="lbl">更多</span></button>
      <div class="who">${wait ? `${wait} 件要你处理` : ''}</div>`;
    }

    /* ---------- 总览 ---------- */
    function vToday() {
        const days = D.week(), today = D.TODAY;
        const todays = D.postsOn(today), late = D.allPosts().filter(x => x.date < today && !D.sent(x));
        const sentToday = todays.filter(D.sent).length;
        const nx = D.nextPost();
        const need = D.PROJECTS.filter(p => p.kind === '内容' && D.tagsOf(p).some(t => t.k === 'warn'));
        const live = D.PROJECTS.filter(p => p.kind === '内容' && D.stageOf(p) !== STAGE.done);
        const coll = D.PROJECTS.filter(p => p.kind === '合集');
        return `<div class="wrap">
      <div class="ph"><h1>${esc(D.cn(today))}</h1><span class="sub">今天 ${todays.length} 条要发 · 记了 ${sentToday} 条</span>
        <div class="acts"><div class="days">${days.map(d => {
            const ps = D.postsOn(d), all = ps.length && ps.every(D.sent), undone = ps.some(x => !D.sent(x));
            return `<button class="daychip${d === today ? ' today' : ''}" data-act="day" data-k="${d}" data-tip="点这天进日历看那一周 · 记发布也在那儿"><span class="wd">${esc(D.parts(d).wd.replace('周', ''))}</span><b>${ps.length}</b><em class="${all ? 'g' : undone ? 'r' : ''}"></em></button>`;
        }).join('')}</div></div></div>
      <div class="cols">
        <div class="stack">
          <div class="card"><div class="card-h"><h2>下一条</h2>${nx ? `<span class="sub">${nx.date === today ? '今天' : esc(D.cn(nx.date))} ${esc(nx.time)} · ${esc(nx.channel)}</span>` : ''}</div>
            ${nx ? nextBlock(nx) : `<div class="big-empty"><b>今天没有要发的</b><span>接下来还没有排发布</span></div>`}</div>
          <div class="card"><div class="card-h"><h2>今天的每一条</h2><span class="sub">${todays.length} 条</span><div class="r"><button class="btn s g" data-act="cal-week">${BTN.byWeek} ${ic('chev', 14)}</button></div></div>
            ${late.map(x => postLine(x, 'late')).join('')}${todays.length ? todays.map(x => postLine(x, '', D.nowLine())).join('') : `<div class="empty"><svg class="empty-graphic" viewBox="0 0 88 72" fill="none" aria-hidden="true"><rect x="10" y="12" width="43" height="48" rx="6" fill="#e8edf4"/><rect x="27" y="8" width="43" height="51" rx="6" fill="#eef3ff" stroke="#c9d7fa"/><path d="M38 22h20M38 30h15M38 38h10" stroke="#315bd6" stroke-width="2" stroke-linecap="round"/><path d="m58 45 8 8 12-15" stroke="#315bd6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="62" r="3" fill="#e6bc91"/></svg><b>今天没有安排</b><span class="small">给下一条好内容留点时间</span></div>`}
            <div class="line foot"><span class="k muted">明天</span><span class="v small muted">${D.postsOn(D.shift(1)).length ? `${D.postsOn(D.shift(1)).length} 条要发` : '没有'}</span></div></div>
          <div class="card"><div class="card-h"><h2>在做的</h2><span class="sub">${D.TASKS.filter(isPendingTask).length} 件</span></div>
            ${D.TASKS.filter(isPendingTask).map(taskRow).join('') || `<div class="empty"><b>没有在做的事</b></div>`}</div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-h"><h2>要处理</h2><span class="sub">${need.length} 条内容</span></div>
            ${need.length ? need.map(p => {
            const w = D.tagsOf(p).filter(t => t.k === 'warn'), c = coverOfP(p), first = (w[0] || {}).w;
            const inline = first === TAG.noChan ? `<button class="btn xs soft" data-act="edit-proj" data-id="${esc(p.id)}">定渠道</button>`
                : first === TAG.making ? `<button class="btn xs soft" data-act="project-tasks" data-id="${esc(p.id)}">${esc(projectTaskLabel(p))}</button>`
                    : first === TAG.scheduleTodo ? `<button class="btn xs soft" data-act="schedule" data-id="${esc(p.id)}">${BTN.schedule}</button>`
                        : first === TAG.toConfirm ? `<button class="btn xs soft" data-open="${esc(p.id)}">查看候选</button>`
                            : first === TAG.coverTodo ? `<button class="btn xs soft" data-act="make-cover" data-id="${esc(p.id)}" ${D.makingOf(p) ? 'disabled' : ''}>${BTN.makeCover}</button>` : '';
            return `<div class="trow tight" data-open="${esc(p.id)}"><div class="th">${c ? pic(c.c.img) : ''}</div>
              <div class="gt"><div class="nm">${esc(p.name)}</div><div class="tagline">${w.map(t => `<span class="tag warn">${esc(t.w)}</span>`).join('')}</div></div>
              <div class="ops">${inline}<button class="btn xs g" data-act="det-more" data-id="${esc(p.id)}">${ic('dots', 15)}</button></div></div>`;
        }).join('') : `<div class="empty"><b>没有要处理的</b></div>`}</div>
          <div class="card"><div class="card-h"><h2>内容项目</h2><span class="sub">在跑的 ${live.length} · ${coll.length} 个合集</span><div class="r"><button class="btn s g" data-page="projects">${BTN.viewAll} ${ic('chev', 14)}</button></div></div>
            <div class="lines">${[...coll, ...live].slice(0, 7).map(p => {
            const c = coverOfP(p), mp = D.matProgress(p), pp = D.postProgress(p);
            return `<div class="trow tight" data-open="${esc(p.id)}"><div class="th">${c ? pic(c.c.img) : ''}</div>
              <div class="gt"><div class="nm">${esc(p.name)}${p.kind === '合集' ? ` <span class="tag">${p.members.length} 条</span>` : ''}</div>
                <div class="sub">${p.kind === '合集' ? esc(D.cnShort(p.dates.from)) + ' – ' + esc(D.cnShort(p.dates.to)) : (p.dates.record ? esc(D.cnShort(p.dates.record)) + ' 录' : '没记录制日')}</div></div>
              <div class="ops"><span class="small muted">${mp.need ? `封面 ${mp.has}/${mp.need}` : '没定渠道'}${pp.total ? ` · 已发 ${pp.done}/${pp.total}` : ''}</span>${ic('chev', 15)}</div></div>`;
        }).join('')}</div></div>
        </div></div></div>`;
    }

    function nextBlock(nx) {
        const p = nx.p, m = D.matOf(p, nx.mat), c = m && D.usedCand(m);
        return `<div class="next">
      <div class="f" data-cap="${esc(p.name)}">${c ? pic(c.img) : '<div class="sk"></div>'}</div>
      <div class="gt"><div class="when">${esc(p.name)}</div>
        <div class="copy">${esc(nx.text)}</div>
        <div class="tagline">${D.tagsOf(p).map(t => `<span class="tag ${t.k}">${esc(t.w)}</span>`).join('')}</div></div>
      <div class="acts"><button class="btn p" data-act="copy-text" data-id="${nx.id}" data-p="${esc(p.id)}">${ic('copy', 15)} ${BTN.copyText}文案</button>
        <button class="btn" data-act="copy-img" data-p="${esc(p.id)}" data-m="${nx.mat}">${ic('img', 15)} ${BTN.copyImage}</button>
        <button class="btn" data-act="day" data-k="${nx.date}" data-tip="发出去以后在日历上记一条">${ic('cal', 15)} 去日历记这条</button>
        <button class="btn g" data-open="${esc(p.id)}">看这条内容 ${ic('chev', 14)}</button></div></div>`;
    }

    function postLine(x, late, now) {
        const p = x.p, m = D.matOf(p, x.mat), pub = pubOf(p, x.id), c = pub ? pub.snapshot : (m && D.usedCand(m)),
            k = CH(x.channel);
        return `${late ? '' : (now && x.time > now ? `<div class="nowline"><span>现在</span></div>` : '')}
      <div class="prow${pub ? ' done' : ''}${late ? ' late' : ''}">
        <span class="tm">${esc(x.time)}</span>
        <span class="tag ch" style="color:${k.ink};background:${k.bg}">${esc(x.channel)}</span>
        <span class="th">${c ? pic(c.img) : ''}</span>
        <span class="nm" data-open="${esc(p.id)}">${esc(p.name)}</span>
        ${late ? `<span class="tag warn">过了 ${esc(D.cnShort(x.date))} 没记</span>` : ''}
        <span class="ops">${pub ? `<span class="sent">${ic('check', 14)} ${TAG.posted} ${esc(D.cnShort(pub.at))}</span>` : `<span class="small muted">${TAG.notSent}</span>`}</span></div>`;
    }

    const taskRow = t => `<div class="trow"><span class="tag ${isCompletedTask(t) ? 'ok' : 'mute'}">${esc(isRealTask(t) ? TASK_LABEL[t.state] || t.state : '历史演示')}</span><div class="gt"><b>${esc(D.byId(t.pid)?.name || D.tplOf(t.tid)?.name || '')} · ${esc(t.name)}</b><div class="small muted">${esc(taskSummary(t))}</div></div><button class="btn s" data-act="task-open" data-id="${esc(t.id)}">${isCompletedTask(t) ? '查看结果' : '查看任务'}</button></div>`;

    function isRealTask(t) {
        return !!t?.request && !t.legacyDemo;
    }

    function isCompletedTask(t) {
        return ['success', 'partial'].includes(t.state);
    }

    function isTransferredTask(t) {
        return D.TASKS.some(next => isRealTask(next) && next.sourceTaskId === t.id);
    }

    function isPendingTask(t) {
        return isRealTask(t) && !isCompletedTask(t) && !isTransferredTask(t) && (!t.tid || currentTemplateTask(t, D.tplOf(t.tid)));
    }

    function taskSummary(t) {
        return t.request?.kind === 'generate' ? `${t.request.options.format || t.request.options.ratio} · 计划 ${t.request.options.count} 张 · 已导入 ${t.resultCount || 0} 张` : t.request ? `模板 v${t.request.templateVersion} · ${H(t.host)}` : '只供查看，不代表已交接或执行';
    }

    function taskActionLabel(t) {
        return {
            handoff: '继续任务',
            running: '查看进度',
            review: '查看并验收',
            failed: '查看失败处理',
            interrupted: '查看中断处理',
            success: '查看结果',
            partial: '查看结果'
        }[t.state] || '查看任务';
    }

    function projectTasks(p) {
        return D.TASKS.filter(t => t.pid === p.id);
    }

    function projectTaskLabel(p) {
        const tasks = projectTasks(p), pending = tasks.filter(isPendingTask);
        return pending.length > 1 ? `查看 ${pending.length} 项待处理任务` : pending.length ? taskActionLabel(pending[0]) : tasks.some(isRealTask) ? '查看任务结果' : `带内容到${HOST()}`;
    }

    function projectTaskPanel(p) {
        const tasks = projectTasks(p), pending = tasks.filter(isPendingTask),
            history = tasks.filter(t => !pending.includes(t));
        return `<div class="project-next"><p class="small muted">${pending.length ? `${pending.length} 项待处理 · 按状态继续` : tasks.some(isRealTask) ? '任务已结束，可查看已有结果' : '携带这条内容的摘要与当前资料说明'}</p><button class="btn p block" data-act="project-tasks" data-id="${esc(p.id)}">${esc(projectTaskLabel(p))}</button>${history.length ? `<details class="task-history"><summary>历史与已移交任务 ${history.length}</summary>${history.map(taskRow).join('')}</details>` : ''}</div>`;
    }

    function currentTemplateTask(task, t) {
        return !!t && isRealTask(task) && task.tid === t.id && (task.request?.templateVersion === t.version || task.result?.type === 'rules' && task.result.templateVersion === t.version);
    }

    let taskPicker = null;

    function showTaskChoices(tasks, history = [], title = '选择要处理的任务') {
        const rank = {review: 0, running: 1, handoff: 2, failed: 3, interrupted: 4, success: 5, partial: 6},
            list = tasks.slice().sort((a, b) => (rank[a.state] ?? 7) - (rank[b.state] ?? 7));
        taskPicker = {ids: list.map(t => t.id), selected: ''};
        modal({
            title,
            wide: true,
            body: `<p>请选择一项，再继续或查看；每项任务和已有结果分别保留。</p><div class="task-options">${list.map(t => `<label class="task-option"><input type="radio" name="task-choice" data-act="task-pick" data-id="${esc(t.id)}" value="${esc(t.id)}"><span><b>${esc(t.name)}</b><span class="tag mute">${esc(TASK_LABEL[t.state] || t.state)}</span><small>${esc(taskSummary(t))}</small></span></label>`).join('') || '<p class="muted">当前版本暂无任务。</p>'}</div>${history.length ? `<details class="task-history"><summary>历史任务与结果 ${history.length}</summary>${history.map(taskRow).join('')}</details>` : ''}`,
            actions: `${list.length ? '<button class="btn p" data-act="task-picker-go" disabled>选择后继续 / 查看</button>' : ''}<button class="btn" data-close>关闭</button>`
        });
    }

    function routeTask(t) {
        if (!t) throw Error('任务不存在');
        if (isRealTask(t) && t.state === 'handoff' && !isTransferredTask(t) && (!t.tid || currentTemplateTask(t, D.tplOf(t.tid)))) return A['task-bridge']({dataset: {id: t.id}});
        return openTask(t);
    }


    /* ---------- 内容列表 ---------- */
    function vProjects() {
        const all = D.PROJECTS.filter(p => p.kind === '内容'), coll = D.PROJECTS.filter(p => p.kind === '合集');
        const F = [['run', '在跑的', p => D.stageOf(p) !== STAGE.done], ['ready', STAGE.ready, p => D.stageOf(p) === STAGE.ready], ['live', STAGE.live, p => D.stageOf(p) === STAGE.live], ['done', STAGE.done, p => D.stageOf(p) === STAGE.done], ['all', '全部', () => true]];
        const list = all.filter((F.find(x => x[0] === S.filter) || F[0])[2]);
        return `<div class="wrap">
      <div class="ph"><h1>内容</h1><span class="sub">${all.length} 条内容 · ${coll.length} 个合集</span>
        <div class="acts"><button class="btn" data-act="new-collection">${ic('plus', 15)} ${BTN.newCollection}</button>
        <button class="btn p" data-act="new-project">${ic('plus', 15)} ${BTN.newProject}</button></div></div>
      ${coll.length ? `<div class="sect">合集<span class="c">${coll.length}</span></div><div class="card">${coll.map(p => {
            const cs = p.members.map(D.byId).map(q => q && coverOfP(q)).filter(Boolean);
            return `<div class="coll-card" data-open="${esc(p.id)}"><div class="th">${cs.slice(0, 2).map(x => pic(x.c.img)).join('')}</div>
      <div class="gt"><div class="ttl">${esc(p.name)}<span class="tag">${p.members.length} 条内容</span></div>
      <div class="sub">${esc(D.cnShort(p.dates.from))} – ${esc(D.cnShort(p.dates.to))}</div>
      <div class="sub">合集的物料还没有 · 还没开始发</div></div>${ic('chev', 16)}</div>`;
        }).join('')}</div>` : ''}
      <div class="pills" style="margin:22px 0 12px">${F.map(f => {
            const n = all.filter(f[2]).length;
            return `<button class="pill ${S.filter === f[0] ? 'on' : ''}" data-act="pf" data-k="${f[0]}">${f[1]}<span class="c">${n}</span></button>`;
        }).join('')}</div>
      <div class="card rows">
        <div class="rh"><span></span><span>内容</span><span class="c3">录制</span><span class="c4">阶段</span><span>封面</span><span class="c6">已发</span><span>状态</span><span></span></div>
        ${list.length ? list.map(rowP).join('') : `<div class="empty"><b>这个筛选下没有内容</b><div class="ops"><button class="btn" data-act="pf" data-k="all">看全部</button></div></div>`}
      </div></div>`;
    }

    function rowP(p) {
        const c = coverOfP(p), tpl = D.tplOf(p.tpl), mp = D.matProgress(p), pp = D.postProgress(p);
        return `<div class="row" data-open="${esc(p.id)}" data-ctx="project:${esc(p.id)}">
      <div class="th${c ? '' : ' none'}">${c ? pic(c.c.img) : ''}</div>
      <div class="gt"><div class="t1">${esc(p.name)}</div>
        <div class="t2">${p.channels.length ? esc(p.channels.join('、')) : '没定渠道'}${tpl ? ' · ' + esc(tpl.name) : ''}</div></div>
      <div class="cell c3">${p.dates.record ? esc(D.cnShort(p.dates.record)) : '<span class="muted">—</span>'}</div>
      <div class="cell c4">${esc(D.stageOf(p))}</div>
      <div class="cell">${mp.need ? `${mp.has}/${mp.need}` : '<span class="muted">—</span>'}</div>
      <div class="cell c6">${pp.total ? `${pp.done}/${pp.total}` : TAG.notYet}</div>
      <div class="tags">${D.tagsOf(p).map(t => `<span class="tag ${t.k}">${esc(t.w)}</span>`).join('')}</div>
      <span class="chev">${ic('chev', 16)}</span></div>`;
    }

    /* ---------- 内容详情：一条内容 = 一个项目文件夹，页面只剩封面这一条线 ---------- */

    /* 合集不是一个"内容"：它没有自己的封面、渠道和风格，只把成员列出来，动作都在成员身上 */
    function vColl(p) {
        const ms = (p.members || []).map(D.byId).filter(Boolean);
        const picked = ms.filter(q => D.coverOf(q)).length, sent = ms.filter(q => q.posts.filter(D.sent).length).length;
        return `<div class="wrap">
      <div class="crumb"><button data-page="projects">内容</button>${ic('chev', 14)}<b>${esc(p.name)}</b></div>
      <div class="card hero"><div class="gt"><h1>${esc(p.name)}</h1>
        <div class="sub">${ms.length} 条内容 · ${esc(D.cnShort(p.dates.from))} – ${esc(D.cnShort(p.dates.to))}</div>
        <div class="cstats"><span class="cst ${picked === ms.length ? 'ok' : ''}">已出封面 ${picked}/${ms.length}</span><span class="cst">已发 ${sent}/${ms.length}</span></div></div>
        <div class="acts"><button class="btn" data-page="projects">看全部内容 ${ic('chev', 14)}</button></div></div>
      <div class="card rows"><div class="rh"><span></span><span>内容</span><span class="c4">阶段</span><span>封面</span><span class="c6">已发</span><span></span></div>
        ${ms.map(q => {
            const c = coverOfP(q), mp = D.matProgress(q), pp = D.postProgress(q);
            return `<div class="row" data-open="${esc(q.id)}" data-ctx="project:${esc(q.id)}"><div class="th${c ? '' : ' none'}">${c ? pic(c.c.img) : ''}</div>
            <div class="gt"><div class="t1">${esc(q.name)}</div><div class="t2">${q.channels.length ? esc(q.channels.join('、')) : '没定渠道'}</div></div>
            <div class="cell c4">${esc(D.stageOf(q))}</div>
            <div class="cell">${mp.need ? `${mp.has}/${mp.need}` : '—'}</div>
            <div class="cell c6">${pp.total ? `${pp.done}/${pp.total}` : TAG.notYet}</div>
            <span class="ops"><button class="btn xs p" data-act="make-cover" data-id="${esc(q.id)}" ${D.makingOf(q) ? 'disabled' : ''}>${BTN.makeCover}</button></span>
            <span class="chev">${ic('chev', 16)}</span></div>`;
        }).join('') || `<div class="empty"><b>这个合集还没有内容</b></div>`}</div></div>`;
    }

    function vProject() {
        const p = D.byId(S.pid);
        if (!p) return vProjects();
        if (p.kind === '合集') return vColl(p);
        const mp = D.matProgress(p), c = coverOfP(p), noNeed = D.noNeedChannels(p),
            activeCover = projectTasks(p).filter(t => isPendingTask(t) && t.request.kind === 'generate');
        return `<div class="wrap">
      <div class="crumb"><button data-page="projects">内容</button>${ic('chev', 14)}<b>${esc(p.name)}</b></div>
      <div class="card hero">
        <div class="th${c ? '' : ' none'}">${c ? pic(c.c.img) : ''}</div>
        <div class="gt"><h1>${ie({t: 'pname', v: p.name, id: p.id, ph: '这条叫什么'})}</h1>
          <div class="sub">${p.dates.record ? esc(D.cn(p.dates.record)) + ' 录 · ' : ''}${esc(D.stageOf(p))}</div>
          <div class="topline">
            <span class="tk">渠道</span>${chanTags(p)}
            <span class="tk">模板</span>${p.tpl ? `<button class="pill s" data-act="edit-proj" data-id="${esc(p.id)}" data-tip="点这里换一套">${esc(D.tplOf(p.tpl).name)}</button>` : `<button class="pill s warnx" data-act="edit-proj" data-id="${esc(p.id)}">${TAG.toFill}</button>`}
            <span class="tk">资料</span><button class="pill s" data-act="files" data-id="${esc(p.id)}" data-tip="原始资料放这儿，出封面的时候 AI 读它">${p.files.length ? `${p.files.length} 份` : '还没放'}</button>
          </div>
          <div class="bars">
            <span class="bar"${noNeed.length ? ` data-tip="${esc(noNeed.join('、'))} 没定封面规格，不算进这一栏"` : ''}><label>封面</label><i><b style="width:${mp.need ? mp.has / mp.need * 100 : 0}%"></b></i><span class="num">${mp.need ? `${mp.has}/${mp.need}` : '—'}</span></span>
          </div>
          <div class="tagline">${D.tagsOf(p).map(t => `<span class="tag ${t.k}">${esc(t.w)}</span>`).join('')}</div></div>
        <div class="acts">${activeCover.length ? '' : `<button class="btn p" data-act="make-cover" data-id="${esc(p.id)}">${BTN.makeCover}</button>`}
          <button class="btn" data-act="edit-proj" data-id="${esc(p.id)}">${ic('edit', 15)} ${BTN.editProject}</button>
          <button class="btn" data-act="det-more" data-id="${esc(p.id)}" data-tip="在文件夹里显示、重命名、删除">${ic('dots', 16)}</button></div>
      </div>
      ${coverSection(p)}
    </div>`;
    }

    /* ---------- 封面区：一版一段，候选直接摊开挑 ----------
     旧内容工作台的做法是"一批摊开、编号、图下面就是操作"，我们照它去掉「结果卡 + 批次明细」两层；
     比它多两件：一版一段（要几版就几段，进度按渠道要几版封面算）和勾几张对比后选定。 */
    function coverSection(p) {
        const need = D.needFormats(p), noNeed = D.noNeedChannels(p), picked = D.pickedOf(p);
        const cands = p.materials.reduce((a, m) => a + D.candsOf(m).length, 0);
        const unpicked = p.materials.filter(m => !D.usedCand(m) && D.candsOf(m).length).length;
        const sel = Object.keys(S.sel).length,
            activeCover = projectTasks(p).filter(t => isPendingTask(t) && t.request.kind === 'generate');
        const total = need.length || p.materials.length;
        return `<div class="cols">
      <div class="stack">
        <div class="card"><div class="card-h"><h2>封面</h2><span class="sub">要 ${need.length ? esc(need.join('、')) : '还没定渠道'}</span>
          <div class="r">${sel ? `<span class="small muted">勾了 ${sel} 张${sel < 2 ? ' · 再勾一张就能并排比' : ''}</span><button class="btn s p" data-act="cmp" ${sel < 2 ? 'disabled' : ''}>${BTN.cmp}</button><button class="btn s" data-act="cmp-clear">${BTN.cmpClear}</button>`
            : `<button class="btn s" data-act="dl" data-n="${picked.length}" ${picked.length ? '' : 'disabled'}>${ic('down', 13)} ${BTN.dlN(picked.length)}</button>${activeCover.length ? `<button class="btn s" data-act="project-cover-tasks" data-id="${esc(p.id)}">查看封面任务</button>` : cands ? `<button class="btn s" data-act="make-cover" data-id="${esc(p.id)}">${BTN.again}</button>` : ''}`}</div></div>
          ${p.materials.length ? `<div class="cstats"><span class="cst ${picked.length >= total && total ? 'ok' : ''}">已定 ${picked.length}/${total || '—'} 版</span>
            <span class="cst">候选 ${cands} 张</span>
            <span class="cst ${unpicked ? 'warn' : cands ? 'ok' : ''}">${unpicked ? unpicked + ' 版出了还没挑' : cands ? '已有候选均已挑选' : '暂无候选'}</span>
            ${activeCover.length ? `<span class="cst run">${activeCover.length} 批${activeCover.every(t => t.state === 'handoff') ? '待交接' : '待处理'}</span>` : ''}</div>
          ${p.materials.map(m => fmtBlock(p, m)).join('')}`
            : `<div class="empty"><b>还没有封面</b><span class="small muted">一句标题 + 选一版 + 挑一套风格就出</span><p class="small muted">从页面上方“出封面”开始。</p></div>`}
          ${activeCover.length ? `<details class="task-secondary cover-other"><summary>其他封面操作</summary><button class="btn s" data-act="make-cover" data-id="${esc(p.id)}">重新配置并建新批次</button></details>` : ''}
          ${noNeed.length ? `<div class="line foot"><span class="k muted">${esc(noNeed.join('、'))}</span><span class="v small muted">没定封面规格，不计入「要几版」</span><span class="v"><button class="btn xs" data-act="chan-need" data-k="${esc(noNeed[0])}">${noNeed.length > 1 ? `给 ${esc(noNeed[0])} 定规格` : '定规格'}</button></span></div>` : ''}</div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-h"><h2>交给 AI</h2></div><div class="lines">
          <div class="line"><span class="k">当前助手</span><span class="v">${esc(HOST())} · 所有 AI 操作统一使用</span></div>
          ${projectTaskPanel(p)}
          <div class="line"><span class="k">找句话术</span><span class="v"><span class="small muted">${pwLive().length} 条</span><button class="btn s" data-act="pw-pick" data-id="${esc(p.id)}" data-tip="不用切页，按处境搜，回车就复制">${ic('search', 14)} 搜处境</button></span></div>
        </div></div>
        ${picked.length ? `<div class="card"><div class="card-h"><h2>${TAG.prio}</h2><span class="sub">${picked.length} 张 · 下一批出图带上</span></div>
          <div class="mat-grid refgrid">${picked.map(x => `<div class="mcard ${x.m.format === '方图' ? 'sq' : x.m.format === '横版' || x.m.format === '头图' ? 'wide' : ''}" data-ctx="mat:${esc(p.id)}:${esc(x.m.id)}">
            ${imgBox({
            src: x.c.img,
            ratio: ratioCss(x.m.ratio),
            auto: true,
            cap: `${p.name} · ${x.m.name}`,
            ctx: `mat:${esc(p.id)}:${esc(x.m.id)}`
        })}
            <div class="cap"><b>${esc(x.m.format)}</b><span>${esc(x.c.no)} 号 · ${esc(D.cnShort(x.m.madeAt || D.TODAY))}</span></div></div>`).join('')}</div>
          <div class="line foot"><span class="k muted small">换一张选定，参考就跟着换</span></div></div>` : ''}
      </div></div>`;
    }

    /* 一版一段：这一版要的比例、出了几张、分几批、定了哪张 */
    function fmtBlock(p, m) {
        const bs = m.batches.slice().reverse(), cur = bs[0], older = bs.slice(1);
        const used = D.usedCand(m), st = D.statusOf(m), open = !!S.old[m.id];
        const shown = open ? bs : bs.slice(0, 1);
        return `<div class="fblk">
      <div class="fblk-h"><b>${esc(m.format)}</b>
        <span class="tag ${used ? 'ok' : st === 'making' ? 'run' : st === 'toConfirm' ? 'warn' : 'warn'}">${used ? `已定 ${used.no} 号` : st === 'making' ? TAG.making : st === 'toConfirm' ? TAG.toConfirm : '没挑'}</span>
        <span class="muted small">${esc(m.ratio)} · ${D.candsOf(m).length} 张 · ${m.batches.length} 批</span>
        <span class="r"><button class="btn xs" data-act="copy-img" data-p="${esc(p.id)}" data-m="${esc(m.id)}" ${used ? '' : 'disabled'} data-tip="复制这一版选定的那张">${ic('copy', 13)} ${BTN.copyImage}</button>
          <button class="btn xs ico" data-act="mat-more" data-p="${esc(p.id)}" data-id="${esc(m.id)}" data-tip="改名、删这一版">${ic('dots', 14)}</button></span></div>
      ${shown.map(b => batchGrid(p, m, b)).join('')}
      ${older.length ? `<button class="older" data-act="old-batch" data-m="${esc(m.id)}">${open ? '收起早先的批次' : `看早先 ${older.length} 批 · ${older.reduce((a, b) => a + b.cands.length, 0)} 张`} ${ic('chev', 13)}</button>` : ''}
    </div>`;
    }

    function batchGrid(p, m, b) {
        const refs = D.refOf(p, b);
        return `<div class="batch">
      ${m.batches.length > 1 ? `<div class="batch-h"><b>${TAG.batch(b.no)}</b><span class="muted small">${esc(D.cnShort(b.at))} · ${esc((D.tplOf(b.tpl) || {}).name || '')}</span>
        ${b.sourceRequestId ? `<span class="tag mute">历史导入 · 第 ${b.attempt} 轮 · 原状态：${esc(TASK_LABEL[b.state] || b.state)}</span>` : ''}
        ${refs.length ? `<span class="tag mute" data-tip="这批出图时把这几张当参考图喂进去了：${esc(refs.map(r => r.m.format + ' ' + r.c.no + ' 号').join('、'))}">${TAG.prio} ${refs.length}</span>` : ''}
        ${b.state === 'running' && !b.sourceRequestId ? '<span class="steps">已手动接单 · 等待导入结果</span>' : ''}</div>` : ''}
      <div class="cands">${b.cands.map(c => candCard(p, m, b, c)).join('')}${b.state === 'running' && !b.sourceRequestId ? '<p class="small muted">等待导入真实候选图。</p>' : ''}</div>
    </div>`;
    }

    /* 候选卡：操作摊在图下面，不靠悬停和右键才看得见 */
    function candCard(p, m, b, c) {
        const k = m.id + ':' + c.no, sel = !!S.sel[k];
        return `<div class="cand${c.use ? ' pick' : ''}${sel ? ' sel' : ''}" data-ctx="cand:${esc(p.id)}:${esc(m.id)}:${esc(c.no)}">
      ${imgBox({
            src: c.img,
            ratio: ratioCss(m.ratio),
            auto: true,
            cap: `${m.format} ${esc(c.no)} 号 · ${p.name}`,
            ctx: `cand:${esc(p.id)}:${esc(m.id)}:${esc(c.no)}`,
            cls: 'cand-f',
            extra: `<span class="no">${esc(c.no)}</span>
        <button class="cmpb${sel ? ' on' : ''}" data-act="cand-sel" data-p="${esc(p.id)}" data-m="${esc(m.id)}" data-no="${esc(c.no)}" data-tip="${sel ? '从对比里去掉' : '勾上，和别的几张一起比着挑'}">${ic('check', 13)}</button>
        ${c.use ? `<span class="st"><span class="tag ok">使用中</span></span>` : ''}`
        })}
      <div class="cap"><button class="btn xs block ${c.use ? 'p' : ''}" data-act="use-cand" data-p="${esc(p.id)}" data-m="${esc(m.id)}" data-no="${esc(c.no)}">${c.use ? ic('check', 13) + ' 使用中 · 换一张' : BTN.pickOne}</button></div>
      <div class="cap2"><button class="ib${c.fav ? ' on' : ''}" data-act="cand-fav" data-p="${esc(p.id)}" data-m="${esc(m.id)}" data-no="${esc(c.no)}" data-tip="${c.fav ? '取消收藏' : '收藏，留着以后当参考'}">${ic('heart', 14)}</button>
        <button class="ib" data-act="zoom" data-src="${esc(c.img)}" data-cap="${esc(m.format)} ${esc(c.no)} 号" data-tip="看大图">${ic('fit', 14)}</button>
        <button class="ib" data-act="dl" data-n="1" data-tip="下载这张">${ic('down', 14)}</button>
        ${c.fav ? '<span class="muted small" style="margin-left:auto">收藏过</span>' : ''}</div>
      ${c.from ? `<div class="from">${esc(c.from)}</div>` : ''}</div>`;
    }

    /* 日历下面那一天的条目：发布这件事只在日历上记，内容页不出现 */
    function pubRow(x) {
        const p = x.p, m = D.matOf(p, x.mat), pub = pubOf(p, x.id), c = pub ? pub.snapshot : (m && D.usedCand(m)),
            k = CH(x.channel);
        return `<div class="pcard" data-ctx="post:${esc(p.id)}:${esc(x.id)}">
      <div class="pf" data-cap="${esc(p.name)}">${c ? pic(c.img) : `<span class="tag ch" style="color:${k.ink};background:${k.bg}">${esc(x.channel)}</span>`}</div>
      <div class="gt"><div class="l1"><b>${esc(x.time)}</b><span class="tag ch" style="color:${k.ink};background:${k.bg}">${esc(x.channel)}</span>
        <button class="btn xs g" data-open="${esc(p.id)}">${esc(p.name)}</button>${p.sample ? `<span class="tag mute">${TAG.sample}</span>` : ''}</div>
        <div class="ttl">${esc((x.text || '').split('\n')[0])}</div>
        <div class="ops"><button class="btn xs" data-act="copy-text" data-id="${esc(x.id)}" data-p="${esc(p.id)}">${ic('copy', 13)} ${BTN.copyText}</button>
          <button class="btn xs" data-act="copy-img" data-p="${esc(p.id)}" data-m="${x.mat}" data-post="${esc(x.id)}">${ic('img', 13)} ${BTN.copyImage}</button></div>
        <div class="pubbar">
          ${pub ? `<span class="sent">${ic('check', 14)} 你说发了 · ${esc(D.cnShort(pub.at))}${pub.link ? ` · <a href="${esc(W.url(pub.link) || '#')}" target="_blank" rel="noreferrer">链接</a>` : ''}</span>
            <button class="btn xs" data-act="pub-edit" data-p="${esc(p.id)}" data-id="${esc(x.id)}">${BTN.pubEdit}</button>
            <button class="btn xs e" data-act="pub-del" data-p="${esc(p.id)}" data-id="${esc(x.id)}">${BTN.unpub}</button>`
            : `<button class="btn xs p" data-act="pub-add" data-p="${esc(p.id)}" data-id="${esc(x.id)}" data-day="${x.date}">${ic('check', 13)} ${BTN.pub}</button>`}
          <span class="muted small" style="margin-left:auto">平台数据 · 一期还没接</span>
        </div></div></div>`;
    }

    /* ---------- 日历 ---------- */
    function vCalendar() {
        const posts = D.allPosts();
        const shown = S.chFilter ? posts.filter(x => x.channel === S.chFilter) : posts;
        if (S.calMode === 'week') return vWeek(shown);
        const [y, m] = S.month.split('-').map(Number);
        const first = new Date(y, m - 1, 1), lead = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
        const cells = [], start = new Date(y, m - 1, 1 - lead);
        for (let i = 0; i < Math.ceil((lead + dim) / 7) * 7; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            cells.push({
                iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
                out: d.getMonth() !== m - 1
            });
        }
        const focus = S.focusDay || D.TODAY,
            onDay = d => D.postsOn(d).filter(x => !S.chFilter || x.channel === S.chFilter), fp = onDay(focus);
        const inM = x => x.slice(0, 7) === S.month;
        /* 胶囊现在是全局登记表，点一个本月没排过的渠道会看到一片空网格，得说清为什么 */
        const chBar = !S.chFilter ? '' : `<div class="wkfoot" style="margin-bottom:16px"><span class="muted">只看 ${esc(S.chFilter)}</span><span class="dot">·</span><span class="muted">这个月它${shown.some(x => inM(x.date)) ? `排了 ${shown.filter(x => inM(x.date)).length} 条` : '一条都没排'}</span><span class="dot">·</span><span class="muted">别的渠道这个月还有 ${posts.filter(x => inM(x.date) && x.channel !== S.chFilter).length} 条没显示</span><button class="btn xs" data-act="chf" data-k="${esc(S.chFilter)}">看全部渠道</button></div>`;
        return `<div class="wrap">
      <div class="ph"><h1>日历</h1><button class="monthpick" data-act="mpick">${esc(D.cnMonth(S.month))} ${ic('chev', 13)}</button>
        <div class="acts"><button class="btn s ico" data-act="mon" data-k="-1">‹</button><button class="btn s ico" data-act="mon" data-k="1">›</button>
          <span class="seg2"><button class="on" data-act="calmode" data-k="month">${BTN.byMonth}</button><button data-act="calmode" data-k="week">${BTN.byWeek}</button></span></div></div>
      ${chipsRow()}
      ${chBar}
      <div class="cal2">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(d => `<div class="hd">${d}</div>`).join('')}
      ${cells.map(c => {
            const ps = onDay(c.iso);
            const all = ps.length && ps.every(D.sent);
            return `<div class="cd${c.out ? ' out' : ''}${c.iso === D.TODAY ? ' today' : ''}${c.iso === S.focusDay ? ' focus' : ''}" data-act="focus" data-k="${c.iso}">
      <div class="top"><span class="n">${+c.iso.slice(8)}</span>${all ? `<span class="ck">${ic('check', 13)}</span>` : ''}</div>
      ${ps.map(x => `<div class="cchip${D.sent(x) ? ' sent' : ''}" style="color:${CH(x.channel).ink};background:${CH(x.channel).bg}" data-open="${esc(x.p.id)}" data-tip="${esc(x.p.name)} · ${D.sent(x) ? '已记发布 ' + D.cnShort(x.pub.at) : '还没记发布'}">${D.sent(x) ? ic('check', 12) : `<i>${esc(x.time)}</i>`} ${esc(x.p.name)}</div>`).join('')}</div>`;
        }).join('')}</div>
      <div class="sect">${esc(D.cn(focus))}<span class="c">${fp.length} 条</span><span class="r"><button class="btn s" data-act="pub-free" data-day="${focus}">${ic('check', 14)} ${BTN.pub}</button></span></div>
      <div class="card">${fp.length ? fp.map(pubRow).join('') : `<div class="empty"><b>这天没有排好的发布</b><div class="ops"><button class="btn" data-act="pub-free" data-day="${focus}">发过了？记一条</button></div></div>`}</div>
    </div>`;
    }

    function vWeek(ps) {
        const days = D.week(S.focusDay || D.TODAY);
        const forDay = d => (S.chFilter ? ps : D.postsOn(d)).filter(x => x.date === d);
        const byDay = days.map(d => ({d, list: forDay(d)}));
        const tot = byDay.reduce((a, x) => a + x.list.length, 0);
        const done = byDay.reduce((a, x) => a + x.list.filter(D.sent).length, 0);
        const nx = ps.filter(x => x.date > days[6] && x.date <= isoAdd(days[6], 7));
        const foot = [];
        if (S.chFilter) foot.push(`<div class="wkfoot"><span class="muted">只看 ${esc(S.chFilter)}</span><span class="dot">·</span><span class="muted">这一周别的渠道还有 ${D.allPosts().filter(x => x.date >= days[0] && x.date <= days[6] && x.channel !== S.chFilter).length} 条没显示</span><button class="btn xs" data-act="chf" data-k="${esc(S.chFilter)}">看全部渠道</button></div>`);
        if (nx.length) foot.push(`<div class="wkfoot"><span class="muted">下周还有 ${nx.length} 条</span><span class="dot">·</span><span class="muted">最早 ${esc(D.cnShort(nx[0].date))} ${esc(nx[0].time)}</span><button class="btn xs" data-act="wk" data-k="1">看下周</button></div>`);
        return `<div class="wrap">
      <div class="ph"><h1>日历</h1><span class="sub">${esc(D.cnShort(days[0]))} – ${esc(D.cnShort(days[6]))} · ${tot} 条${done ? ` · 已发 ${done}` : ''}</span>
        <div class="acts"><button class="btn s ico" data-act="wk" data-k="-1">‹</button><button class="btn s" data-act="wk" data-k="0">本周</button><button class="btn s ico" data-act="wk" data-k="1">›</button>
          <span class="seg2"><button data-act="calmode" data-k="month">${BTN.byMonth}</button><button class="on" data-act="calmode" data-k="week">${BTN.byWeek}</button></span></div></div>
      ${chipsRow()}
      <div class="w7">${byDay.map(x => {
            const pt = D.parts(x.d);
            return `<div class="wcol${x.d === D.TODAY ? ' today' : ''}${x.list.length ? '' : ' none'}">
          <div class="wcol-h" data-act="calday" data-k="${x.d}" data-tip="按月看 ${esc(D.cnShort(x.d))}"><span class="n">${pt.d}</span><b>${esc(pt.wd)}</b></div>
          ${x.list.map(wItem).join('')}</div>`;
        }).join('')}</div>
      ${foot.length ? `<div class="wkfoot-l">${foot.join('')}</div>` : ''}
    </div>`;
    }

    function wItem(x) {
        const p = x.p, m = D.matOf(p, x.mat), pub = pubOf(p, x.id), c = pub ? pub.snapshot : (m && D.usedCand(m)),
            k = CH(x.channel);
        return `<div class="witem${pub ? ' done' : ''}" data-ctx="post:${esc(p.id)}:${esc(x.id)}" data-tip="${esc(p.name)}">
      <div class="tm">${esc(x.time)}</div>
      <div class="src" data-open="${esc(p.id)}">${esc(p.name)} · <span style="color:${k.ink}">${esc(x.channel)}</span></div>
      <div class="tt" data-open="${esc(p.id)}">${esc((x.text || '').split('\n')[0])}</div>
      ${c ? `<div class="th" data-open="${esc(p.id)}">${pic(c.img)}</div>` : `<div class="th none" data-open="${esc(p.id)}">没封面</div>`}
      ${pub ? `<div class="fd">${ic('check', 12)} 你说发了 ${esc(D.cnShort(pub.at))}${pub.link ? ' · 有链接' : ''}</div>`
            : `<button class="btn xs wtk" data-act="pub-add" data-p="${esc(p.id)}" data-id="${esc(x.id)}" data-day="${x.date}">${ic('check', 12)} ${BTN.pub}</button>`}</div>`;
    }

    /* ---------- 模板 ---------- */
    const audienceLabel = t => t.audience === 'ai' ? 'AI 自媒体' : t.audience === 'general' ? '通用自媒体' : '未分类';

    function templateFilter(list, audience, scenario, kw = '') {
        return list.filter(t => (!audience || t.audience === audience) && (!scenario || t.scenario === scenario) && (!kw || [t.name, t.from, t.style, t.fit, t.scenario, t.contentType, ...(t.useCases || [])].join(' ').includes(kw)));
    }

    function templateFilters(audience, scenario, prefix) {
        const labels = [['', '全部'], ['general', '通用自媒体'], ['ai', 'AI 自媒体']],
            list = templateFilter(D.TEMPLATES.filter(t => !t.sample), audience, '');
        const scenarios = [...new Set(list.map(t => t.scenario).filter(Boolean))];
        return `<div class="template-filters"><div class="pills">${labels.map(([value, label]) => `<button class="pill${audience === value ? ' on' : ''}" data-act="${prefix}-audience" data-k="${value}">${label}<span class="c">${templateFilter(D.TEMPLATES.filter(t => !t.sample), value, '').length}</span></button>`).join('')}</div>${scenarios.length ? `<div class="pills"><span class="small muted">使用场景</span><button class="pill sm${!scenario ? ' on' : ''}" data-act="${prefix}-scenario" data-k="">全部场景</button>${scenarios.map(value => `<button class="pill sm${scenario === value ? ' on' : ''}" data-act="${prefix}-scenario" data-k="${esc(value)}">${esc(list.find(t => t.scenario === value)?.contentType || value)}</button>`).join('')}</div>` : ''}</div>`;
    }

    function templateDesignHtml(t) {
        const g = t.generation;
        if (!g && !t.anatomy?.length) return '';
        return `<section class="card pad template-design"><h3>怎么使用这套模板</h3><p>${esc(t.contentType || t.fit)}</p><ul class="dot-list">${(t.useCases || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>${t.anatomy?.length ? `<h4>区域拆解 · 固定与可改</h4><div class="anatomy-list">${t.anatomy.map(a => `<div><b>${esc(a.region)}</b><span class="tag ${a.editable ? 'mute' : 'ok'}">${a.editable ? '内容可改' : '结构固定'}</span><p>${esc(a.role)} · ${esc(a.rule)}</p></div>`).join('')}</div>` : ''}${g ? `<h4>出图说明</h4><p>${esc(g.intent)}</p><dl class="generation-policies">${[['主体', g.subjectPolicy], ['文字', g.textPolicy], ['参考图', g.referencePolicy]].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><details><summary>提示词骨架与变量</summary><pre class="pw-text">${esc(g.promptTemplate)}</pre><p class="small muted">出封面时自动填入本次标题和比例；缺少事实不编造。</p>${g.variables.map(v => `<p><code>${esc(v.key)}</code> · ${esc(v.label)}${v.required ? '（需要）' : '（可选）'} · 示例：${esc(v.example)}</p>`).join('')}</details><h4>容易翻车</h4><ul class="dot-list">${g.negative.map(x => `<li>${esc(x)}</li>`).join('')}</ul><h4>看图逐项验收</h4><ul class="dot-list">${g.qualityChecks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`;
    }

    function generatedReferenceHtml(t) {
        if (!W.isBuiltinTemplate(t)) return '';
        return `<details class="card pad"><summary>制作来源与检查说明</summary><p class="small muted">内置模板均已配好规则，可直接用于出图。主预览为原创 AI 生成样图，旧 SVG 仅作结构示意。样图不代表新标题还原测试通过；新内容仍需检查文字、主体与比例。</p><p class="small muted">${(t.generatedReferences || []).map(a => `${esc(a.tool)} · ${esc(a.generatedAt)} · ${a.width} × ${a.height}`).join('；')}</p></details>`;
    }

    function vTemplates() {
        const builtin = D.TEMPLATES.filter(t => W.isBuiltinTemplate(t)),
            mine = D.TEMPLATES.filter(t => !t.sample && !W.isBuiltinTemplate(t)),
            demos = D.SETTINGS.showSample ? D.TEMPLATES.filter(t => t.sample) : [];
        const f = l => templateFilter(l, S.taudience, S.tscenario, S.kw);
        return `<div class="wrap">
      <div class="ph"><h1>模板</h1><span class="sub">${builtin.length + mine.length} 套封面风格</span>
        <div class="acts"><button class="btn p" data-act="new-template">${ic('plus', 15)} ${BTN.newTemplate}</button></div></div>
      ${photosHtml()}${templateFilters(S.taudience, S.tscenario, 'tpl')}<div class="search big" style="margin-bottom:22px"><span>${ic('search', 16)}</span><input class="inp" placeholder="搜场景、风格、适合的内容" value="${esc(S.kw)}" data-act="kw"></div>
      <div class="sect">内置<span class="c">${f(builtin).length} 套 · 选好即可使用</span></div>
      <div class="tpls">${f(builtin).map(tplCard).join('')}</div>
      ${f(mine).length ? `<div class="sect">我的模板<span class="c">${f(mine).length}</span></div><div class="tpls">${f(mine).map(tplCard).join('')}</div>` : ''}
      ${demos.length && !S.taudience && !S.tscenario && !S.kw ? `<details style="margin-top:28px"><summary class="muted">历史演示模板 ${demos.length} · 仅供查看</summary><div class="tpls" style="margin-top:16px">${demos.map(tplCard).join('')}</div></details>` : ''}
    </div>`;
    }

    /* 列表卡一律固定盒：模板只是风格，不拿自己的比例去撑卡（尺寸在出封面那一步定） */
    const templateBrowse = {};

    function sampleStrip(t) {
        const samples = W.templateSamples(t);
        return `<div class="sample-strip" aria-label="${samples.length} 张组内样张">${samples.slice(0, 4).map(src => pic(src)).join('')}<span>${samples.length} 张样张 · 一组风格</span></div>`;
    }

    function templateGallery(t) {
        const samples = W.templateSamples(t), i = Math.max(0, Math.min(templateBrowse[t.id] || 0, samples.length - 1)),
            src = samples[i];
        return `<div class="card"><div class="card-h"><h2>模板样张组</h2><span class="sub">${samples.length} 张真实样张 · 共同风格，不同构图</span>${!W.isBuiltinTemplate(t) && t.shots.length ? `<div class="r"><button class="btn s" data-act="tpl-shot-add" data-id="${esc(t.id)}">${BTN.addShot}</button></div>` : ''}</div><div class="shot-box"><button class="big-shot" data-act="zoom" data-src="${esc(src || '')}" data-cap="${esc(t.name)} · 样张 ${i + 1}" aria-label="查看${esc(t.name)}样张 ${i + 1} 大图" ${src ? '' : 'disabled'}>${src ? pic(src) : '<span class="muted">还没有样张</span>'}</button></div>${samples.length ? `<div class="sample-nav"><button class="btn s" data-act="tpl-browse" data-id="${esc(t.id)}" data-i="${i - 1}" ${i === 0 ? 'disabled' : ''}>上一张</button><span>${i + 1} / ${samples.length}</span><button class="btn s" data-act="tpl-browse" data-id="${esc(t.id)}" data-i="${i + 1}" ${i === samples.length - 1 ? 'disabled' : ''}>下一张</button></div><div class="shots sample-thumbs">${samples.map((src, n) => `<button class="sh${n === i ? ' selected' : ''}" data-act="tpl-browse" data-id="${esc(t.id)}" data-i="${n}" aria-label="查看样张 ${n + 1}" aria-pressed="${n === i}"${!W.isBuiltinTemplate(t) ? ` data-ctx="tshot:${esc(t.id)}:${t.shots.indexOf(src)}"` : ''}>${pic(src)}</button>`).join('')}</div>` : ''}</div>${t.assets?.length ? `<details class="card pad"><summary>SVG 结构示意 · ${t.assets.length} 张（不计入样张）</summary><div class="shots">${t.assets.map(a => `<button class="sh" data-act="zoom" data-src="${esc(a.path)}" data-cap="SVG 结构示意" aria-label="查看 SVG 结构示意">${pic(a.path)}</button>`).join('')}</div></details>` : ''}`;
    }

    function tplCard(t) {
        return `<div class="tpl" data-tpl="${esc(t.id)}" data-ctx="tpl:${esc(t.id)}">
      ${imgBox({
            src: t.img,
            ratio: t.img ? ratioCss(t.ratio) : '3/4',
            auto: true,
            cap: t.name,
            ctx: `tpl:${esc(t.id)}`,
            empty: '还没有原图',
            cta: `<button class="btn s" data-act="tpl-shot-add" data-id="${esc(t.id)}">${BTN.addShot}</button>`,
            extra: `${t.state !== '可用' ? `<span class="st2"><span class="tag warn">${esc(t.state)}</span></span>` : ''}
        ${t.builtin ? '' : `<span class="flag"><span class="tag ok">${esc(t.owner)}</span></span>`}
        ${t.img ? `<span class="hover"><button class="btn s ico" data-act="zoom" data-src="${esc(t.img)}" data-cap="${esc(t.name)}" data-tip="看大图">${ic('fit', 15)}</button>
        <button class="btn s ico" data-act="dl" data-tid="${esc(t.id)}" data-n="${W.templateSamples(t).length}" aria-label="下载 ${W.templateSamples(t).length} 张样张 ZIP">${ic('down', 15)}</button>
        <button class="btn s ico" data-act="tpl-more" data-id="${esc(t.id)}">${ic('dots', 15)}</button></span>` : ''}`
        })}
      ${sampleStrip(t)}<div class="cap">${esc(t.name)}</div><div class="template-meta"><span class="tag mute">${audienceLabel(t)}</span>${t.contentType ? `<span>${esc(t.contentType)}</span>` : ''}</div>${W.isBuiltinTemplate(t) ? `<div class="small muted">内置原创 · ${W.isTemplateUsable(t) ? '可直接使用' : esc(t.state)}</div>` : ''}<div class="sub">${t.img ? (W.isBuiltinTemplate(t) ? '用过 ' + t.used + ' 次' : esc(t.from) + ' · 用过 ' + t.used + ' 次') : '拆完才有风格说明'}</div>${W.isTemplateUsable(t) ? `<button class="btn s p block" style="margin-top:10px" data-act="use-tpl" data-id="${esc(t.id)}">${BTN.useTemplate}</button>` : ''}</div>`;
    }

    function vTemplate() {
        const t = D.tplOf(S.tid);
        if (!t) return vTemplates();
        const usedBy = D.PROJECTS.filter(p => p.tpl === t.id);
        return `<div class="wrap">
      <div class="crumb"><button data-page="templates">模板</button>${ic('chev', 14)}<b>${esc(t.name)}</b></div>
      ${photosHtml()}
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 372px">
        <div class="stack">
          ${W.builtinUpdate(t) ? `<div class="card pad"><h3>${W.builtinUpdate(t).version === t.version ? '有新的参考资产' : '有新的内置定义'} · v${W.builtinUpdate(t).version}</h3><p>${W.builtinUpdate(t).version === t.version ? '设计规则不变；更新后可选新附的 AI 风格参考，待人工验收。当前版本继续可用，旧定义和已有任务参考快照会保留。' : `当前 v${t.version} 继续可用，项目和任务仍保留原版快照。更新会把当前规则与来源归档，替换成新内置定义。`}</p><button class="btn" data-act="builtin-update" data-id="${esc(t.id)}">${W.builtinUpdate(t).version === t.version ? '更新参考资产' : '更新内置定义'}</button></div>` : ''}
          ${templateGallery(t)}
          ${templateDesignHtml(t)}${generatedReferenceHtml(t)}${t.why.length || t.colors.length ? `<div class="cols3">
            <div class="card pad"><h3>为什么好看</h3><div class="why-list">${t.why.map((w, i) => `<div><span class="num">${i + 1}</span><div><b>${esc(w[0])}</b><p>${esc(w[1])}</p></div></div>`).join('') || '<div class="muted small">拆解回来才有</div>'}</div></div>
            <div class="card pad"><h3>配色</h3><div class="sw-bar">${t.colors.map(c => `<i style="background:${c.v}"></i>`).join('')}</div>
              <div class="sw-list">${t.colors.map(c => `<div class="sw-row"><span class="sw-chip" style="background:${c.v}"></span><b>${esc(c.k)}</b>${c.note ? `<span class="tag mute">${esc(c.note)}</span>` : ''}<span class="mono muted" style="margin-left:auto">${esc(c.v)}</span></div>`).join('')}</div>
              <h3 style="margin-top:22px">每场会变的</h3><ul class="dot-list">${t.varies.map(v => `<li>${esc(v)}</li>`).join('')}</ul>
              <div style="margin-top:16px;font-size:var(--f14)"><b>换内容也不变：</b><span class="muted">${esc(t.fixed.join('、'))}</span></div></div>
          </div>` : !t.shots.length ? `<div class="card"><div class="big-empty"><b>还没有原图</b><span>没原图拆不了 —— 风格结论只能从真实画面里来，不靠想象写</span></div>
            <p class="small muted">从上方“当前步骤”添加原图。</p></div>`
            : `<div class="card"><div class="big-empty"><b>拆解还没回来</b><span>尚未收到真实拆解结果，导入以后这里才有「为什么好看」和配色</span></div>
            <p class="small muted">从上方“当前步骤”继续处理。</p></div>`}
          <div class="sect">用它出过的<span class="c">${usedBy.length}</span></div>
          ${usedBy.length ? `<div class="card"><div class="mat-grid" style="padding:16px 18px">${usedBy.map(p => {
            const c = coverOfP(p);
            return `<div class="mcard ${c && c.m.format === '方图' ? 'sq' : c && (c.m.format === '头图' || c.m.format === '横版') ? 'wide' : ''}" data-open="${esc(p.id)}" data-ctx="mat:${esc(p.id)}:${c ? c.m.id : ''}">
              ${imgBox({
                src: c ? c.c.img : '',
                ratio: c ? ratioCss(c.m.ratio) : '3/4',
                auto: true,
                making: D.makingOf(p),
                empty: '尚未选定',
                cap: `${t.name} · 用它出的 ${p.name}`,
                ctx: c ? `mat:${esc(p.id)}:${c.m.id}` : '',
                extra: `<span class="hover"><button class="btn s" data-act="copy-img" data-p="${esc(p.id)}" data-m="${c ? c.m.id : ''}" ${c ? '' : 'disabled'}>${BTN.copyImage}</button>
                <button class="btn s ico" data-act="zoom" data-src="${c ? esc(c.c.img) : ''}" data-cap="${esc(t.name)} · 用它出的 ${esc(p.name)}" data-tip="看大图">${ic('fit', 15)}</button></span>`
            })}
              <div class="cap"><b>${esc(p.name)}</b><span>${c ? `${esc(c.m.format)} · ${esc(c.c.no)} 号` : '还没选定'}</span></div></div>`;
        }).join('')}</div></div>` : `<div class="card"><div class="empty"><b>还没有用它出过</b>${W.isTemplateUsable(t) ? `<div class="ops"><button class="btn" data-act="use-tpl" data-id="${esc(t.id)}">${BTN.useTemplate}</button></div>` : '<p class="small muted">完成当前步骤后即可使用这套模板。</p>'}</div></div>`}
        </div>
        <div class="side-card"><h3>${esc(t.name)} <span class="tag mute">${esc(t.state)}</span></h3><div class="meta">${t.builtin ? '内置' : esc(t.from)} · 用过 ${t.used} 次</div>
          ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ''}${t.style ? `<div class="style">${esc(t.style)}</div>` : ''}
          <div class="kv"><div><span class="k">受众 / 场景</span><span>${audienceLabel(t)}${t.scenario ? ' · ' + esc(t.scenario) : ''}</span></div><div><span class="k">出图尺寸</span><span>出封面时可选择比例；需按比例重排，并逐比例验收</span></div><div><span class="k">原图</span><span>${W.templateSamples(t).length} 张样张${t.ratio ? ` · 都是 ${esc(t.ratio)}` : ''}</span></div>${t.fit ? `<div><span class="k">适合</span><span>${esc(t.fit)}</span></div>` : ''}${t.unfit ? `<div><span class="k">不适合</span><span>${esc(t.unfit)}</span></div>` : ''}<div><span class="k">来源</span><span>${esc(t.source)}</span></div><div><span class="k">使用状态</span><span>${W.isBuiltinTemplate(t) ? (W.isTemplateUsable(t) ? '<span class="tag ok">可直接使用</span><span class="small muted">新内容出图后需检查文字与主体</span>' : `<span class="tag warn">${esc(t.state)}</span>`) : t.validation?.accepted ? '<span class="tag ok">人工验收通过</span>' : '<span class="tag mute">没做</span>'}</span></div></div>
          ${W.isTemplateUsable(t) ? `<button class="btn p block" style="margin-top:20px;height:46px" data-act="use-tpl" data-id="${esc(t.id)}">${BTN.useTemplate}</button>` : `<p class="small muted">${esc(t.state)} · 从“当前步骤”继续</p>`}
          ${W.templateSamples(t).length ? `<button class="btn t block" style="margin-top:6px" data-act="dl" data-tid="${esc(t.id)}" data-n="${W.templateSamples(t).length}" aria-label="下载 ${W.templateSamples(t).length} 张样张 ZIP">${ic('down', 15)} 下载 ${W.templateSamples(t).length} 张样张 ZIP</button>` : ''}</div>
      </div></div>`;
    }

    /* ---------- 提示词（内容库/提示词/<分类>/<名字>.md，内置这 26 条作为初始库） ---------- */
    const pwOf = id => D.PROMPTS.find(p => p.id === id);
    const pwLive = () => D.PROMPTS.filter(p => !p.off);
    const pwOffN = () => D.PROMPTS.length - pwLive().length;

    function pwList() {
        let list = S.poff ? D.PROMPTS.filter(p => p.off) : pwLive();
        if (S.pfavOnly) list = list.filter(p => S.pfav[p.id]);
        if (S.pmiss) list = list.filter(p => !String(p.when || '').trim());
        if (S.pcat) list = list.filter(p => p.cat === S.pcat);
        if (S.ptag) list = list.filter(p => p.tags.indexOf(S.ptag) >= 0);
        if (S.pkw) list = D.pmatch(S.pkw, list);
        return list;
    }

    const pwPlain = () => !S.pkw && !S.pcat && !S.ptag && !S.pfavOnly && !S.pmiss && !S.poff;

    /* 来源标签：从 source 现推，不在数据里另存一份；整句出处在详情弹窗和悬浮提示里 */
    function pwFrom(p) {
        const s = p.source || '';
        if (/卡兹克/.test(s)) return '卡兹克';
        if (/余一/.test(s)) return '余一';
        if (/第二大脑/.test(s)) return '第二大脑';
        if (/提示词库\//.test(s)) return '旧库';
        return p.mine ? '自己加的' : '内置';
    }

    function pwCard(p, i) {
        const u = D.puse(p.id), nf = D.pfill(p).length, on = !!S.pfav[p.id];
        return `<div class="pc${i === S.psi ? ' hi' : ''}${on ? ' fav' : ''}${p.off ? ' off' : ''}" data-pw="${esc(p.id)}" data-pwdrag="${esc(p.id)}" draggable="true" data-ctx="pw:${esc(p.id)}">
      <div class="ops"><button class="ib" data-tip="按住拖动改顺序 · 记在 _排序.md">${ic('drag', 15)}</button>
        <button class="ib${on ? ' on' : ''}" data-act="pw-fav-one" data-id="${esc(p.id)}" data-tip="${on ? BTN.unfav : BTN.fav}">${ic('star', 15)}</button>
</div>
      <div class="t">${esc(p.title)}</div><div class="w">${esc(p.when || p.summary || '打开看看这条提示词怎么用')}</div>
      <div class="f"><span class="tag warn">${esc(p.cat)}</span><span class="tag mute" data-tip="${esc(p.source || '自己加的，没有出处')}">${esc(pwFrom(p))}</span>
        <span class="s">${u ? esc(TAG.once(u.n)) + ' · ' + esc(D.cnShort(u.last)) : TAG.notUsed}</span>${nf ? `<span class="v">${esc(TAG.fill(nf))}</span>` : ''}${p.off ? '<span class="tag mute">停用了</span>' : ''}</div>
      <button class="btn s pw-use-btn" data-act="pw-copy" data-id="${esc(p.id)}">${nf ? '填写并复制' : '查看并复制'} ${ic('chev', 14)}</button></div>`;
    }

    function pwGrid(list, from, add) {
        return `<div class="pcards">${list.map((p, i) => pwCard(p, from + i)).join('')}
      ${add !== false && pwPlain() ? `<div class="pc add" data-act="new-prompt"><span class="plus">${ic('plus', 16)}</span>${BTN.newPrompt}</div>` : ''}</div>`;
    }

    function vPrompts() {
        const list = pwList(), fav = pwLive().filter(p => S.pfav[p.id]).length, live = pwLive();
        const cats = [...new Set(live.map(p => p.cat))].sort((a, b) => {
            const ia = D.PCATS.indexOf(a), ib = D.PCATS.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        }), tags = D.ptagList();
        const mine = list.filter(p => p.mine), base = list.filter(p => !p.mine);
        return `<div class="wrap">
      <div class="ph"><h1>提示词</h1><span class="sub">${live.length ? `共 ${live.length} 条 · 本次会话复制 ${D.pcopies()} 次` : ''}${pwOffN() ? ` · 停用 ${pwOffN()} 条` : ''}</span>
        <div class="acts"><button class="btn p" data-act="new-prompt">${ic('plus', 15)} 添加提示词</button></div></div>
      <p class="pw-guide">选一条 → 填入你的情况 → 复制到 AI 对话中使用</p>
      <div class="pw-bar"><div class="search big"><span>${ic('search', 16)}</span>
        <input id="pw-kw" class="inp" placeholder="搜你遇到的情况，比如：纠结、听不懂" aria-label="搜索提示词" aria-describedby="pw-keys" value="${esc(S.pkw)}" data-act="pw-kw" autocomplete="off" spellcheck="false"></div>
        <button class="pill${S.ptag || S.pmiss ? ' on' : ''}" data-act="pw-filter" data-tip="按标签找，或者从常用的里面直接复制">${ic('menu', 14)} 标签 · 常用${S.ptag ? ` · #${esc(S.ptag)}` : ''}${S.pmiss ? ' · 没写处境' : ''}</button>
        <button class="pill${S.pfavOnly ? ' on' : ''}" data-act="pw-fav" data-tip="只看点过星标的">${ic('star', 14)} 收藏<span class="c">${fav}</span></button>
        ${pwOffN() ? `<button class="pill${S.poff ? ' on' : ''}" data-act="pw-off-view" data-tip="停用的还在文件夹里，只是不在页面上挡路">${TAG.pwOff(pwOffN())}</button>` : ''}
        ${S.pkw ? `<span class="hint">${list.length} 条对上</span>` : ''}</div>
      <div class="pw-keys" id="pw-keys">↑↓ 选择 · Enter 打开 · Esc 清空搜索</div>
      ${live.length ? `<div class="pw-row"><span class="lb">分类</span><div class="pills flow">
        <button class="pill${!S.pcat ? ' on' : ''}" data-act="pw-cat" data-k="">全部<span class="c">${live.length}</span></button>
        ${cats.map((c, i) => `${i ? '<span class="arw">›</span>' : ''}<button class="pill${S.pcat === c ? ' on' : ''}" data-act="pw-cat" data-k="${esc(c)}" data-tip="${esc(D.PCAT_WHY[c] || '')}">${esc(c)}<span class="c">${live.filter(p => p.cat === c).length}</span></button>`).join('')}</div></div>` : ''}
      ${list.length ? (pwPlain() && mine.length
                ? `<div class="sect">${TAG.mineAdded}<span class="c">${mine.length}</span></div>${pwGrid(mine, 0, false)}<div class="sect">${TAG.builtin}<span class="c">${base.length}</span></div>${pwGrid(base, mine.length)}`
                : `${pwPlain() ? `<div class="sect">${TAG.builtin}<span class="c">${base.length}</span></div>` : `<div class="sect">筛出<span class="c">${list.length}</span></div>`}${pwGrid(list, 0)}`)
            : live.length
                ? `<div class="card" style="margin-top:4px"><div class="empty"><b>没有对上的</b><div class="ops">${S.pkw ? `<button class="btn p" data-act="new-prompt" data-k="${esc(S.pkw)}">用这句新建一条</button>` : ''}<button class="btn" data-act="pw-clear">清空筛选</button></div></div></div>`
                : `<div class="card"><div class="big-empty pw-empty"><b>还没有一条提示词</b><span>把别人分享的提示词粘贴进来，也可以自己写</span></div>
            <div class="pw-empty-acts"><button class="btn p" data-act="new-prompt">${ic('plus', 15)} 添加提示词</button></div></div>`}

    </div>`;
    }

    /* 标签和常用收在这一层里：页顶只留搜索 + 分类，扫读时不被控件打断 */
    function pwFilterModal() {
        const live = pwLive(), tags = D.ptagList(), top = D.ptop(), miss = D.pmiss();
        modal({
            title: '标签 · 常用', sub: `${tags.length} 个标签 · ${top.length} 条常用`,
            body: `<div class="pf-sec"><h4>按标签筛</h4><div class="pills flow">
          <button class="pill${!S.ptag ? ' on' : ''}" data-act="pw-tag" data-k="">全部<span class="c">${live.length}</span></button>
          ${tags.map(t => `<button class="pill${S.ptag === t ? ' on' : ''}" data-act="pw-tag" data-k="${esc(t)}">#${esc(t)}<span class="c">${live.filter(p => p.tags.indexOf(t) >= 0).length}</span></button>`).join('')}</div></div>
        ${top.length ? `<div class="pf-sec"><h4>常用 · 打开使用</h4><div class="pills flow">${top.map(x => {
                const nf = D.pfill(x.p).length;
                return `<button class="pill use" data-act="pw-copy" data-id="${esc(x.p.id)}" data-tip="${esc(BTN.copyPrompt(nf))}"><b>${esc(x.p.title)}</b><span class="c">${x.u.n} 次</span>${ic('copy', 14)}</button>`;
            }).join('')}</div></div>` : ''}
        ${miss.length ? `<div class="pf-sec"><h4>要处理</h4><div class="pills">
          <button class="pill${S.pmiss ? ' on' : ''}" data-act="pw-see-miss">${TAG.pwMiss(miss.length)}</button></div></div>` : ''}`,
            actions: '<button class="btn p" data-close>收起</button>'
        });
    }

    // 填写只留在本页面会话，关闭弹窗后可继续；刷新即清空，不进入工作区或备份。
    const PWDRAFTS = new Map();
    let PWUSE = null;

    function pwModal(p) {
        if (!p) return;
        const fields = D.pfill(p);
        let draft = PWDRAFTS.get(p.id);
        if (!draft || draft.body !== p.body) {
            draft = {body: p.body, values: Object.create(null), copied: null, busy: false};
            PWDRAFTS.set(p.id, draft);
        }
        const use = {p, fields, draft, mm: null, validated: false};
        modal({
            wide: true, cls: 'pw-use', title: p.title,
            sub: p.when || p.summary || '查看提示词，复制到 AI 对话中使用',
            body: `<div class="pw-use-grid${fields.length ? '' : ' no-fields'}">
        <section class="pw-output" aria-labelledby="pu-preview-heading"><div class="pw-panel-head"><h4 id="pu-preview-heading">提示词内容</h4><span class="small muted" id="pu-progress"></span></div>
          <p class="small muted">${fields.length ? '填写后，这里会自动更新。复制的就是这段完整内容。' : '这条无需填写，直接复制即可使用。'}</p><textarea class="inp pw-preview" id="pu-preview" readonly data-autofocus aria-label="最终提示词预览"></textarea></section>

        ${fields.length ? `<section class="pw-inputs" aria-labelledby="pu-fill-heading"><div class="pw-panel-head"><h4 id="pu-fill-heading">填入你的情况</h4><button class="btn s g" data-act="pw-reset" data-id="${esc(p.id)}">清空本次填写</button></div>
          <p class="small muted">可以换行、粘贴长内容；这里只填写本次使用的信息。</p>
          ${fields.map((x, i) => `<div class="field"><label for="pu-field-${i}">${esc(x.k)}</label>${x.hint ? `<p class="pw-field-hint" id="pu-hint-${i}">${esc(x.hint)}</p>` : ''}<textarea class="inp" id="pu-field-${i}" data-pv="${i}" rows="4" aria-required="true" aria-describedby="pu-error-${i}${x.hint ? ' pu-hint-' + i : ''}" placeholder="在这里填写${esc(x.k)}">${esc(draft.values[x.k] || '')}</textarea><span class="pw-field-error" id="pu-error-${i}"></span></div>`).join('')}</section>` : ''}</div>
        <details class="pw-details"><summary>原始模板、来源与管理</summary><div class="pw-text">${esc(p.body)}</div>
          <button class="btn s" data-act="pw-raw-copy" data-id="${esc(p.id)}">复制原始模板</button><span class="small muted"> 保留 {{变量}}，由你自行填写</span>
          <div class="lines"><div class="line"><span class="k">适用情况</span><span class="v">${ie({
                t: 'pw',
                v: p.when,
                id: p.id,
                ph: '什么时候会想起它'
            })}<button class="btn s g" data-act="pw-ask-ai" data-id="${esc(p.id)}">${esc(BTN.pwFixOne(HOST()))}</button></span></div>
          <div class="line"><span class="k">分类</span><span class="v">${esc(p.cat)}</span></div>${p.summary ? `<div class="line"><span class="k">说明</span><span class="v">${esc(p.summary)}</span></div>` : ''}
          <div class="line"><span class="k">来源</span><span class="v">${esc(p.source || '自己加的')}</span></div>${p.tags.length ? `<div class="line"><span class="k">标签</span><span class="v">${p.tags.map(t => '#' + esc(t)).join(' · ')}</span></div>` : ''}
          <div class="line"><span class="k">文件</span><span class="v mono small">${esc('提示词/' + p.cat + '/' + p.file + '.md')}</span></div></div>
          <div class="pw-detail-actions"><button class="btn s" data-act="pw-folder" data-id="${esc(p.id)}">${BTN.inFolder}</button>${p.mine ? '' : `<button class="btn s" data-act="pw-off" data-id="${esc(p.id)}">${p.off ? BTN.pwOn : BTN.pwOff}</button>`}</div></details>`,
            actions: `<div class="pw-copy-status"><span id="pu-status" role="status" aria-live="polite"></span><span class="small muted">填写仅保留到本页刷新 · Ctrl / ⌘ + Enter 复制</span></div><button class="btn" id="pu-select" data-act="pw-select" hidden>选中完整文本，手动复制</button><button class="btn" data-close>关闭</button><button class="btn p" id="pu-copy" data-act="pw-fill-copy" data-id="${esc(p.id)}">${ic('copy', 15)} 复制提示词</button>`,
            after(mm) {
                use.mm = mm;
                PWUSE = use;
                mm.oninput = ev => {
                    if (ev.target.matches('[data-pv]')) {
                        const field = fields[+ev.target.dataset.pv];
                        draft.values[field.k] = ev.target.value;
                        pwRefresh(use);
                    }
                };
                pwRefresh(use);
            }
        });
    }

    function pwRefresh(use) {
        const {p, fields, draft, mm} = use, missing = fields.filter(f => !String(draft.values[f.k] || '').trim());
        const text = D.ptext(p, draft.values);
        mm.querySelector('#pu-preview').value = text;
        mm.querySelector('#pu-progress').textContent = fields.length ? `已填 ${fields.length - missing.length} / ${fields.length} 项` : '无需填写';
        fields.forEach((f, i) => {
            const invalid = use.validated && !String(draft.values[f.k] || '').trim();
            mm.querySelector('#pu-field-' + i).setAttribute('aria-invalid', String(invalid));
            mm.querySelector('#pu-error-' + i).textContent = invalid ? '请填写' + f.k : '';
        });
        const copied = draft.copied === text;
        mm.querySelector('#pu-copy').disabled = draft.busy;
        mm.querySelector('#pu-copy').textContent = draft.busy ? '正在复制…' : copied ? '再次复制提示词' : '复制提示词';
        mm.querySelector('#pu-status').textContent = draft.busy ? '正在复制…' : copied ? '已复制 · 到 AI 对话中粘贴发送' : use.validated && missing.length ? `还有 ${missing.length} 项未填，填写后再复制` : fields.length ? '填好后，复制到 AI 对话中粘贴发送' : '复制后，到 AI 对话中粘贴发送';
        mm.querySelector('#pu-select').hidden = true;
        return missing;
    }

    /* 在内容页就地找一句话术，进入相同的使用窗口。 */
    function pwPickModal(p) {
        let kw = '', sel = -1;
        const list = () => D.pmatch(kw, pwLive());
        const pick = id => {
            const x = pwOf(id);
            if (!x) return;
            pwModal(x);
        };
        const rows = () => {
            const l = list();
            return l.length ? l.slice(0, 60).map((x, i) => {
                const nf = D.pfill(x).length;
                return `<div class="ppr${i === sel ? ' hi' : ''}" data-pp="${esc(x.id)}"><b>${esc(x.title)}</b>
          <span class="w">${x.when ? esc(x.when) : `<span class="tag warn">${TAG.noWhen}</span>`}</span>${nf ? `<span class="v">${esc(TAG.fill(nf))}</span>` : ''}</div>`;
            }).join('') : `<div class="empty"><b>没有对上的</b><div class="ops"><button class="btn" data-act="pw-goto">去提示词页新建一条</button></div></div>`;
        };
        const paint = box => {
            box.innerHTML = rows();
            const el = box.querySelector('.ppr.hi');
            el && el.scrollIntoView({block: 'nearest'});
        };
        modal({
            wide: true, title: '找句话术', sub: p.name,
            body: `<div class="search big"><span>${ic('search', 16)}</span>
        <input class="inp" id="pp-kw" placeholder="搜你遇到的情况，比如：起不出标题" aria-label="搜索话术" autocomplete="off" spellcheck="false"></div>
        <p class="pw-keys">↑↓ 选择 · Enter 打开使用</p><div class="pp-list" id="pp-list"></div>`,
            actions: cancel + `<button class="btn" data-act="pw-goto">看全部 ${pwLive().length} 条</button>`,
            after(mm) {
                const box = mm.querySelector('#pp-list'), inp = mm.querySelector('#pp-kw');
                box.onclick = ev => {
                    const r = ev.target.closest('[data-pp]');
                    if (r) pick(r.dataset.pp);
                };
                inp.oninput = () => {
                    kw = inp.value.trim();
                    sel = -1;
                    paint(box);
                };
                inp.onkeydown = ev => {
                    if (ev.isComposing || ev.keyCode === 229) return;
                    const l = list();
                    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                        ev.preventDefault();
                        sel = Math.max(0, Math.min(l.length - 1, sel + (ev.key === 'ArrowDown' ? 1 : -1)));
                        paint(box);
                    } else if (ev.key === 'Enter') {
                        ev.preventDefault();
                        const x = l[sel < 0 ? 0 : sel];
                        if (x) pick(x.id);
                    }
                };
                paint(box);
                requestAnimationFrame(() => inp.focus());
            }
        });
    }

    async function pwCopy(use, raw = false) {
        const {p, draft, mm} = use;
        if (draft.busy) return;
        if (!raw) {
            use.validated = true;
            const missing = pwRefresh(use);
            if (missing.length) {
                mm.querySelector('#pu-field-' + use.fields.indexOf(missing[0])).focus();
                return false;
            }
        }
        const text = raw ? p.body : D.ptext(p, draft.values);
        draft.busy = true;
        pwRefresh(use);
        const ok = await clipboardWrite(text);
        draft.busy = false;
        if (ok) {
            const u = D.PUSE[p.id] || (D.PUSE[p.id] = {n: 0, last: D.TODAY});
            u.n++;
            u.last = D.TODAY;
            draft.copied = text;
            const back = mm._returnFocus, cardId = back?.closest?.('[data-pw]')?.dataset.pw;
            render();
            if (back?.id) mm._returnFocus = document.getElementById(back.id) || back;
            else if (cardId) mm._returnFocus = $$('[data-pw]').find(x => x.dataset.pw === cardId) || back;
            else if (back?.dataset?.act) mm._returnFocus = $$('[data-act]').find(x => x.dataset.act === back.dataset.act && x.dataset.id === back.dataset.id) || back;
            if (PWUSE?.draft === draft && PWUSE.mm !== mm) PWUSE.mm._returnFocus = mm._returnFocus;
        }
        // 复制期间可关闭或切换弹窗，只刷新仍在使用同一份草稿的窗口。
        const activeUse = PWUSE?.draft === draft && $('#m-live') === PWUSE.mm ? PWUSE : null;
        if (activeUse) {
            const activeModal = activeUse.mm;
            pwRefresh(activeUse);
            if (raw && ok) activeModal.querySelector('#pu-status').textContent = '原始模板已复制 · 请在 AI 对话中自行补全变量';
            else if (ok && D.ptext(p, draft.values) !== text) activeModal.querySelector('#pu-status').textContent = '刚才的内容已复制；填写已更新，可重新复制';
            if (!ok) {
                activeModal.querySelector('#pu-status').textContent = '自动复制失败，填写已保留。请选中完整文本后按 Ctrl / ⌘ + C';
                activeModal.querySelector('#pu-select').hidden = false;
                activeModal.querySelector('#pu-select').dataset.raw = raw ? '1' : '';
            }
        }
        return ok;
    }

    /* ---------- 更多 / 检查一下 ---------- */
    function vMore() {
        return `<div class="wrap" style="max-width:1080px">
      <div class="ph"><h1>更多</h1><span class="sub">${BRAND.name} ${BRAND.version} · ${BRAND.org}</span></div>
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 372px">
        <div class="stack">
          <div class="card"><div class="card-h"><h2>我的素材</h2><div class="r"><button class="btn s" data-act="edit-account">${ic('edit', 14)} ${BTN.edit}</button><button class="btn s" data-act="open-folder">${ic('folder', 14)} ${BTN.openFolder}</button></div></div>
            <div class="acct"><div class="ava" data-cap="${esc(D.ACCOUNT.name)}">${pic(D.ACCOUNT.avatar)}</div>
              <div><div class="nm">${ie({t: 'acct', v: D.ACCOUNT.name, k: '账号名', ph: '账号叫什么'})}</div>
              <div class="sub">账号介绍 ${ie({t: 'acct', v: D.ACCOUNT.intro, k: '账号介绍', ph: '一句话，封面右下角用'})}</div></div></div>
            <div class="fields">${D.ACCOUNT.marks.map(x => `<div><span class="k">${esc(x.k)}</span><span class="v">${ie({
            t: 'acct',
            v: x.v,
            k: x.k,
            ph: x.k
        })}</span></div>`).join('')}
              <div><span class="k">正脸照</span><span class="v">${D.ACCOUNT.photos.filter(W.isOwnPhoto).length} 张本人照片 · 默认 ${esc(W.defaultPhoto()?.name || '未设置')}</span></div>
              <div><span class="k">封面模板</span><span class="v">${D.TEMPLATES.length} 套</span></div></div></div>
          <div class="card"><div class="card-h"><h2>内容库和插件</h2></div><div class="lines">
            <div class="line"><span class="k">${ic('folder', 15)} 内容库</span><span class="v"><button class="btn s" data-act="open-folder">${ic('ext', 14)} ${BTN.openFolder}</button><button class="btn s g" data-act="lib-more">${ic('dots', 15)}</button></span></div>
            <div class="line" style="padding-top:0"><span class="path" style="margin-left:27px">${esc(D.SETTINGS.root)}</span></div>
            <div class="line"><span class="k">${ic('plug', 15)} 插件</span><span class="v"><button class="btn s" data-act="cp" data-k="${esc(D.SETTINGS.pluginDir)}">${ic('copy', 14)} ${BTN.copy}</button><button class="btn s g" data-act="howto">${BTN.howTo}</button></span></div>
            <div class="line" style="padding-top:0"><span class="path" style="margin-left:27px">${esc(D.SETTINGS.pluginDir)}</span></div>
            <div class="line"><span class="k">${ic('star', 15)} 内置基线</span><span class="v"><span class="small muted">提示词 ${Object.keys(PW_BASE).length} 条 · 风格 ${Object.keys(TPL_BASE).length} 套${pwDirty().length ? ` · 你改过 ${pwDirty().length} 条` : ''}${tplGap().length ? ` · 缺原图 ${tplGap().length} 套` : ''}</span><button class="btn s g" data-act="builtin-list">看清单</button></span></div>
            <div class="line"><span class="k">${ic('prompt', 15)} 提示词</span><span class="v"><span class="small muted">${TAG.builtin} ${D.PROMPTS.filter(p => !p.mine).length} 条 · 用过 ${D.pcopies()} 次 · 内容库/提示词/</span><button class="btn s g" data-page="prompts">${BTN.viewAll} ${ic('chev', 14)}</button></span></div>
            <div class="line" style="padding-top:0"><span class="small muted" style="margin-left:27px">${esc(HOST())} ${esc(D.SETTINGS.versions[D.SETTINGS.host])}</span></div>
          </div></div>
        </div>
        <div class="stack">
          ${FEATURE_AUTH ? `<div class="card pad"><h2>账号 · 演示</h2><p>当前：${esc(AUTH_LABEL[W.auth])}</p><p class="small muted">本页面不产生真实授权凭据；已有成果始终可以浏览和导出。</p><div class="ops"><button class="btn" data-act="auth-demo">切换状态</button><button class="btn" data-act="logout">退出演示登录</button></div></div>` : ''}
          <div class="card"><div class="card-h"><h2>设置</h2></div><div class="lines">
            <div class="line"><label class="k" for="settings-host">交给哪个 AI 助手</label><span class="v">${hostSelector('settings-host')}</span></div>
            <div class="line"><span class="k">渠道</span><span class="v"><span class="small muted">${D.chanList().length} 个 · 自己加的 ${D.chanCustom().length} 个</span><button class="btn s" data-act="chan-manage">看和改</button></span></div>
            <div class="line"><span class="k">示例</span><span class="v"><span class="seg2">${[['show', '显示'], ['hide', '隐藏']].map(x => `<button class="${(x[0] === 'show') === D.SETTINGS.showSample ? 'on' : ''}" data-act="sample" data-k="${x[0]}">${x[1]}</button>`).join('')}</span></span></div>
            <div class="line"><span class="k">减少动画</span><span class="v"><button class="sw ${S.motion ? '' : 'on'}" data-act="motion"></button></span></div>
            <div class="line"><span class="k">检查一下</span><span class="v"><button class="btn s" data-page="check">${BTN.check}</button></span></div>
          </div></div>
        </div></div></div>`;
    }

    const vCheck = () => `<div class="wrap"><div class="crumb"><button data-page="more">更多</button>${ic('chev', 14)}<b>检查一下</b></div><div class="ph"><h1>浏览器能力与未知项</h1></div><div class="card pad"><p>检查时间：${esc(new Date().toLocaleString())}</p><div class="lines">${[['构建', W.config.pairId], ['保存', W.readonly ? W.error : 'localStorage · 容量和写入结果逐次核对'], ['格式', 'browser schema 1 · 不是桌面内容库'], ['系统目录 / 锁 / 同步盘', '未知 · 无桌面桥'], ['宿主安装 / 钩子信任', '未知 · 无宿主探测'], ['插件 Scope', 'nova-content-hub'], ['clientId', D.SETTINGS.clientId || '待配置'], ['鉴权', FEATURE_AUTH ? `演示：${AUTH_LABEL[W.auth]}；不是真实授权` : '本构建免鉴权'], ['真实模型执行', '未接入 · 手动交接后导入真实结果']].map(([k, v]) => `<div class="line"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div><button class="btn" data-act="plugin-settings">查看配置</button><button class="btn" data-act="diagnostic-handoff">交给${esc(HOST())}检查</button></div></div>`;

    function vBad() {
        return `<div class="wrap"><div class="badpage"><h2>找不到内容库</h2><p>记的位置在这里，打开的时候不在了。</p>
      <ul><li>${esc(D.SETTINGS.root)}</li></ul>
      <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn p" data-act="refind">${BTN.refind}</button>
      <button class="btn" data-act="bind">${BTN.bind}</button><button class="btn" data-act="new-lib">${BTN.newLib}</button>
      <button class="btn g" data-page="check" style="margin-left:auto">${BTN.check}</button></div>
      <div class="muted small" style="margin-top:14px">浏览器不能检查系统目录，请导入备份；真实目录将在桌面版接入</div></div></div>`;
    }

    const V = {
        today: vToday,
        projects: vProjects,
        project: vProject,
        calendar: vCalendar,
        templates: vTemplates,
        template: vTemplate,
        prompts: vPrompts,
        more: vMore,
        check: vCheck
    };
    let PWFOCUS = false;

    function render() {
        shell();
        const top = $('#body').scrollTop;
        $('#body').innerHTML = S.bad ? vBad() : (V[S.page] || vToday)();
        $('#body').scrollTop = top;
        enhance();
        arSweep();
        if (S.page === 'prompts' && PWFOCUS) {
            PWFOCUS = false;
            const i = $('#pw-kw');
            i && i.focus();
        }
    }

    /* ---------- 动作 ---------- */
    const A = {};

    A['day'] = el => {
        S.focusDay = el.dataset.k;
        S.calMode = 'week';
        S.month = D.monthOf(el.dataset.k);
        S.page = 'calendar';
        save();
        render();
    };
    A['cal-week'] = () => {
        S.calMode = 'week';
        S.page = 'calendar';
        render();
    };
    A['calmode'] = el => {
        S.calMode = el.dataset.k;
        render();
    };
    A['focus'] = el => {
        S.focusDay = el.dataset.k;
        render();
    };
    A['calday'] = el => {
        S.focusDay = el.dataset.k;
        S.month = D.monthOf(el.dataset.k);
        S.calMode = 'month';
        save();
        render();
    };
    A['chf'] = el => {
        S.chFilter = S.chFilter === el.dataset.k ? '' : el.dataset.k;
        render();
    };
    A['chan-add'] = el => {
        if (CHSEL[el.dataset.f].indexOf(el.dataset.k) < 0) CHSEL[el.dataset.f].push(el.dataset.k);
        chanRerender(el.dataset.f);
    };
    A['chan-rm'] = el => {
        CHSEL[el.dataset.f] = CHSEL[el.dataset.f].filter(x => x !== el.dataset.k);
        chanRerender(el.dataset.f);
    };
    A['chan-free'] = el => chanFree(el.dataset.f);
    A['chan-need'] = el => {
        const name = el.dataset.k, cur = (D.CHANNELS[name] || {}).need || '';
        modal({
            title: `${name} 要什么封面`, sub: '一条内容发几个渠道就要几版封面 —— 规格没定，物料那栏就不算它',
            body: `<div class="pills">${Object.keys(D.FORMATS).map(f => `<button class="pill ${f === cur ? 'on' : ''}" data-act="chan-need-ok" data-k="${esc(name)}" data-v="${esc(f)}">${f}<span class="c">${D.FORMATS[f]}</span></button>`).join('')}</div>`,
            actions: cancel
        });
    };
    A['chan-need-ok'] = el => {
        D.chanSetNeed(el.dataset.k, el.dataset.v);
        closeModal();
        render();
        toast(`${el.dataset.k} 的封面规格已保存在浏览器设置`, 'ok');
    };
    A['mpick'] = el => {
        const r = el.getBoundingClientRect();
        const [cy, cm] = S.month.split('-').map(Number);
        const ty = +D.TODAY.slice(0, 4), tm = +D.TODAY.slice(5, 7);
        const pop = document.createElement('div');
        pop.className = 'ctx mp';
        pop.id = 'menu-live';
        pop.style.left = r.left + 'px';
        pop.style.top = (r.bottom + 6) + 'px';
        document.body.appendChild(pop);
        let py = cy;
        const months = () => Array.from({length: 12}, (_, i) => `<button data-m="${i + 1}" class="${py === cy && i + 1 === cm ? 'on' : ''}">${i + 1} 月${py === ty && i + 1 === tm ? '<i class="nd" data-tip="本月"></i>' : ''}</button>`).join('');
        pop.innerHTML = `<div class="mp-h"><button data-y="-1" title="上一年">‹</button><b>${py}</b><button data-y="1" title="下一年">›</button></div>
      <div class="mp-g">${months()}</div>${cy === ty && cm === tm ? '' : `<div class="sep"></div><button data-today>回到 ${ty} 年 ${tm} 月</button>`}`;
        /* 翻年只换年份和月份格子：连点的那颗箭头要留在原地，
       不然它一被替换掉，全局「点了菜单外面就关菜单」就当它是外面给关了 */
        const flip = n => {
            py += n;
            pop.querySelector('.mp-h b').textContent = py;
            pop.querySelector('.mp-g').innerHTML = months();
        };
        pop.onclick = ev => {
            const yy = ev.target.closest('[data-y]');
            if (yy) return flip(+yy.dataset.y);
            if (ev.target.closest('[data-today]')) {
                S.month = D.monthOf(D.TODAY);
                S.focusDay = '';
                closeMenu();
                save();
                render();
                return;
            }
            const b = ev.target.closest('[data-m]');
            if (b) {
                S.month = `${py}-${p2(+b.dataset.m)}`;
                S.focusDay = '';
                closeMenu();
                save();
                render();
            }
        };
    };
    A['mon'] = el => {
        const [y, m] = S.month.split('-').map(Number);
        const d = new Date(y, m - 1 + (+el.dataset.k), 1);
        S.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        S.focusDay = '';
        save();
        render();
    };
    A['wk'] = el => {
        const k = +el.dataset.k;
        if (!k) {
            S.focusDay = '';
            return render();
        }
        const base = S.focusDay || D.TODAY;
        const d = new Date(base + 'T00:00:00');
        d.setDate(d.getDate() + k * 7);
        S.focusDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        S.month = D.monthOf(S.focusDay);
        render();
    };
    A['pf'] = el => {
        S.filter = el.dataset.k;
        save();
        render();
    };
    /* 模板的原图能换：点一张当封面，也能上传顶掉一张 / 加一张 / 删一张 */

    const shotAt = (t, i) => i < 0 ? t.img : t.shots[i];

    A['tpl-browse'] = el => {
        const t = D.tplOf(el.dataset.id);
        templateBrowse[t.id] = Math.max(0, Math.min(+el.dataset.i, W.templateSamples(t).length - 1));
        render();
    };
    A['tpl-cover'] = el => {
        const t = D.tplOf(el.dataset.id);
        t.img = t.shots[+el.dataset.i];
        render();
        toast('模板封面已保存在浏览器工作区', 'ok');
    };

    A['tpl-audience'] = el => {
        S.taudience = el.dataset.k;
        S.tscenario = '';
        render();
    };
    A['tpl-scenario'] = el => {
        S.tscenario = el.dataset.k;
        render();
    };
    A['cv-audience'] = el => {
        CV.audience = el.dataset.k;
        CV.scenario = '';
        cvPaint();
    };
    A['cv-scenario'] = el => {
        CV.scenario = el.dataset.k;
        cvPaint();
    };
    A['kw'] = el => {
        S.kw = el.value;
        render();
        const i = $('[data-act="kw"]');
        if (i) {
            i.focus();
            i.setSelectionRange(i.value.length, i.value.length);
        }
    };
    A['motion'] = () => {
        S.motion = !S.motion;
        apply();
        save();
        render();
    };
    A['sample'] = el => {
        D.SETTINGS.showSample = el.dataset.k === 'show';
        render();
        toast(D.SETTINGS.showSample ? '示例在显示' : '示例已隐藏，内容库里的东西不动');
    };
    A['set-host'] = el => W.setHost(el.value || el.dataset.k);

    A['cp'] = el => copy(el.dataset.k);

    A['lib-more'] = () => modal({
        title: '内容库',
        body: `<div class="line"><span class="k">${BTN.openFolder}</span><span class="v"><button class="btn s" data-act="open-folder">${ic('ext', 14)} 打开</button></span></div><div class="line"><span class="k">${BTN.bind}</span><span class="v"><button class="btn s" data-act="bind">换一个</button></span></div>`,
        actions: '<button class="btn" data-close>关闭</button>'
    });
    A['edit-account'] = () => modal({
        title: '编辑我的素材',
        body: `<div class="field"><label>账号名</label><input class="inp" value="${esc(D.ACCOUNT.name)}"></div><div class="field"><label>栏目角标</label><input class="inp" value="${esc(D.ACCOUNT.marks[0].v)}"></div><div class="field"><label>账号介绍</label><input class="inp" value="${esc(D.ACCOUNT.intro)}" placeholder="一句话，封面右下角用"></div>`,
        actions: cancel + `<button class="btn p" data-act="save-account">${BTN.save}</button>`
    });

    /* 原始资料：出封面时 AI 读的就是这个文件夹，所以留着，但只占顶栏一个小入口 */
    const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    A['files'] = el => {
        const p = D.byId(el.dataset.id);
        modal({
            title: '原始资料', sub: p.name,
            body: `<div class="lines">${p.files.length ? p.files.map(f => `<div class="line"><span class="k">${esc(f.name)}</span><span class="v small muted">${esc(f.size)}</span><span class="v"><button class="btn xs g" data-act="in-folder">${ic('ext', 14)}</button><button class="btn xs e" data-act="del-file" data-p="${esc(p.id)}" data-file="${esc(f.id)}">${BTN.del}</button></span></div>`).join('') : `<div class="empty"><b>还没放资料</b></div>`}</div>
        <div class="dropzone" data-act="pick-file" data-p="${esc(p.id)}">${ic('plus', 15)} 把资料拖进来，或者点这里选文件</div>
        <div class="line foot"><span class="k muted small">出封面时 AI 读 ${esc(p.folder)}/原始资料/</span><span class="v"><button class="btn s" data-act="intake" data-id="${esc(p.id)}">${ic('ext', 14)} ${BTN.intake}</button></span></div>`,
            actions: '<button class="btn" data-close>关闭</button>'
        });
    };

    A['copy-text'] = el => {
        const p = D.byId(el.dataset.p);
        copy((p.posts.find(y => y.id === el.dataset.id).text || ''));
    };

    A['zoom'] = el => {
        if (el.dataset.src) openView([{src: el.dataset.src, cap: el.dataset.cap || ''}], 0);
    };
    A['ie'] = el => {
        if (el.querySelector('input')) return;
        const inp = document.createElement('input');
        inp.className = 'iet' + (/mat|pw/.test(el.dataset.t) ? ' wide' : '');
        inp.value = el.dataset.v || '';
        inp.placeholder = el.dataset.ph || '写一句，回车保存';
        el.style.display = 'none';
        el.after(inp);
        inp.focus();
        inp.select();
        let off = false;
        const stop = ok => {
            if (off) return;
            off = true;
            inp.remove();
            el.style.display = '';
            if (ok) {
                try {
                    ieSave(el, inp.value);
                } catch (e) {
                    render();
                    fail(e);
                }
            }
        };
        inp.onkeydown = ev => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                stop(true);
            }
            if (ev.key === 'Escape') stop(false);
        };
        inp.onblur = () => stop(true);
    };

    /* ---------- 记一条发布：只在日历上有入口，写了就算发过 ---------- */
    function pubModal(p, x, day) {
        const cur = x && x.pub ? x.pub : null;
        const chanOpts = () => D.chanList().map(c => `<option value="${esc(c)}" ${c === (x ? x.channel : ((p && p.channels[0]) || '')) ? 'selected' : ''}>${esc(c)}</option>`).join('');
        modal({
            title: cur ? BTN.pubEdit : BTN.pub, sub: p ? p.name : '没排期也能记，记了日历上就有这条',
            body: `${x ? '' : `<div class="field"><label>哪条内容</label><select class="inp" id="pb-p">${D.PROJECTS.filter(q => q.kind === '内容').map(q => `<option value="${esc(q.id)}">${esc(q.name)}</option>`).join('')}</select></div>`}
        <div class="field"><label>哪个渠道</label><select class="inp" id="pb-c">${x ? `<option>${esc(x.channel)}</option>` : chanOpts()}</select></div>
        <div class="field"><label>哪天发的</label><input class="inp" id="pb-d" value="${cur ? esc(cur.at) : esc(day || D.TODAY)}" placeholder="2026-10-16" style="width:150px"></div>
        <div class="field"><label>链接（可空）</label><input class="inp" id="pb-l" value="${cur && cur.link ? esc(cur.link) : ''}" placeholder="贴上去，回头自己找得到"></div>
        <div class="muted small">记下这条就算发过了；平台那几个数一期还不接。</div>`,
            actions: cancel + `<button class="btn p" data-act="pub-ok" data-p="${p ? p.id : ''}" data-id="${x ? x.id : ''}">${cur ? BTN.pubEdit : '记下'}</button>`
        });
    }

    A['pub-add'] = el => {
        const p = D.byId(el.dataset.p);
        pubModal(p, p.posts.find(y => y.id === el.dataset.id), el.dataset.day);
    };
    A['pub-edit'] = el => {
        const p = D.byId(el.dataset.p);
        pubModal(p, p.posts.find(y => y.id === el.dataset.id), '');
    };
    A['pub-free'] = el => pubModal(null, null, el.dataset.day);
    A['pub-ok'] = el => {
        const at = normDate((($('#pb-d') || {}).value || ''));
        if (!at || at === null) return toast('日期写成 2026-10-16 这样', 'no');
        const link = (($('#pb-l') || {}).value || '').trim();
        if (W.url(link) === null) throw Error('发布链接仅支持 HTTP(S)，不能包含账号或密码');
        const ch = (($('#pb-c') || {}).value || '').trim();
        if (!ch) return toast('选个渠道', 'no');
        let p = el.dataset.p ? D.byId(el.dataset.p) : null;
        let x = p && el.dataset.id ? p.posts.find(y => y.id === el.dataset.id) : null;
        if (!x) {
            p = D.byId(($('#pb-p') || {}).value);
            if (!p) return toast('选一条内容', 'no');
            const cm = D.coverOf(p);
            x = {
                id: 'pu' + Date.now().toString(36),
                date: at,
                time: '',
                channel: ch,
                mat: cm ? cm.id : '',
                text: p.name
            };
            p.posts.push(x);
        }
        x.channel = ch;
        W.publish(p, x, at, link);
        closeModal();
        render();
        toast(`${D.cnShort(at)} 发在 ${ch}${link ? ' · 链接记上了' : ''}，已保存在浏览器工作区`, 'ok');
    };
    A['pub-del'] = el => {
        const p = D.byId(el.dataset.p), x = p.posts.find(y => y.id === el.dataset.id);
        x.pub = null;
        render();
        toast('撤了这条发布记录，这条回到「没发」');
    };
    /* 渠道是全局一处：规格在这儿改，自定义的在这儿删 */
    A['chan-manage'] = () => {
        modal({
            title: '渠道', sub: '全局登记表 · 内容那里只是用它',
            body: `<div class="lines">${D.chanList().map(c => {
                const k = D.chanOf(c);
                return `<div class="line"><span class="k"><span class="tag ch" style="color:${k.ink};background:${k.bg}">${esc(c)}</span></span>
          <span class="v small muted">${k.need ? `封面 ${k.need} · ${D.FORMATS[k.need] || '自定比例'}` : '没定封面规格'}</span>
          <span class="v"><button class="btn xs" data-act="chan-need" data-k="${esc(c)}">定规格</button></span>
          ${k.builtin ? '' : `<span class="v"><button class="btn xs e" data-act="chan-del" data-k="${esc(c)}">${BTN.del}</button></span>`}</div>`;
            }).join('')}</div>
        <div class="line foot"><span class="k muted small">要建新渠道？在「改这一条」里直接填名字</span></div>`,
            actions: '<button class="btn" data-close>关闭</button>'
        });
    };
    A['chan-del'] = el => {
        D.chanDel(el.dataset.k);
        closeModal();
        render();
        toast(`${el.dataset.k} 从登记表里去掉了`, 'ok');
    };

    A['det-more'] = el => {
        const p = D.byId(el.dataset.id), r = el.getBoundingClientRect();
        menu([{label: BTN.inFolder, icon: 'folder', run: () => A['open-folder']()}, {
            label: BTN.rename,
            icon: 'edit',
            run: () => A['rename']({dataset: {kind: 'project', id: p.id}})
        }, '-', {
            label: `${BTN.del}内容`,
            icon: 'trash',
            danger: true,
            run: () => A['del-project'](el)
        }], r.left - 100, r.bottom + 4);
    };
    A['mat-more'] = el => {
        const r = el.getBoundingClientRect();
        menu(matItems(D.byId(el.dataset.p), D.matOf(D.byId(el.dataset.p), el.dataset.id)), r.left - 120, r.bottom + 4);
    };
    A['tpl-more'] = el => {
        const r = el.getBoundingClientRect();
        const t = D.tplOf(el.dataset.id), n = W.templateSamples(t).length;
        menu([...(n ? [{
            label: `下载 ${n} 张样张 ZIP`,
            icon: 'down',
            run: () => A['dl']({dataset: {tid: t.id, n}})
        }] : []), {
            label: BTN.rename,
            icon: 'edit',
            run: () => A['rename']({dataset: {kind: 'template', id: t.id}})
        }], r.left - 120, r.bottom + 4);
    };
    /* ---------- 出封面：一句标题 + 尺寸 + 模板，一个弹窗配完直接开跑 ----------
     一批 = 一个尺寸：勾几版就建几个任务、几条进度，一条总进度条会骗人。
     弹窗自己局部重绘，不走全局 render()；改输入的那几处只换需要变的节点，否则打字丢焦点。 */
    let CV = null;
    const COVER_COUNTS = [4, 6, 8, 10];
    const coverStyleRefs = (t, p) => W.styleReferences(t, p);

    function cvAll() {
        const used = CV.p.materials.map(m => m.format).filter(D.isCustomFmt);
        return [...new Set(D.sizeList().concat(used))];
    }

    function openCoverSetup(p) {
        const t = W.isTemplateUsable(D.tplOf(p.tpl)) ? D.tplOf(p.tpl) : null, styles = coverStyleRefs(t, p);
        CV = {
            p,
            title: p.name,
            brief: '',
            sizes: D.needFormats(p),
            count: 4,
            countCustom: false,
            ref: [W.defaultPhoto()?.id, ...styles.map(a => a.id)].filter(Boolean),
            personNone: false,
            own: '',
            audience: '',
            scenario: '',
            kw: '',
            tpl: W.isTemplateUsable(D.tplOf(p.tpl)) ? p.tpl : '',
            pixels: '',
            adding: false,
            aw: 4,
            ah: 5,
            mm: null
        };
        modal({
            wide: true, title: '出封面', sub: p.name, body: '<div class="cv"></div>', actions: '', after(mm) {
                CV.mm = mm;
                cvPaint();
            }
        });
    }

    function cvFootInto() {
        if (CV && CV.mm) CV.mm.querySelector('.modal-f').innerHTML = cvFoot();
    }

    function cvPaint() {
        if (!CV || !CV.mm) return;
        const act = document.activeElement, id = act && act.id;
        const pos = id && typeof act.selectionStart === 'number' ? act.selectionStart : null;
        CV.mm.querySelector('.modal-b').innerHTML = cvBody();
        cvFootInto();
        if (id) {
            const el = document.getElementById(id);
            if (el) {
                el.focus();
                if (pos != null) {
                    try {
                        el.setSelectionRange(pos, pos);
                    } catch (e) {
                    }
                }
            }
        }
    }

    function cvBody() {
        return `<div class="cv">
      <div class="cv-top">
        <div class="cv-sec">
          <div class="cv-h"><b>这一批的标题</b><em>必填，出图就按这句排字</em></div>
          <input class="inp" id="cv-title" placeholder="一句话，2 到 12 个字最好排" maxlength="200" value="${esc(CV.title)}" data-act="cv-title">
          <label class="cv-brief">这条内容讲什么（可不填）<textarea class="inp" id="cv-brief" data-act="cv-brief" maxlength="1500" rows="3" placeholder="可粘贴简短正文、核心观点或要展示的事实，最多 1500 字">${esc(CV.brief)}</textarea></label><p class="small muted">只将本次填写的内容交给助手；未提供的事实不凭空补充。</p>
        </div>
        <div class="cv-sec">${cvCountHtml()}</div>
      </div>
      ${photosHtml(true)}${cvSizesHtml()}<div class="cv-sec"><label>目标像素（可空，填写如 1200x1600）<input class="inp" id="cv-pixels" data-act="cv-pixels" value="${esc(CV.pixels || '')}" placeholder="不填由宿主按比例生成，验收记录实际像素"></label></div>${cvTplHtml()}${cvRefHtml()}${cvRulesHtml()}
    </div>`;
    }

    function cvSizeCard(f) {
        const on = CV.sizes.indexOf(f) >= 0, r = D.ratioOf(f), chs = D.fmtChannels(f), sp = D.SIZE_PX[f] || {};
        const who = D.isPresetFmt(f) ? (chs.length ? chs.join('、') : '没有渠道默认要这版') : '自己加的比例';
        const pxLine = sp.px ? `建议 ${sp.px}` : (D.isPresetFmt(f) ? '像素待核' : '不设像素');
        const tip = (sp.px ? `${r} · 建议 ${sp.px}${sp.min ? `，低于 ${sp.min} 提交不了` : ''} · 要这版：${who}\n来源 ${sp.src}（${sp.at}核对）`
            : `${r} · ${pxLine} · 要这版：${who}\n${sp.note || '自己填的比例，没有平台默认像素'}`) + (sp.px && sp.note ? `\n${sp.note}` : '');
        return `<button class="sz${on ? ' on' : ''}" data-act="cv-size" data-k="${esc(f)}" data-tip="${esc(tip)}">
      <span class="box" style="aspect-ratio:${ratioCss(r)}"></span>
      <span class="tx"><span class="t1">${esc(f)}<em>${esc(r)}</em></span><span class="t2">${esc(pxLine)} · ${esc(who)}</span></span>
      ${D.isPresetFmt(f) ? '' : `<span class="rm" data-act="cv-rm" data-k="${esc(f)}" data-tip="从浏览器设置去掉">✕</span>`}
      <span class="ck">${ic('check', 14)}</span></button>`;
    }

    function cvSizesHtml() {
        const all = cvAll(), quick = D.COMMON_RATIOS.filter(r => all.indexOf(r) < 0);
        return `<div class="cv-sec">
      <div class="cv-h"><b>要出哪几版</b><em>默认按这条内容要发的渠道给 · 一版一个批次</em></div>
      <div class="cv-sizes">${all.map(cvSizeCard).join('')}</div>
      ${quick.length ? `<div class="cv-ratios"><span class="muted small">常用比例</span>${quick.map(r => `<button class="pill sm" data-act="cv-quick" data-k="${r}" data-tip="按 ${r} 再加一版">${r}</button>`).join('')}
        <button class="pill sm add${CV.adding ? ' on' : ''}" data-act="cv-add">${ic('plus', 13)} ${BTN.coverCustom}</button></div>`
            : `<div class="cv-ratios"><button class="pill sm add${CV.adding ? ' on' : ''}" data-act="cv-add">${ic('plus', 13)} ${BTN.coverCustom}</button></div>`}
      ${CV.adding ? cvCustForm() : ''}
    </div>`;
    }

    function cvRefHtml() {
        const t = D.tplOf(CV.tpl), choices = W.referenceChoices(t, CV.p).filter(a => a.kind !== 'account'),
            group = coverStyleRefs(t, CV.p), selected = group.filter(a => CV.ref.includes(a.id)).length;
        return `<div class="cv-sec"><div class="cv-h"><b>风格与构图参考</b><em>本组使用 ${selected} / ${group.length} 张样张 · 生成数量在上方独立设置</em></div><p class="small muted">${t ? esc(t.name) + '：默认参考整组真实样张。' : '先选择一套模板。'}共同配色、字体和层级保持一致，从组内不同构图产生候选；样张数量与成品数量分别设置。样图不作为人物身份来源。</p>${selected < group.length ? '<p class="warnx">已取消部分组内样张，仅使用选中的参考。</p>' : ''}${CV.ref.length ? '<button class="btn s" data-act="reference-export" data-scope="cover">导出本次全部参考图 ZIP</button>' : ''}<details><summary>更多参考 · 查看、取消或补充（共选 ${CV.ref.length} / 32 张）</summary><p class="small muted">整组风格图和本人照片都须另行导出并附给助手。SVG 是结构示意，不计入组内样张。</p><div class="cv-refs">${choices.map(a => `<button class="refpick${CV.ref.includes(a.id) ? ' on' : ''}" data-act="cv-ref" data-k="${esc(a.id)}" aria-pressed="${CV.ref.includes(a.id)}" data-tip="${esc(a.note)}"><span class="ph">${pic(a.img)}</span><span class="pn">${esc(a.note)}</span><span class="ck">${ic('check', 14)}</span></button>`).join('') || '<p class="muted small">先选模板，或给当前内容选定候选图。</p>'}</div></details></div>`;
    }

    function photosHtml(forCover = false) {
        const photos = D.ACCOUNT.photos.filter(W.isOwnPhoto), deleted = W.trash.filter(x => x.kind === 'photo'),
            selected = forCover ? photos.find(p => CV.ref.includes(p.id)) : null;
        return `<section class="${forCover ? 'cv-sec' : 'card pad'} my-photos"><div class="cv-h"><b>我的照片${forCover ? ' · 本次人物' : ''}</b><em>${photos.length} 张 · ${W.defaultPhoto() ? '已有默认照片' : '还没有本人照片'}</em></div><p class="small muted">上传自己的正脸或半身照，默认用于封面。仅在本机保存并自动优化。</p><button class="photo-drop" data-photo-drop data-act="photo-upload">${ic('plus', 18)} 点击上传我的照片，或拖拽图片到这里<span>首张自动设为默认，以后上传保留原默认，可随时切换</span></button>${forCover ? `<div class="ops wrap-actions"><button class="pill${!selected ? ' on' : ''}" data-act="cv-person" data-k="" aria-pressed="${!selected}">这次不放人物</button>${selected ? '<button class="btn s" data-act="photo-export" data-scope="cover">导出本次本人照片参考版</button>' : ''}</div><p class="small muted">${selected ? '将保留本人五官、脸型和发型，替换样图人物。默认照片会预选；可单独换成本次人物。' : '本次将使用文字、图形或主题物件，不使用示例人脸。'} 图片不会随助手链接传输，请主动导出后附给助手。</p>` : ''}<div class="photo-gallery">${photos.map(p => `<article class="photo-card${selected?.id === p.id ? ' selected' : ''}"><button class="photo-preview" data-act="zoom" data-src="${esc(p.img)}" data-cap="我的照片" aria-label="预览${esc(p.name)}">${pic(p.img)}</button><div class="photo-name" title="${esc(p.name)}">${esc(p.name)}</div><div class="ops wrap-actions">${p.use ? '<span class="tag ok">默认照片</span>' : `<button class="btn xs" data-act="photo-default" data-id="${esc(p.id)}">设为默认</button>`}${forCover ? `<button class="btn xs${selected?.id === p.id ? ' p' : ''}" data-act="cv-person" data-k="${esc(p.id)}" aria-pressed="${selected?.id === p.id}">${selected?.id === p.id ? '本次人物' : '本次用它'}</button>` : ''}<button class="btn xs" data-act="photo-delete" data-id="${esc(p.id)}" aria-label="删除${esc(p.name)}">删除</button></div></article>`).join('') || '<p class="small muted">还没有上传自己的照片；模板样图中的人物不会当作你。</p>'}</div>${deleted.length ? `<details class="photo-trash"><summary>已删除照片 ${deleted.length} 张 · 可恢复</summary>${deleted.map(x => `<div class="line"><span class="k">${esc(x.value.name)}</span><button class="btn xs" data-act="photo-restore" data-id="${esc(x.id)}">恢复</button></div>`).join('')}</details>` : ''}<details class="photo-save-help"><summary>照片保存说明</summary><p class="small muted">支持 PNG / JPEG / WebP / GIF。原图不超过 20 MiB、4000 万像素；在本机缩放压缩至最长边 1600 像素、每张不超过 1 MiB，不磨皮、不改脸。工作区共 4 MiB，会按剩余容量优化；空间不足时整批回退。</p><p class="small muted">导出的是本地保存的封面参考版本，不是未压缩原片。删除会移入本地回收区，仍占容量；完整备份可在“更多”导出。历史任务保留原照片 ID，不随默认照片变化。</p></details></section>`;
    }

    function cvCustForm() {
        const ok = CV.aw > 0 && CV.ah > 0;
        return `<div class="cv-cust">
      <label>宽</label><input class="inp n" id="cv-aw" type="number" min="1" max="99" step="0.1" value="${CV.aw}" data-act="cv-wh">
      <label>高</label><input class="inp n" id="cv-ah" type="number" min="1" max="99" step="0.1" value="${CV.ah}" data-act="cv-wh">
      <span class="pv" style="aspect-ratio:${ok ? CV.aw + '/' + CV.ah : '4/5'}"></span>
      <span class="pv-t muted small">${ok ? CV.aw + ':' + CV.ah : '填宽和高'}</span>
      <button class="btn s p" data-act="cv-add-ok" ${ok ? '' : 'disabled'}>${BTN.coverAdd}</button>
      <button class="btn s" data-act="cv-add-no">${BTN.coverFold}</button>
      <span class="muted small">已保存在浏览器设置，以后每条内容都能选</span>
    </div>`;
    }

    function cvCountHtml() {
        return `<div class="cv-h"><b>每版出几张</b><em>同一版里挑一张</em></div>
      <div class="pills">${COVER_COUNTS.map(n => `<button class="pill${!CV.countCustom && CV.count === n ? ' on' : ''}" data-act="cv-n" data-k="${n}">${n} 张</button>`).join('')}
        <button class="pill${CV.countCustom ? ' on' : ''}" data-act="cv-nc">自定义</button></div>
      ${CV.countCustom ? `<div class="cv-num"><input class="inp n" id="cv-cnt" type="number" min="1" max="20" step="1" value="${CV.count}" data-act="cv-cnt"><span class="muted small">1 到 20 张</span></div>` : ''}`;
    }

    function cvTplHtml() {
        return `<div class="cv-sec">
      <div class="cv-h"><b>用哪套风格</b><em>出哪几版在上面选；按比例重排，并逐比例验收</em></div>
      <div class="cv-tbar">
        <div class="search">${ic('search', 16)}<input class="inp" id="cv-kw" placeholder="搜模板名称、风格、适合的内容" value="${esc(CV.kw)}" data-act="cv-kw" autocomplete="off" spellcheck="false"></div>
        <div class="pills">${[['', '全部'], ['mine', '我的'], ['bi', '内置']].map(x => `<button class="pill sm${CV.own === x[0] ? ' on' : ''}" data-act="cv-own" data-k="${x[0]}">${x[1]}</button>`).join('')}</div>
      </div>
      ${templateFilters(CV.audience, CV.scenario, 'cv')}<div class="cv-tpls">${cvTpls()}</div>
    </div>`;
    }

    function cvTpls() {
        const kw = CV.kw.trim();
        let l = D.TEMPLATES.filter(t => !t.sample && (CV.own === 'mine' ? !W.isBuiltinTemplate(t) : CV.own === 'bi' ? W.isBuiltinTemplate(t) : true));
        l = templateFilter(l, CV.audience, CV.scenario, kw);
        if (!l.length) return `<div class="cv-none"><b>${kw ? '没有叫这个的风格' : '这一类还没有模板'}</b><span class="muted small">上传几张喜欢的封面，交给 AI 拆一套</span><button class="btn s" data-act="cv-new">${BTN.newTemplate}</button></div>`;
        return l.map(t => {
            const on = t.id === CV.tpl, gap = !W.isTemplateUsable(t);
            return `<button class="tpick${on ? ' on' : ''}${gap ? ' gap' : ''}" data-act="cv-tpl" data-k="${esc(t.id)}" data-tip="${gap ? '这套还没有原图，也还没拆解 · 先去模板页补原图' : esc(t.style) + '&#10;' + esc(t.desc) + '&#10;出图按你上面选的每一版重排，不锁比例'}">
        <span class="ph${gap ? ' noimg' : ''}" style="aspect-ratio:${gap ? '3/4' : ratioCss(t.ratio)}"${gap ? '' : ' data-ar="auto"'}>${gap ? ic('img', 20) + '<em>缺原图</em>' : `<img src="${esc(t.img)}" alt="" loading="lazy">`}</span>
        ${sampleStrip(t)}<span class="pn">${esc(t.name)}</span><span class="pr">${audienceLabel(t)}${t.scenario ? ' · ' + esc(t.scenario) : ''}</span><span class="pr">${esc(t.contentType || t.fit)}</span>
        <span class="pr">${gap ? esc(t.state) + ' · 先完成还原验收' : on ? `用这套 · 出 ${CV.sizes.length || '几'} 版` : esc(t.style || '只看风格')}</span></button>`;
        }).join('');
    }

    function cvFoot() {
        const n = CV.sizes.length * CV.count;
        const bad = !CV.title.trim() ? '先写一句标题' : !CV.sizes.length ? '至少选一版' : !CV.tpl ? '挑一套模板' : CV.ref.length > 32 ? '参考超过 32 张，请取消部分参考' : '';
        return `<span class="cv-sum">${bad ? `<span class="warnx">${bad}</span>`
            : `出 <b>${CV.sizes.length}</b> 版 × <b>${CV.count}</b> 张 = <b>${n}</b> 张<span class="muted small"> · 建 ${CV.sizes.length} 个任务，各一条进度${CV.ref.length ? ` · 带 ${CV.ref.length} 张参考` : ''}</span>`}</span>
      <span class="sp"></span>${cancel}<button class="btn p" data-act="cv-go" ${bad ? 'disabled' : ''}>${BTN.coverGo}</button>`;
    }

    function startCover(p, t, sizes, count, title, ref) {
        if (!W.isTemplateUsable(t)) throw Error('请先验收模板规则和还原图');
        const pixels = CV?.p?.id === p.id ? CV.pixels || '' : '', created = [];
        W.transact(() => {
            p.tpl = t.id;
            p.name = title;
            sizes.forEach(f => {
                let m = D.matOfFormat(p, f);
                if (!m) {
                    m = D.newMat(f, t.id);
                    p.materials.push(m);
                }
                const choices = W.referenceChoices(t, p);
                const references = (ref || []).map(k => {
                    const a = choices.find(x => x.id === k);
                    if (!a) throw Error('参考已失效，请重新选择当前模板或本内容素材');
                    return {id: a.id, version: a.version, note: a.note};
                });
                const req = W.request('generate', p, {
                    templateId: t.id,
                    title,
                    brief: CV?.p?.id === p.id ? CV.brief : '',
                    format: f,
                    ratio: D.ratioOf(f),
                    pixels: pixels || null,
                    count,
                    references
                });
                const b = {
                    no: m.batches.length + 1,
                    at: D.TODAY,
                    tpl: t.id,
                    title,
                    cands: [],
                    state: 'handoff',
                    requestId: req.requestId,
                    ref: []
                };
                m.batches.push(b);
                created.push(W.addTask(req, {mid: m.id, name: `出封面 · ${f}`}));
            });
        });
        render();
        if (created.length === 1) launchTask(created[0]); else showTaskChoices(created, [], '本批封面任务 · 选择一个尺寸');
        toast('请求已保存；各尺寸任务可分别继续');
    }

    A['cv-title'] = el => {
        CV.title = el.value;
        cvFootInto();
    };
    A['cv-brief'] = el => {
        CV.brief = el.value;
    };
    A['cv-size'] = el => {
        const f = el.dataset.k, i = CV.sizes.indexOf(f);
        if (i >= 0) CV.sizes.splice(i, 1); else CV.sizes.push(f);
        cvPaint();
    };
    A['cv-rm'] = el => {
        const f = el.dataset.k;
        D.sizeDel(f);
        const i = CV.sizes.indexOf(f);
        if (i >= 0) CV.sizes.splice(i, 1);
        cvPaint();
        toast(`${f} 已从浏览器设置去掉`, 'ok');
    };
    A['cv-quick'] = el => {
        D.sizeAdd(el.dataset.k);
        if (CV.sizes.indexOf(el.dataset.k) < 0) CV.sizes.push(el.dataset.k);
        cvPaint();
    };
    A['cv-add'] = () => {
        CV.adding = !CV.adding;
        cvPaint();
    };
    A['cv-add-no'] = () => {
        CV.adding = false;
        cvPaint();
    };
    A['cv-wh'] = () => {
        const mm = CV.mm;
        CV.aw = +mm.querySelector('#cv-aw').value || 0;
        CV.ah = +mm.querySelector('#cv-ah').value || 0;
        const ok = CV.aw > 0 && CV.ah > 0;
        mm.querySelector('.cv-cust .pv').style.aspectRatio = ok ? CV.aw + '/' + CV.ah : '4/5';
        mm.querySelector('.cv-cust .pv-t').textContent = ok ? CV.aw + ':' + CV.ah : '填宽和高';
        mm.querySelector('.cv-cust [data-act="cv-add-ok"]').disabled = !ok;
    };
    A['cv-add-ok'] = () => {
        if (!(CV.aw > 0 && CV.ah > 0)) return toast('宽和高都填个数', 'no');
        const r = W.ratio(CV.aw + ':' + CV.ah);
        if (!r) throw Error('比例必须为大于 0、不超过 20000 的有效数值');
        const preset = D.presetOfRatio(r), f = preset || r;
        if (cvAll().indexOf(f) < 0) D.sizeAdd(f);
        if (CV.sizes.indexOf(f) < 0) CV.sizes.push(f);
        CV.adding = false;
        cvPaint();
        toast(preset ? `${r} 就是「${preset}」，直接选它了` : `${f} 已保存在浏览器设置`, 'ok');
    };
    A['cv-n'] = el => {
        CV.count = +el.dataset.k;
        CV.countCustom = false;
        cvPaint();
    };
    A['cv-nc'] = () => {
        CV.countCustom = !CV.countCustom;
        cvPaint();
    };
    A['cv-cnt'] = el => {
        CV.count = Math.max(1, Math.min(20, Math.round(+el.value || 1)));
        cvFootInto();
    };
    A['cv-kw'] = el => {
        CV.kw = el.value;
        CV.mm.querySelector('.cv-tpls').innerHTML = cvTpls();
    };
    A['cv-own'] = el => {
        CV.own = el.dataset.k;
        cvPaint();
    };
    A['cv-tpl'] = el => {
        const t = D.tplOf(el.dataset.k);
        if (!W.isTemplateUsable(t)) return toast('请先验收这套模板的规则和还原图', 'no');
        if (CV.tpl !== el.dataset.k) {
            CV.ref = CV.ref.filter(id => W.referenceChoices(t, CV.p).some(a => a.id === id && ['account', 'candidate'].includes(a.kind)));
            CV.ref.push(...coverStyleRefs(t, CV.p).map(a => a.id));
        }
        CV.tpl = el.dataset.k;
        cvPaint();
    };
    A['cv-new'] = () => {
        closeModal();
        A['new-template']();
    };
    A['cv-ref'] = el => {
        const k = el.dataset.k;
        if (!W.referenceChoices(D.tplOf(CV.tpl), CV.p).some(a => a.id === k)) throw Error('参考不属于当前模板或内容');
        const i = CV.ref.indexOf(k);
        if (i >= 0) CV.ref.splice(i, 1); else {
            if (CV.ref.length >= 32) throw Error('本次参考最多 32 张，请先取消部分参考');
            CV.ref.push(k);
        }
        cvPaint();
    };
    A['cv-person'] = el => {
        const id = el.dataset.k;
        if (id && !D.ACCOUNT.photos.some(p => p.id === id && W.isOwnPhoto(p))) throw Error('找不到本人照片');
        const next = CV.ref.filter(k => !W.photoById(k));
        if (id) next.push(id);
        if (next.length > 32) throw Error('本次参考最多 32 张，请先取消部分参考');
        CV.ref = next;
        CV.personNone = !id;
        cvPaint();
    };
    A['cv-go'] = () => {
        if (CV.pixels && !Array.isArray(CV.pixels)) {
            const m = /^(\d{2,5})[x×](\d{2,5})$/.exec(CV.pixels);
            if (!m || +m[1] > 20000 || +m[2] > 20000) throw Error('像素请写成 1200x1600，最长边不超过 20000');
            CV.pixels = [+m[1], +m[2]];
        }
        const p = CV.p, t = D.tplOf(CV.tpl), title = CV.title.trim();
        if (!title) return toast('先写一句标题', 'no');
        if (!CV.sizes.length) return toast('至少选一版', 'no');
        if (!t) return toast('挑一套模板', 'no');
        const sizes = CV.sizes.slice(), count = CV.count, ref = CV.ref.slice();
        startCover(p, t, sizes, count, title, ref);
        CV = null;
    };
    A['make-cover'] = el => openCoverSetup(D.byId(el.dataset.id));
    A['use-cand'] = el => {
        const p = D.byId(el.dataset.p), m = D.matOf(p, el.dataset.m);
        m.batches.forEach(b => b.cands.forEach(c => c.use = false));
        const c = D.candsOf(m).find(x => x.no === el.dataset.no);
        if (c) {
            c.use = true;
            m.madeAt = D.TODAY;
        }
        m.status = 'ok';
        m.note = '';
        S.sel = {};
        closeModal();
        render();
        toast(`${m.format} 定了 ${esc(c.no)} 号 · 下一批出封面带它当参考`, 'ok');
    };

    /* 比着挑：勾几张就并排看几张，点一张定下来（旧工作台的「对比后选定」） */
    function cmpModal(p) {
        const items = Object.keys(S.sel).map(k => {
            const i = k.indexOf(':'), m = D.matOf(p, k.slice(0, i)),
                c = m && D.candsOf(m).find(x => x.no === k.slice(i + 1));
            return m && c ? {m, c} : null;
        }).filter(Boolean);
        if (new Set(items.map(x => W.ratio(x.m.ratio))).size > 1) throw Error('只支持相同比例的候选对比，请取消其他比例勾选');
        if (items.length < 2) return toast('先勾两张以上', 'no');
        modal({
            wide: true, title: BTN.cmp, sub: `勾了 ${items.length} 张 · 点一张就定下来`,
            body: `<div class="cmpgrid">${items.map(x => `<div class="cand${x.c.use ? ' pick' : ''}">
        <div class="f" data-cap="${esc(x.m.format)} ${esc(x.c.no)} 号">${x.c.use ? `<span class="st"><span class="tag ok">使用中</span></span>` : ''}${pic(x.c.img)}</div>
        <div class="cap"><button class="btn xs ${x.c.use ? 'p' : ''}" data-act="use-cand" data-p="${esc(p.id)}" data-m="${esc(x.m.id)}" data-no="${esc(x.c.no)}">${x.c.use ? '使用中' : BTN.pickOne}</button>
          <span class="muted small">${esc(x.m.format)} · ${esc(x.c.no)} 号</span></div>
        ${x.c.from ? `<div class="from">${esc(x.c.from)}</div>` : ''}</div>`).join('')}</div>`,
            actions: cancel
        });
    }

    A['cmp'] = () => cmpModal(D.byId(S.pid));
    A['cmp-clear'] = () => {
        S.sel = {};
        render();
        toast('取消勾选');
    };
    A['cand-sel'] = el => {
        const k = el.dataset.m + ':' + el.dataset.no;
        if (S.sel[k]) delete S.sel[k]; else S.sel[k] = 1;
        render();
    };
    A['cand-fav'] = el => {
        const m = D.matOf(D.byId(el.dataset.p), el.dataset.m), c = D.candsOf(m).find(x => x.no === el.dataset.no);
        c.fav = !c.fav;
        render();
        toast(c.fav ? `收了 ${m.format} ${esc(c.no)} 号，留着以后当参考` : '取消收藏');
    };
    A['old-batch'] = el => {
        S.old[el.dataset.m] = !S.old[el.dataset.m];
        render();
    };
    A['use-batch'] = el => {
        const m = D.matOf(D.byId(el.dataset.p), el.dataset.m), b = m.batches.find(x => x.no === +el.dataset.no);
        m.batches.forEach(x => x.cands.forEach(c => c.use = false));
        if (b.cands[0]) b.cands[0].use = true;
        closeModal();
        render();
        toast(`改用第 ${esc(b.no)} 批，原来那版进了旧版本`, 'ok');
    };
    A['versions'] = el => {
        const p = D.byId(el.dataset.p), m = D.matOf(p, el.dataset.id);
        modal({
            title: `「${m.name}」的版本`,
            sub: '一批是一版，正在用的、发出去过的不能删',
            body: `<div class="lines">${m.batches.slice().reverse().map(b => {
                const u = b.cands.find(c => c.use);
                return `<div class="line"><span class="k">${TAG.batch(b.no)}</span><span class="v"><span class="small muted">${esc(D.cnShort(b.at))} · ${b.cands.length} 张${b.sourceRequestId ? ' · 历史导入（已被重试替换）' : ''}</span>${u ? '<span class="tag ok">使用中</span>' : `<button class="btn xs p" data-act="use-batch" data-p="${esc(p.id)}" data-m="${esc(m.id)}" data-no="${esc(b.no)}">${BTN.setUse}</button>`}</span></div>`;
            }).join('')}</div>`,
            actions: '<button class="btn" data-close>关闭</button>'
        });
    };

    /* 一条内容就三样：标题 · 渠道 · 模板。渠道是全局登记表的引用，这里加的就是登记表里的 */
    A['edit-proj'] = el => {
        const p = D.byId(el.dataset.id);
        modal({
            title: BTN.editProject, sub: p.folder,
            body: `<div class="field"><label>标题 <em class="req">*</em></label><input class="inp" id="ep-t" value="${esc(p.name)}" placeholder="比如：对标拆解她为什么三个月涨 10 万粉"></div>
        <div class="field"><label>发到哪几个渠道</label>${chanField('ep-ch', p.channels)}</div>
        <div class="two-col"><div class="field"><label>用哪套风格</label><select class="inp" id="ep-tpl"><option value="">还没定</option>${D.TEMPLATES.map(t => `<option value="${esc(t.id)}" ${t.id === p.tpl ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label>录制日</label><input class="inp" id="ep-d" value="${esc(p.dates.record || '')}" placeholder="2026-10-12"></div></div>
        <div class="muted small">改标题不动已经出好的封面，下一批按新标题排字 · 已保存在浏览器工作区</div>`,
            actions: cancel + `<button class="btn p" data-act="edit-proj-ok" data-id="${esc(p.id)}">${BTN.save}</button>`
        });
    };
    A['edit-proj-ok'] = el => {
        const p = D.byId(el.dataset.id), t = (($('#ep-t') || {}).value || '').trim();
        if (!t) return toast('标题要写一个', 'no');
        const chs = (CHSEL['ep-ch'] || []).slice();
        chs.forEach(c => D.chanAdd(c));
        const d = normDate((($('#ep-d') || {}).value || ''));
        if (d === null) return toast('日期写成 2026-10-12 这样', 'no');
        p.name = t;
        p.channels = chs;
        p.tpl = ($('#ep-tpl') || {}).value || '';
        p.dates.record = d;
        closeModal();
        render();
        toast('已保存在浏览器工作区', 'ok');
    };
    A['new-project'] = () => {
        CHSEL['np-ch'] = ['抖音'];
        modal({
            title: BTN.newProject,
            body: `<div class="field"><label>标题 <em class="req">*</em></label><input class="inp" id="np" placeholder="一行标题"></div><div class="field"><label>发到哪几个渠道</label>${chanField('np-ch', ['抖音'])}</div><div class="muted small">浏览器内建一条内容；项目.json / 原始资料仅为未来桌面版文件约定</div>`,
            actions: cancel + `<button class="btn p" data-act="new-project-ok">${BTN.newProject}</button>`
        });
    };

    /* 新建模板 = 给几张原图 + 起个名字，交给 AI 拆。模板只学风格，不选尺寸（尺寸在出封面时定） */
    const NT = {shots: [], owner: '别人家的', test: true};
    let pickImgs;
    A['new-template'] = () => {
        NT.shots = [];
        NT.owner = '别人家的';
        NT.test = true;
        modal({
            title: BTN.newTemplate, sub: '浏览器模板 · 未来桌面版约定：模板.json + 拆解.md + 原图/',
            body: `<div class="field"><label>这套风格叫什么 <em class="req">*</em></label><input class="inp" id="tn" placeholder="比如：满版照片大白字" maxlength="20"></div>
        <div class="field"><label>是谁家的封面</label><div class="pills" id="nt-own">${[['自家的', TAG.mine], ['别人家的', TAG.others]].map(x => `<button class="pill${x[0] === NT.owner ? ' on' : ''}" data-own="${x[0]}">${x[1]}</button>`).join('')}</div></div>
        <div class="field"><label>封面原图 <em class="req">*</em><span class="muted small" id="nt-n">还没选</span></label>
          <div class="dropzone big" id="nt-drop" data-tip="点一下选文件，或者直接把图片拖进来">${ic('img', 22)}<div>把封面图拖到这里，或点这里选文件 · 几张都行</div></div></div>
        <label class="ckline" id="nt-test"><span class="cb${NT.test ? ' on' : ''}"></span>拆完做还原测试（拿拆解重新出一张，和原图对一对）</label>
        <div class="muted small" style="margin-top:12px">出封面时每一版可选比例；需重排，并逐比例验收。</div>`,
            actions: cancel + `<button class="btn p" id="vi-go" data-act="vi">${ic('ext', 14)} ${esc(BTN.toHost(HOST()))} 拆这套</button>`,
            after(mm) {
                const drop = mm.querySelector('#nt-drop'), cnt = mm.querySelector('#nt-n');
                const paint = () => {
                    mm.querySelectorAll('.thumb').forEach(x => x.remove());
                    NT.shots.slice().reverse().forEach(s => {
                        const d = document.createElement('div');
                        d.className = 'thumb';
                        d.innerHTML = pic(s.url);
                        drop.prepend(d);
                    });
                    cnt.textContent = NT.shots.length ? `已选 ${NT.shots.length} 张` : '还没选';
                };
                drop.onclick = () => pickImgs(fs => {
                    NT.shots = NT.shots.concat(fs);
                    paint();
                });
                drop.ondragover = ev => {
                    ev.preventDefault();
                    drop.classList.add('on');
                };
                drop.ondragleave = () => drop.classList.remove('on');
                drop.ondrop = ev => {
                    ev.preventDefault();
                    drop.classList.remove('on');
                    const fs = Array.from((ev.dataTransfer || {}).files || []).filter(f => /^image\//.test(f.type));
                    if (!fs.length) return toast('只收图片文件', 'no');
                    Promise.all(fs.map(f => readFile(f, true))).then(list => {
                        NT.shots = NT.shots.concat(list.map(f => ({url: f.img, name: f.name})));
                        paint();
                    }).catch(fail);
                };
                mm.querySelectorAll('#nt-own [data-own]').forEach(b => b.onclick = () => {
                    NT.owner = b.dataset.own;
                    mm.querySelectorAll('#nt-own [data-own]').forEach(x => x.classList.toggle('on', x === b));
                });
                mm.querySelector('#nt-test').onclick = () => {
                    NT.test = !NT.test;
                    mm.querySelector('#nt-test .cb').classList.toggle('on', NT.test);
                };
            }
        });
    };
    A['vi'] = () => {
        const name = ($('#tn')?.value || '').trim();
        if (!name || !NT.shots.length) throw Error('请填写模板名并导入至少一张原图');
        const t = {
            id: W.uid('template'),
            name,
            version: 1,
            audience: 'general',
            ratio: '',
            from: '手动导入',
            owner: NT.owner,
            builtin: false,
            sample: false,
            madeAt: D.TODAY,
            used: 0,
            img: NT.shots[0].url,
            shots: NT.shots.map(s => s.url),
            desc: '',
            style: '',
            fit: '',
            unfit: '',
            source: '用户导入原图',
            why: [],
            varies: [],
            fixed: [],
            colors: [],
            evidence: [],
            restoreTest: false,
            restoreRequested: NT.test,
            state: '待拆解',
            validation: null
        };
        W.transact(() => {
            D.TEMPLATES.unshift(t);
            W.addTask(W.request('analyze', t));
        });
        closeModal();
        S.tid = t.id;
        S.page = 'template';
        render();
        launchTask(D.TASKS.at(-1));
    };
    A['pw-kw'] = el => {
        S.pkw = el.value;
        S.psi = -1;
        render();
        const i = $('#pw-kw');
        if (i) {
            i.focus();
            i.setSelectionRange(i.value.length, i.value.length);
        }
    };
    A['pw-cat'] = el => {
        S.pcat = S.pcat === el.dataset.k ? '' : el.dataset.k;
        S.psi = -1;
        closeModal();
        render();
    };
    A['pw-tag'] = el => {
        S.ptag = S.ptag === el.dataset.k ? '' : el.dataset.k;
        S.psi = -1;
        closeModal();
        render();
    };
    A['pw-fav'] = () => {
        S.pfavOnly = !S.pfavOnly;
        S.psi = -1;
        render();
    };
    A['pw-fav-one'] = el => {
        const id = el.dataset.id;
        if (S.pfav[id]) delete S.pfav[id]; else S.pfav[id] = 1;
        save();
        render();
        toast(S.pfav[id] ? '收藏了，记在工作台自己的数据里，md 文件不动' : '取消收藏');
    };
    A['pw-filter'] = () => pwFilterModal();
    A['pw-clear'] = () => {
        S.pkw = '';
        S.pcat = '';
        S.ptag = '';
        S.pfavOnly = false;
        S.pmiss = false;
        S.poff = false;
        S.psi = -1;
        render();
    };
    A['pw-see-miss'] = () => {
        S.pmiss = !S.pmiss;
        S.psi = -1;
        closeModal();
        render();
    };
    A['pw-off-view'] = () => {
        S.poff = !S.poff;
        S.psi = -1;
        render();
    };
    A['pw-restore'] = el => {
        const p = pwOf(el.dataset.id), b = PW_BASE[p.id];
        if (!b) return;
        p.when = b.when;
        p.off = b.off;
        closeModal();
        S.psi = -1;
        render();
        toast(`「${p.title}」回到内置版 · 你之前改的没了`, 'ok');
    };
    /* 内置基线：拷进来以后哪些被动过、还差什么，一眼看得清 */
    A['builtin-list'] = () => {
        const dn = pwDirty(), gap = tplGap();
        modal({
            title: '内置基线', sub: '首次打开拷进内容库 · 之后你改的是你自己那一份',
            body: `<div class="lines">
          <div class="line"><span class="k">提示词</span><span class="v"><span class="small">${Object.keys(PW_BASE).length} 条 · 你改过 ${dn.length} 条${gap.length ? '' : ''}</span></span></div>
          <div class="line"><span class="k">封面风格</span><span class="v"><span class="small">${Object.keys(TPL_BASE).length} 套 · 缺原图 ${gap.length} 套</span></span></div>
          <div class="line"><span class="k">清单文件</span><span class="v mono small">系统（别动）/内置清单.json</span></div>
        </div>
        ${dn.length ? `<div class="pf-sec"><h4>你改过的内置条目</h4><div class="lines">${dn.map(p => `<div class="line"><span class="k">${esc(p.title)}</span><span class="v small muted">${p.off ? '停用了' : '补了处境'} · ${esc(p.cat)}</span><span class="v"><button class="btn xs" data-act="pw-restore" data-id="${esc(p.id)}">回到内置版</button></span></div>`).join('')}</div></div>` : ''}
        ${gap.length ? `<div class="pf-sec"><h4>缺原图的内置风格</h4><div class="lines">${gap.map(t => `<div class="line"><span class="k">${esc(t.name)}</span><span class="v small muted">没有原图就拆不了，风格结论先空着</span><span class="v"><button class="btn xs" data-act="tpl-shot-add" data-id="${esc(t.id)}">${BTN.addShot}</button></span></div>`).join('')}</div></div>` : ''}
        <div class="muted small">官方更新某条内置内容时，只覆盖没被改过的那些；改过的会列在这儿让你自己决定。</div>`,
            actions: '<button class="btn" data-act="pw-clear-base">恢复全部内置</button>' + cancel + '<button class="btn p" data-close>关闭</button>'
        });
    };
    A['pw-clear-base'] = () => {
        pwDirty().forEach(p => {
            const b = PW_BASE[p.id];
            p.when = b.when;
            p.off = b.off;
        });
        closeModal();
        render();
        toast('内置的都回到原版了 · 你自己加的没动', 'ok');
    };
    /* 内置基线：首启整包拷进内容库时记下的原样（工程侧落 系统（别动）/内置清单.json）
     有了它，将来官方更新只覆盖没被改过的，改过的只提示不覆盖 */
    const PW_BASE = {}, TPL_BASE = {};
    D.PROMPTS.forEach(p => {
        if (!p.mine) PW_BASE[p.id] = {when: p.when, off: false};
    });
    D.TEMPLATES.forEach(t => {
        if (t.builtin) TPL_BASE[t.id] = {shots: t.shots.length};
    });
    const pwDirty = () => D.PROMPTS.filter(p => PW_BASE[p.id] && (p.when !== PW_BASE[p.id].when || !!p.off !== PW_BASE[p.id].off));
    const tplGap = () => D.TEMPLATES.filter(t => t.builtin && !t.shots.length);
    /* 内置那批随安装包走，不给删只给停用 —— 文件还在 提示词/ 里，恢复就在这一页 */
    A['pw-off'] = el => {
        const p = pwOf(el.dataset.id);
        if (!p) return;
        p.off = !p.off;
        S.poff = false;
        closeModal();
        S.psi = -1;
        render();
        toast(p.off ? `停用了「${p.title}」，文件还在 提示词/${p.cat}/ 里` : `恢复了「${p.title}」，回到列表里`, 'ok');
    };
    A['pw-pick'] = el => {
        const p = D.byId(el.dataset.id);
        if (p) pwPickModal(p);
    };
    A['pw-goto'] = () => {
        closeModal();
        S.page = 'prompts';
        S.pkw = '';
        S.pmiss = false;
        PWFOCUS = true;
        save();
        render();
    };

    /* 跳转 = 把一句拼好的话填进宿主输入框，没有中间文件；工作台不写任务记录，AI 接单了「在做的」才会长出来 */
    function pwBrief(list) {
        return ['提示词/ 里有 ' + list.length + ' 个文件只有正文，没写 when。逐个读正文，给每个补两行字段：',
            'when：什么时候会想起它，用我会说的话写，一句，不超过 24 个字；',
            'summary：一句话说清它给出什么，不超过 40 个字。',
            '不要改正文，不要动 tags 和 source。写完回读一遍确认字段区格式没坏，再把每个文件名和它新写的 when 成对列出来。',
            '', '文件：'].concat(list.map(p => '提示词/' + p.cat + '/' + p.file + '.md'))
            .concat(['', '这几条是我从旧的内容库里拖进来的，只有正文没有字段。']).join('\n');
    }

    A['pw-ask-ai'] = el => {
        const list = el.dataset.id ? [pwOf(el.dataset.id)].filter(Boolean) : D.pmiss();
        if (!list.length) return toast('都写了处境', 'ok');
        handoffInfo(null, {summary: pwBrief(list)});
    };
    A['pw-copy'] = el => pwModal(pwOf(el.dataset.id));
    A['pw-fill-copy'] = () => {
        if (PWUSE && $('#m-live') === PWUSE.mm) return pwCopy(PWUSE);
    };
    A['pw-raw-copy'] = () => {
        if (PWUSE && $('#m-live') === PWUSE.mm) return pwCopy(PWUSE, true);
    };
    A['pw-reset'] = () => {
        if (!PWUSE || $('#m-live') !== PWUSE.mm || PWUSE.draft.busy) return;
        PWUSE.draft.values = Object.create(null);
        PWUSE.draft.copied = null;
        PWUSE.validated = false;
        PWUSE.mm.querySelectorAll('[data-pv]').forEach(x => {
            x.value = '';
        });
        pwRefresh(PWUSE);
        PWUSE.mm.querySelector('[data-pv]')?.focus();
    };
    A['pw-select'] = el => {
        if (!PWUSE || $('#m-live') !== PWUSE.mm) return;
        const preview = PWUSE.mm.querySelector('#pu-preview');
        if (el.dataset.raw) preview.value = PWUSE.p.body;
        preview.focus();
        preview.select();
        PWUSE.mm.querySelector('#pu-status').textContent = '完整文本已选中，请按 Ctrl / ⌘ + C 手动复制';
    };

    A['pw-rename'] = el => {
        const p = pwOf(el.dataset.id);
        modal({
            title: `${BTN.rename}这条提示词`,
            sub: '文件名跟着改，正文不动',
            body: `<div class="field"><label>名字</label><input class="inp" id="pnr" value="${esc(p.title)}"></div>`,
            actions: cancel + `<button class="btn p" data-act="pw-rename-ok" data-id="${esc(p.id)}">${BTN.rename}</button>`
        });
    };
    A['pw-rename-ok'] = el => {
        const p = pwOf(el.dataset.id), v = (($('#pnr') || {}).value || '').trim();
        if (!v) return toast('名字要写', 'no');
        p.title = v;
        closeModal();
        render();
        toast(`改了名称，文件是 提示词/${p.cat}/${p.file}.md`, 'ok');
    };
    A['pw-del'] = el => {
        const p = pwOf(el.dataset.id);
        modal({
            title: `${BTN.del}「${p.title}」？`,
            sub: '挪进内容库的 .trash/，登记一条，能找回',
            body: `<div class="line"><span class="k">文件</span><span class="v mono small">${esc('提示词/' + p.cat + '/' + p.file + '.md')}</span></div>`,
            actions: cancel + `<button class="btn p" data-act="pw-del-ok" data-id="${esc(p.id)}">${BTN.del}</button>`
        });
    };
    A['pw-del-ok'] = el => {
        const i = D.PROMPTS.findIndex(p => p.id === el.dataset.id);
        if (i >= 0) {
            const [p] = D.PROMPTS.splice(i, 1);
            closeModal();
            render();
            W.trash.push({id: W.uid('trash'), kind: 'prompt', value: p});
            toast('提示词已移入浏览器回收区', 'ok');
        }
    };
    const pwCombo = v => `<div class="combo"><input class="inp" id="pwc" value="${esc(v || D.PCATS[0])}" placeholder="选一个，或打一个新分类" data-tip="新分类就是在 提示词/ 下新建一个子目录"><button class="ib dn" data-act="pw-cat-menu" data-tip="已有的分类">${ic('chev', 15)}</button></div>`;
    A['pw-cat-menu'] = el => {
        const r = el.getBoundingClientRect();
        menu(D.PCATS.map(c => ({
            label: c, run: () => {
                const i = $('#pwc');
                if (i) {
                    i.value = c;
                    if (pwAddActive(PWADD)) pwAddRead(PWADD);
                    i.focus();
                }
            }
        })), r.left - 60, r.bottom + 4);
    };
    const PW_NONAME = '没起名字', PW_MAX = 100000, PW_BYTES = 1024 * 1024;
    let PWSEQ = 1, PWADD = null, PWADRAFT = null, PWBATCH = null;
    const pwAutoName = body => String(body || '').split(/\r?\n/).map(x => x.replace(/^\s*#{1,6}\s*/, '').trim()).find(x => x && !/^[-*_\s]+$/.test(x))?.slice(0, 30) || '';

    function pwParse(raw, name, cat) {
        const src = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        if (src.length > PW_MAX) throw Error('每条提示词最多 100000 字，请缩短后再添加');
        const block = src.match(/^\s*---\s*\n([\s\S]*?)\n---+\s*\n?/), fm = Object.create(null);
        const m = block && /^[ \t]*(?:title|when|summary|tags?|source|cat|category|分类)\s*:/im.test(block[1]) ? block : null;
        if (m) for (const line of m[1].split('\n')) {
            const i = line.indexOf(':');
            if (i > 0) fm[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
        }
        const body = (m ? src.slice(m[0].length) : src).trim();
        if (!body) return null;
        const title = fm.title || name || pwAutoName(body) || PW_NONAME;
        return {
            id: 'pwu' + Date.now().toString(36) + (PWSEQ++),
            cat: fm.cat || fm.category || fm['分类'] || cat || '未分类',
            file: title.replace(/[\\/:*?"<>|]/g, '') || '提示词',
            title,
            when: fm.when || '',
            summary: fm.summary || '',
            tags: String(fm.tags || fm.tag || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean),
            source: fm.source || '',
            body,
            mine: true
        };
    }

    const pwDuplicate = (p, list = D.PROMPTS) => list.find(x => x.body.trim() === p.body.trim() || x.title === p.title && x.cat === p.cat);
    const pwAddActive = use => !!use && PWADD === use && $('#m-live') === use.mm;

    function pwAddStatus(use, text) {
        if (pwAddActive(use)) use.mm.querySelector('#pwa-status').textContent = text;
    }

    function pwAddRead(use) {
        const val = id => use.mm.querySelector('#' + id).value;
        Object.assign(use.draft, {
            body: val('pwb'),
            title: val('pwt'),
            cat: val('pwc'),
            when: val('pww'),
            summary: val('pws'),
            tags: val('pwtg'),
            source: val('pwo')
        });
        return use.draft;
    }

    function pwAddFill(use, p) {
        Object.assign(use.draft, {
            body: p.body,
            title: p.title,
            cat: p.cat,
            when: p.when,
            summary: p.summary,
            tags: p.tags.join('、'),
            source: p.source,
            named: true,
            absorbed: true
        });
        for (const [id, key] of Object.entries({
            pwb: 'body',
            pwt: 'title',
            pwc: 'cat',
            pww: 'when',
            pws: 'summary',
            pwtg: 'tags',
            pwo: 'source'
        })) use.mm.querySelector('#' + id).value = use.draft[key];
    }

    function pwOpenAdd(el) {
        if (PWBATCH) return pwBatchPreview(PWBATCH.results);
        const draft = PWADRAFT || {
            body: '',
            title: '',
            cat: '未分类',
            when: el?.dataset?.k || '',
            summary: '',
            tags: '',
            source: '',
            named: false
        };
        PWADRAFT = draft;
        const use = {draft, mm: null, pasteBusy: false, readSeq: 0, selection: null};
        modal({
            title: '添加提示词', sub: '粘贴 → 保存 → 立即使用', cls: 'pw-add',
            body: `<p>把别人分享的提示词粘贴到下面，也可以自己写。</p>
        <div class="ops wrap-actions"><button class="btn s" data-act="pw-paste">粘贴已复制的内容</button><button class="btn s g" data-act="pw-example">看一个例子</button><button class="btn s" data-act="pw-file">从文件添加</button></div>
        <div class="field"><label for="pwb">提示词正文 <em class="req">*</em></label><textarea class="inp pw-add-body" id="pwb" data-autofocus rows="10" placeholder="在这里粘贴或写下整段提示词">${esc(draft.body)}</textarea></div>
        <div class="field"><label for="pwt">名称（自动生成，可以改）</label><input class="inp" id="pwt" value="${esc(draft.title)}" placeholder="填入正文后自动生成" maxlength="100000"></div>
        <details class="pw-details"><summary>每次要换内容？（可不设置）</summary><p class="small muted">先在上方正文中选中要换的文字，再点下面按钮。以后使用时会出现填写框。</p><button class="btn s" data-act="pw-variable">设为每次填写</button><div id="pwa-variable" hidden><div class="field"><label for="pwa-field-name">以后填写什么？</label><input class="inp" id="pwa-field-name" placeholder="例如：我的问题"></div><button class="btn s" data-act="pw-variable-ok">确认设置</button></div></details>
        <details class="pw-details"><summary>补充信息（可不填）</summary><div class="field"><label for="pwc">分类</label>${pwCombo(draft.cat)}</div><div class="field"><label for="pww">什么时候用</label><input class="inp" id="pww" value="${esc(draft.when)}"></div><div class="field"><label for="pws">它会做什么</label><input class="inp" id="pws" value="${esc(draft.summary)}"></div><div class="field"><label for="pwtg">标签（顿号分开）</label><input class="inp" id="pwtg" value="${esc(draft.tags)}"></div><div class="field"><label for="pwo">出处</label><input class="inp" id="pwo" value="${esc(draft.source)}"></div></details>
        <details class="pw-details"><summary>已有很多文件？</summary><p class="small muted">支持 .md / .txt，选好后先检查，再确认保存。每文件最多 1 MiB。</p><button class="btn s" data-act="pw-directory">选择文件夹</button></details>
        <p class="small muted" id="pwa-status" role="status" aria-live="polite">只需填写正文。草稿在本页刷新前保留。</p><div id="pwa-duplicate"></div>`,
            actions: cancel + '<button class="btn p" data-act="new-prompt-ok">保存提示词</button>',
            after(mm) {
                use.mm = mm;
                PWADD = use;
                const box = mm.querySelector('#pwb');
                const selection = () => {
                    if (box.selectionEnd > box.selectionStart) use.selection = {
                        start: box.selectionStart,
                        end: box.selectionEnd,
                        body: box.value
                    };
                };
                box.onselect = box.onkeyup = box.onmouseup = selection;
                mm.oninput = ev => {
                    if (ev.target.id === 'pwt') draft.named = true;
                    if (ev.target.id === 'pwb') {
                        // Recognize a pasted field block once; never reinterpret a template body while typing.
                        if (!draft.absorbed && ev.inputType === 'insertFromPaste' && /^\s*---\s*\r?\n/.test(box.value)) {
                            try {
                                const p = pwParse(box.value, '', '');
                                if (p && p.body !== box.value.trim()) {
                                    pwAddFill(use, p);
                                    pwAddStatus(use, '已读出文件信息，正文可以继续修改。');
                                }
                            } catch (e) {
                                pwAddStatus(use, e.message);
                            }
                        }
                        if (!draft.named) mm.querySelector('#pwt').value = pwAutoName(box.value);
                    }
                    pwAddRead(use);
                    mm.querySelector('#pwa-duplicate').innerHTML = '';
                };
            }
        });
        return use;
    }

    A['new-prompt'] = pwOpenAdd;
    A['pw-import'] = pwOpenAdd;
    A['pw-paste'] = async () => {
        const use = PWADD;
        if (!pwAddActive(use) || use.pasteBusy) return;
        const original = use.mm.querySelector('#pwb').value;
        if (original.trim()) return pwAddStatus(use, '正文里已有内容。请选中要替换的文字后，直接按 Ctrl / ⌘ + V 粘贴。');
        use.pasteBusy = true;
        const ticket = ++use.readSeq;
        let timer;
        pwAddStatus(use, '正在读取已复制的文字…');
        try {
            const text = await Promise.race([navigator.clipboard.readText(), new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error('timeout')), 2500);
            })]);
            if (!pwAddActive(use) || ticket !== use.readSeq || use.mm.querySelector('#pwb').value !== original) return;
            if (!text.trim()) throw Error('empty');
            if (text.length > PW_MAX) throw Error('limit');
            use.mm.querySelector('#pwb').value = text;
            use.mm.oninput({target: use.mm.querySelector('#pwb'), inputType: 'insertFromPaste'});
            pwAddStatus(use, '已粘贴，确认正文后保存。');
        } catch (e) {
            if (pwAddActive(use) && ticket === use.readSeq) {
                use.mm.querySelector('#pwb').focus();
                pwAddStatus(use, e.message === 'limit' ? '文字超过 100000 字，请缩短后粘贴。' : '请在正文框按 Ctrl / ⌘ + V 粘贴已复制的文字。');
            }
        } finally {
            clearTimeout(timer);
            use.pasteBusy = false;
        }
    };
    A['pw-example'] = () => {
        const use = PWADD;
        if (!pwAddActive(use)) return;
        const box = use.mm.querySelector('#pwb');
        if (box.value.trim()) return pwAddStatus(use, '正文里已有内容，例子不会覆盖它。');
        box.value = '请用简单的话解释下面的问题，给我一个生活中的例子，再用一句话总结。\n\n我的问题：{{我的问题}}';
        use.mm.oninput({target: box});
        pwAddStatus(use, '例子已填入，可以直接保存，也可以修改。');
    };
    A['pw-variable'] = () => {
        const use = PWADD;
        if (!pwAddActive(use)) return;
        const box = use.mm.querySelector('#pwb'), sel = use.selection;
        if (!sel || sel.body !== box.value) {
            box.focus();
            return pwAddStatus(use, '请先在正文中选中每次要换的文字。');
        }
        use.mm.querySelector('#pwa-variable').hidden = false;
        use.mm.querySelector('#pwa-field-name').focus();
    };
    A['pw-variable-ok'] = () => {
        const use = PWADD;
        if (!pwAddActive(use)) return;
        const name = use.mm.querySelector('#pwa-field-name').value.trim(), box = use.mm.querySelector('#pwb'),
            sel = use.selection;
        if (!name || /[{}|\r\n]/.test(name)) return pwAddStatus(use, '填写一个名称，不能含大括号、竖线或换行。');
        if (!sel || sel.body !== box.value) return pwAddStatus(use, '正文已改变，请重新选中文字。');
        const text = box.value.slice(0, sel.start) + '{{' + name + '}}' + box.value.slice(sel.end);
        if (text.length > PW_MAX) return pwAddStatus(use, '正文超过 100000 字，请缩短后再设置。');
        box.value = text;
        use.selection = null;
        use.mm.oninput({target: box});
        use.mm.querySelector('#pwa-variable').hidden = true;
        box.focus();
        pwAddStatus(use, '已设置。使用这条提示词时，会让你填写“' + name + '”。');
    };

    function pwAddObject(use) {
        const d = pwAddRead(use), body = d.body.trim();
        if (!body) throw Error('请先粘贴或填写提示词正文');
        if (/^https?:\/\/\S+$/i.test(body)) throw Error('这里需要提示词正文。把分享的提示词内容粘贴进来就可以。');
        if (body.length > PW_MAX) throw Error('每条提示词最多 100000 字，请缩短后保存');
        const title = d.title.trim() || pwAutoName(body) || PW_NONAME;
        return {
            id: W.uid('prompt'),
            title,
            file: title.replace(/[\\/:*?"<>|]/g, '') || '提示词',
            body,
            cat: d.cat.trim() || '未分类',
            when: d.when.trim(),
            summary: d.summary.trim(),
            source: d.source.trim(),
            tags: d.tags.split(/[、,，]/).map(x => x.trim()).filter(Boolean),
            mine: true
        };
    }

    function pwStore(list, copies) {
        return W.mutate('write', () => {
            const accepted = [];
            for (const original of list) {
                const p = {...original, tags: original.tags.slice()};
                if (!p.body.trim() || p.body.length > PW_MAX) throw Error('正文不能为空，且每条最多 100000 字');
                if (/^https?:\/\/\S+$/i.test(p.body.trim())) throw Error('这里需要提示词正文。请把分享的提示词内容粘贴进来。');
                const existing = D.PROMPTS.concat(accepted);
                if (!copies && pwDuplicate(p, existing)) throw Error('发现重复提示词，请先确认是否保留副本');
                if (copies) {
                    const base = p.title;
                    let n = 2;
                    while (existing.some(x => x.cat === p.cat && x.title === p.title)) p.title = base + '（副本 ' + n++ + '）';
                    p.file = p.title.replace(/[\\/:*?"<>|]/g, '') || '提示词';
                }
                accepted.push(p);
            }
            for (const p of accepted) {
                if (!D.PCATS.includes(p.cat)) D.PCATS.push(p.cat);
                D.PROMPTS.push(p);
            }
            return accepted;
        });
    }

    function pwSaved(list) {
        PWADRAFT = null;
        PWADD = null;
        PWBATCH = null;
        Object.assign(S, {page: 'prompts', pkw: '', pcat: '', ptag: '', pfavOnly: false, pmiss: false, poff: false});
        render();
        modal({
            title: list.length === 1 ? '提示词已保存' : `已保存 ${list.length} 条提示词`,
            body: `<p>${list.length === 1 ? esc(list[0].title) + ' 已放进你的提示词库。' : '现在可以在提示词库中找到它们。'}</p>`,
            actions: '<button class="btn" data-close>回到提示词库</button>' + `<button class="btn p" data-act="pw-copy" data-id="${esc(list[0].id)}">立即使用${list.length > 1 ? '第一条' : ''}</button>`
        });
    }

    function pwSaveForm(copies) {
        const use = PWADD;
        if (!pwAddActive(use)) return;
        try {
            const p = pwAddObject(use), dupe = pwDuplicate(p);
            if (dupe && !copies) {
                use.mm.querySelector('#pwa-duplicate').innerHTML = `<p>库里已有“${esc(dupe.title)}”（${dupe.body.trim() === p.body.trim() ? '正文相同' : '名称和分类相同'}）。原提示词会保留。</p><button class="btn s" data-act="pw-copy" data-id="${esc(dupe.id)}">查看已有</button><button class="btn s" data-act="pw-save-copy">仍保存为副本</button>`;
                return pwAddStatus(use, '发现重复。你可以查看已有提示词，或明确保留一份副本。');
            }
            pwSaved(pwStore([p], copies));
        } catch (e) {
            pwAddStatus(use, e.message);
            use.mm.querySelector('#pwb').focus();
        }
    }

    A['new-prompt-ok'] = () => pwSaveForm(false);
    A['pw-save-copy'] = () => pwSaveForm(true);
    const pwRootDir = name => !name || /^[_.]/.test(name) || name.indexOf('提示词') >= 0 || /^\d+_/.test(name);

    async function pwReadFile(f, cat) {
        if (f.size > PW_BYTES) throw Error('超过 1 MiB');
        const raw = await f.text();
        if (raw.includes('\uFFFD')) throw Error('文字编码无法识别，请另存为 UTF-8 后重试');
        const p = pwParse(raw, f.name.replace(/\.(md|txt)$/i, ''), cat);
        if (!p) throw Error('正文为空');
        if (/^https?:\/\/\S+$/i.test(p.body.trim())) throw Error('文件里只有链接，请改为提示词正文后重选');
        return p;
    }

    async function pwFiles(files, use = null) {
        use = use || (pwAddActive(PWADD) ? PWADD : pwOpenAdd());
        if (!pwAddActive(use)) return;
        const chosen = Array.from(files || []).filter(f => /\.(md|txt)$/i.test(f.name) && !/^[_.]/.test(f.name));
        if (!chosen.length) return pwAddStatus(use, '请选择 .md 或 .txt 提示词文件。');
        const ticket = ++use.readSeq;
        pwAddStatus(use, '正在读取文件，完成后请检查正文…');
        const results = await Promise.all(chosen.map(async f => {
            const seg = String(f.webkitRelativePath || '').split('/').filter(Boolean),
                dir = seg.length > 1 ? seg[seg.length - 2] : '';
            try {
                return {
                    name: f.webkitRelativePath || f.name,
                    p: await pwReadFile(f, dir && !pwRootDir(dir) ? dir : '未分类')
                };
            } catch (e) {
                return {name: f.webkitRelativePath || f.name, error: e.message || '读取失败，请重选 UTF-8 文本文件'};
            }
        }));
        if (!pwAddActive(use) || ticket !== use.readSeq) return;
        const good = results.filter(x => x.p);
        if (results.length === 1 && good.length && !pwAddRead(use).body.trim()) {
            pwAddFill(use, good[0].p);
            pwAddStatus(use, '已读入文件。请检查正文和名称，再点“保存提示词”。');
            return;
        }
        pwBatchPreview(results);
    }

    function pwBatchPreview(results) {
        const good = results.filter(x => x.p), seen = D.PROMPTS.slice();
        let duplicates = 0;
        const rows = results.map(x => {
            const dupe = x.p && pwDuplicate(x.p, seen);
            if (x.p) seen.push(x.p);
            if (dupe) duplicates++;
            return `<div class="pw-import-row"><b>${esc(x.name)}</b>${x.error ? `<p class="pw-field-error">${esc(x.error)}</p>` : `<span class="small muted"> · ${esc(x.p.cat)}${dupe ? ' · 重复：确认后将保留副本' : ''}</span><details><summary>查看正文 · ${esc(x.p.title)}</summary><pre class="pw-text">${esc(x.p.body)}</pre></details>`}</div>`;
        }).join('');
        const batch = {results, good, duplicates, mm: null};
        modal({
            title: '检查要添加的提示词',
            sub: `可保存 ${good.length} 条${results.length - good.length ? ` · ${results.length - good.length} 个文件未读入` : ''}`,
            body: rows + '<p id="pwa-batch-status" role="status" aria-live="polite">' + (duplicates ? '发现重复，原件会保留；确认后另外保存副本。' : '还没有保存。确认内容后再添加。') + '</p>',
            actions: '<button class="btn" data-act="pw-batch-back">回到添加草稿</button>' + (good.length ? `<button class="btn p" data-act="pw-batch-save">${duplicates ? '确认添加（包含副本）' : '确认添加 ' + good.length + ' 条'}</button>` : '') + cancel,
            after(mm) {
                batch.mm = mm;
                PWBATCH = batch;
            }
        });
    }

    A['pw-batch-back'] = () => {
        PWBATCH = null;
        return pwOpenAdd();
    };
    A['pw-batch-save'] = () => {
        const batch = PWBATCH;
        if (!batch || $('#m-live') !== batch.mm) return;
        try {
            pwSaved(pwStore(batch.good.map(x => x.p), batch.duplicates > 0));
        } catch (e) {
            batch.mm.querySelector('#pwa-batch-status').textContent = e.message;
        }
    };

    function pwWalk(entry, cat, files, errors) {
        return new Promise(resolve => {
            if (entry.isFile) {
                if (!/\.(md|txt)$/i.test(entry.name) || /^[_.]/.test(entry.name)) return resolve();
                return entry.file(f => {
                    files.push({
                        name: f.name,
                        size: f.size,
                        webkitRelativePath: (cat ? cat + '/' : '') + f.name,
                        text: () => f.text()
                    });
                    resolve();
                }, () => {
                    errors.push({name: entry.name, error: '无法读取文件，请重选'});
                    resolve();
                });
            }
            const mine = pwRootDir(entry.name) ? cat : entry.name, reader = entry.createReader();
            const step = () => reader.readEntries(async entries => {
                if (!entries.length) return resolve();
                await Promise.all(entries.map(e => pwWalk(e, mine, files, errors)));
                step();
            }, () => {
                errors.push({name: entry.name, error: '无法读取文件夹，请重选'});
                resolve();
            });
            step();
        });
    }

    async function pwDrop(ev) {
        const use = pwAddActive(PWADD) ? PWADD : pwOpenAdd(), items = ev.dataTransfer?.items, entries = [];
        for (const it of Array.from(items || [])) {
            let e;
            try {
                e = it.webkitGetAsEntry?.();
            } catch (x) {
            }
            if (e) entries.push(e);
        }
        if (!entries.some(e => e.isDirectory)) return pwFiles(ev.dataTransfer.files, use);
        if (!pwAddActive(use)) return;
        const ticket = ++use.readSeq, files = [], errors = [];
        await Promise.all(entries.map(e => pwWalk(e, '', files, errors)));
        if (!pwAddActive(use) || ticket !== use.readSeq) return;
        if (!errors.length) return pwFiles(files, use);
        const results = await Promise.all(files.map(async f => {
            try {
                return {
                    name: f.webkitRelativePath,
                    p: await pwReadFile(f, f.webkitRelativePath.split('/').slice(-2, -1)[0] || '未分类')
                };
            } catch (e) {
                return {name: f.name, error: e.message};
            }
        }));
        if (pwAddActive(use) && ticket === use.readSeq) pwBatchPreview(results.concat(errors));
    }

    A['pw-file'] = () => pwPick(false);
    A['pw-directory'] = () => pwPick(true);

    function pwPick(dir) {
        const use = PWADD;
        if (!pwAddActive(use)) return;
        const i = document.createElement('input');
        i.type = 'file';
        if (dir) i.webkitdirectory = true; else {
            i.accept = '.md,.txt,text/plain,text/markdown';
            i.multiple = true;
        }
        i.onchange = () => pwFiles(i.files, use);
        i.click();
    }

    function matItems(p, m) {
        return [
            {label: BTN.copyImage, icon: 'copy', run: () => A['copy-img']({dataset: {p: p.id, m: m.id}})},
            {label: BTN.download, icon: 'down', run: () => A['dl']({dataset: {p: p.id, m: m.id, n: 1}})},
            {
                label: `这几版（${m.batches.length}）`,
                action: 'versions',
                icon: 'img',
                run: () => A['versions']({dataset: {p: p.id, id: m.id}})
            },
            {
                label: BTN.rename,
                icon: 'edit',
                run: () => A['rename']({dataset: {kind: 'material', id: p.id, mid: m.id}})
            },
            {label: BTN.inFolder, icon: 'folder', run: () => A['open-folder']()}
        ];
    }

    /* ---------- 浏览器可执行蓝本：持久化、人工交接与验收 ---------- */
    const TASK_LABEL = {
        handoff: '待交接',
        running: '执行中 · 人工接单',
        review: '待验收',
        success: '成功',
        partial: '部分成功',
        failed: '失败',
        interrupted: '中断'
    };
    const AUTH_LABEL = {
        'logged-out': '未登录',
        checking: '查询中',
        active: '已开通',
        unlicensed: '未开通',
        expired: '已到期',
        'offline-valid': '离线宽限有效',
        'offline-expired': '离线宽限过期',
        'network-error': '网络查询失败',
        invalid: '凭据失效',
        revoked: '已撤销'
    };

    function fail(e) {
        toast(e?.message || '操作失败，原数据已保留', 'no');
    }

    function runAction(name, el, ev) {
        try {
            const value = A[name](el, ev);
            if (value?.catch) value.catch(fail);
            return value;
        } catch (e) {
            fail(e);
        }
    }

    function downloadBlob(blob, name) {
        const a = document.createElement('a'), link = URL.createObjectURL(blob);
        a.href = link;
        a.download = (name || '内容库导出').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(link), 5000);
    }

    async function readSource(src) {
        if (!W.source(src)) throw Error('没有可导出的真实图片');
        const response = await fetch(src);
        if (!response.ok) throw Error('读取图片失败；file 预览可能不支持下载内置图，请使用导入的图片或静态预览服务');
        const blob = await response.blob(), mime = blob.type.split(';')[0].trim().toLowerCase();
        const ext = ({
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'image/svg+xml': '.svg'
        })[mime];
        if (!ext || !blob.size) throw Error('图片格式不正确或文件为空');
        return {blob, ext};
    }

    async function downloadSource(src, name) {
        const {blob, ext} = await readSource(src);
        downloadBlob(blob, (name || '封面') + ext);
        toast('已向浏览器提交下载；请在下载列表确认', 'ok');
    }

    async function downloadSources(sources, name) {
        if (!sources.length) throw Error('没有可导出的参考图');
        const entries = [];
        for (const source of sources) {
            const {blob, ext} = await readSource(source.img);
            entries.push({name: source.id + ext, data: new Uint8Array(await blob.arrayBuffer())});
        }
        downloadBlob(window.NCHZip.create(entries), name + '.zip');
        toast(`已打包 ${entries.length} 张图片，下载一个 ZIP 后解压并附给助手`, 'ok');
    }

    function chooseFiles(accept, multiple, callback) {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = accept;
        i.multiple = multiple;
        i.onchange = () => Promise.resolve(callback(Array.from(i.files || []))).catch(fail);
        i.click();
    }

    async function readFile(file, imageOnly = false) {
        if (!file || file.size > 1024 * 1024) throw Error('浏览器预览每个文件限 1 MiB；请先缩小图片。大文件将在桌面版接入');
        if (imageOnly && !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw Error('仅支持 PNG / JPEG / WebP / GIF 图片，不接受 SVG');
        const content = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(Error('读取文件失败'));
            r.readAsDataURL(file);
        });
        const info = {
            id: W.uid('asset'),
            name: file.name,
            bytes: file.size,
            size: kb(file.size),
            content,
            type: file.type
        };
        if (imageOnly) {
            const dimensions = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
                img.onerror = () => reject(Error('文件不是可解码图片'));
                img.src = content;
            });
            if (dimensions.some(x => !x || x > 20000) || dimensions[0] * dimensions[1] > 40000000) throw Error('图片像素超限，最长边 20000、总像素 4000 万以内');
            info.px = dimensions;
            info.img = content;
        }
        if (crypto.subtle) info.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(x => x.toString(16).padStart(2, '0')).join('');
        return info;
    }

    async function normalizeCreatorPhoto(file, maxBytes = 1024 * 1024) {
        if (!file?.size || file.size > 20 * 1024 * 1024) throw Error('原照片请控制在 20 MiB 以内');
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw Error('仅支持 PNG / JPEG / WebP / GIF 图片，不接受 SVG');
        const src = URL.createObjectURL(file);
        let image;
        try {
            image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(Error('照片无法解码，请换一张完整的图片'));
                img.src = src;
            });
        } finally {
            URL.revokeObjectURL(src);
        }
        const [w, h] = [image.naturalWidth, image.naturalHeight];
        if (!w || !h || Math.max(w, h) > 20000 || w * h > 40000000) throw Error('照片像素超限，请使用 4000 万像素以内的图片');
        if (file.size <= maxBytes && Math.max(w, h) <= 1600) return {file, optimized: false};
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        if (!context) throw Error('此浏览器暂不支持本地照片优化，请换一张较小照片');
        const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        let scale = Math.min(1, 1600 / Math.max(w, h));
        for (let pass = 0; pass < 5; pass++, scale *= 0.8) {
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (const quality of [0.9, 0.8, 0.65, 0.5]) {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
                if (!blob) throw Error('本地照片优化失败，请换一张照片重试');
                if (blob.size <= maxBytes) {
                    const ext = blob.type === 'image/jpeg' ? '.jpg' : blob.type === 'image/webp' ? '.webp' : '.png',
                        name = file.name.replace(/\.[^.]*$/, '') + ext;
                    return {file: new File([blob], name, {type: blob.type}), optimized: true};
                }
            }
        }
        throw Error('照片暂时无法压到本地剩余容量以内，请先导出备份并整理工作区后重试');
    }

    function refreshPhotoView() {
        if (CV?.mm?.id === 'm-live') {
            CV.p = D.byId(CV.p.id);
            cvPaint();
        }
        render();
    }

    function photosChanged(preferred = '') {
        if (CV?.mm?.id === 'm-live') {
            const selected = CV.ref.filter(id => W.photoById(id)), hadPerson = selected.length > 0;
            CV.ref = CV.ref.filter(id => !selected.includes(id) || D.ACCOUNT.photos.some(p => p.id === id && W.isOwnPhoto(p)));
            const next = preferred || (!CV.personNone && !CV.ref.some(id => D.ACCOUNT.photos.some(p => p.id === id && W.isOwnPhoto(p))) && W.defaultPhoto()?.id);
            if (next && (preferred || hadPerson || !CV.personNone)) {
                CV.ref = CV.ref.filter(id => !W.photoById(id));
                CV.ref.push(next);
                CV.personNone = false;
            }
        }
        refreshPhotoView();
    }

    async function photoFiles(files) {
        if (!files.length) return;
        W.authorize('write');
        if (files.length > 32) throw Error('一次最多上传 32 张照片');
        const budget = Math.min(1024 * 1024, Math.floor((W.maxBytes - JSON.stringify(W.snapshot()).length * 2 - 16000) / (files.length * 2.8)));
        if (budget < 32000) throw Error('本地工作区剩余容量不足，请先导出备份并整理照片；回收区照片仍占容量');
        const images = [];
        let optimized = false;
        for (const source of Array.from(files)) {
            const result = await normalizeCreatorPhoto(source, budget);
            images.push(await readFile(result.file, true));
            optimized ||= result.optimized;
        }
        try {
            W.addPhotos(images);
        } catch (e) {
            refreshPhotoView();
            throw e;
        }
        photosChanged();
        toast(`${images.length} 张本人照片已保存在本浏览器${optimized ? '，已在本机优化用于封面（未磨皮、未改脸）' : ''}`, 'ok');
    }

    A['photo-upload'] = () => chooseFiles('image/png,image/jpeg,image/webp,image/gif', true, photoFiles);
    A['photo-default'] = el => W.setDefaultPhoto(el.dataset.id);
    A['photo-delete'] = el => W.removePhoto(el.dataset.id);
    A['photo-restore'] = el => W.restore(el.dataset.id);
    A['photo-export'] = async el => {
        const cover = el?.dataset?.scope === 'cover',
            ids = cover ? CV?.ref : activeHandoff?.request?.references.map(r => r.id);
        const photos = (ids || []).map(W.photoById).filter(Boolean);
        if (!photos.length) throw Error('本次没有选择本人照片');
        if (photos.length === 1) return downloadSource(photos[0].img, photos[0].id);
        return downloadSources(photos, '本人照片-' + (cover ? CV.tpl : activeHandoff?.request?.requestId || '本次'));
    };
    A['reference-export'] = async el => {
        const req = el?.dataset?.scope === 'cover' ? {
            templateId: CV.tpl,
            templateVersion: D.tplOf(CV.tpl).version,
            targetId: CV.p.id,
            references: CV.ref.map(id => {
                const a = W.referenceChoices(D.tplOf(CV.tpl), CV.p).find(a => a.id === id);
                return {id: a.id, version: a.version};
            })
        } : activeHandoff?.request;
        if (!req?.references.length) throw Error('本次没有选择参考图');
        const sources = W.requestReferenceSources(req);
        return downloadSources(sources, req.requestId || req.templateId + '-v' + req.templateVersion + '-本次参考');
    };
    let activeHandoff = null;

    function handoffInfo(task = null, options = {}) {
        if (task && task.host !== D.SETTINGS.host) {
            task = W.mutate('external', () => W.transferTask(task));
            options = {...options, mode: 'new'};
            render();
        }
        let envelope = W.createHandoff(task, {...options, host: D.SETTINGS.host}),
            bridge = window.NCHHandoff.url(envelope, {
                release: W.config,
                validateRequest: window.NCHCore.validateRequest
            });
        if (bridge.code === 'RESUME_UNAVAILABLE') {
            envelope = W.createHandoff(task, {...options, host: D.SETTINGS.host, mode: 'new'});
            bridge = window.NCHHandoff.url(envelope, {
                release: W.config,
                validateRequest: window.NCHCore.validateRequest
            });
        }
        activeHandoff = envelope;
        const text = window.NCHHandoff.prompt(envelope), canLaunch = !FEATURE_AUTH && bridge.ok;
        const referenceCount = envelope.request?.references.length || 0;
        const ownPhotoCount = (envelope.request?.references || []).filter(r => W.photoById(r.id)).length;
        const prepare = `${bridge.requiresAttachment ? '<div class="handoff-required" role="alert"><b>必须先下载 HANDOFF.json 并在助手中附上</b><p>这次内容超过链接容量，链接只有简短说明，完整请求在交接文件中。</p><button class="btn" data-act="handoff-download">下载 HANDOFF.json</button></div>' : ''}${referenceCount ? `<p>本次 ${referenceCount} 张参考，其中本人照片 ${ownPhotoCount} 张。下载 ZIP，解压后将全部图片附给助手；包内文件名与请求中的稳定 ID 对应。</p><button class="btn" data-act="reference-export" data-scope="handoff">导出本次全部参考图 ZIP</button>` : ''}`;
        const alternate = `<div class="ops wrap-actions">${canLaunch ? '<button class="btn s" data-act="host-copy">复制交接文本</button>' : ''}${!bridge.requiresAttachment ? '<button class="btn s" data-act="handoff-download">下载 HANDOFF.json</button>' : ''}<a class="btn s" href="${esc(window.NCHHandoff.homeUrl(envelope.target.host))}" target="_blank" rel="noopener noreferrer">仅打开${esc(H(envelope.target.host))}首页</a>${ownPhotoCount ? '<button class="btn s" data-act="photo-export" data-scope="handoff">单独导出本人照片参考版</button>' : ''}</div>`;
        const technical = `<p>目标：${esc(H(envelope.target.host))} · ${envelope.target.mode === 'resume' ? '回原会话' : '新会话'}${task ? ` · 任务 ${esc(task.id)}` : ''}${envelope.sourceTaskId ? ` · 来源任务 ${esc(envelope.sourceTaskId)}` : ''}</p>${!bridge.ok ? `<p>${esc(bridge.code)}：${esc(bridge.message || '')}</p>` : ''}${bridge.ok ? `<label>协议链接实际预填文本<textarea class="inp code" id="protocol-prompt" readonly>${esc(bridge.prompt)}</textarea></label>` : ''}<label>完整交接文本（供复制；不代表已通过链接传入）<textarea class="inp code" id="host-text" readonly>${esc(text)}</textarea></label><details><summary>交接 JSON · schema 1</summary><pre class="code">${esc(JSON.stringify(envelope, null, 2))}</pre></details>`;
        modal({
            title: `交接到${H(envelope.target.host)}`,
            wide: true,
            body: `<p>准备好资料后，在 ${esc(H(envelope.target.host))} 中确认发送。图片与附件不会随链接传入，浏览器不能确认助手接单或执行。</p>${FEATURE_AUTH ? '<p class="handoff-required" role="alert">此构建要求真实授权；鉴权演示不能授权执行。当前仅支持复制或下载交接内容。</p>' : ''}${!bridge.ok && !FEATURE_AUTH ? `<p role="alert">${esc(bridge.message || '请使用复制或下载方式继续。')}</p>` : ''}${prepare ? `<section class="handoff-prepare"><h4>交接前准备</h4>${prepare}</section>` : ''}<details class="task-secondary"><summary>其他交接方式</summary>${alternate}<details class="task-secondary"><summary>技术详情与完整交接内容</summary>${technical}</details></details>`,
            actions: `${canLaunch ? `<a class="btn p" href="${esc(bridge.url)}" target="_blank" rel="noopener noreferrer">打开${esc(H(envelope.target.host))}继续</a>` : '<button class="btn p" data-act="host-copy">复制交接文本</button>'}<button class="btn" data-close>关闭</button>`
        });

    }

    function cvRulesHtml() {
        const t = D.tplOf(CV.tpl);
        return `<div class="cv-sec"><div class="cv-h"><b>将带给宿主的拆解与约束</b><em>请求会固定本次版本和参考 ID</em></div>${t ? `<div class="small">${esc(t.name)} · v${t.version} · ${esc(t.state)}</div><div class="cv-evidence">${W.isBuiltinTemplate(t) ? coverStyleRefs(t, CV.p).filter(a => CV.ref.includes(a.id)).map((a, i) => `<div><div style="width:80px">${imgBox({
            src: a.img,
            ratio: '3/4',
            auto: true,
            cap: '组内风格样张 ' + (i + 1)
        })}</div><p>已选组内样张 ${i + 1} · 共同风格与构图差异</p></div>`).join('') : ''}${t.evidence.map(e => `<div><div style="width:80px">${imgBox({
            src: t.shots[e.sourceIndex],
            ratio: '3/4',
            auto: true,
            cap: '原图证据'
        })}</div><p>${esc(e.rule)}</p></div>`).join('')}${t.validation?.restoreImage ? `<div><div style="width:80px">${imgBox({
            src: t.validation.restoreImage,
            ratio: '3/4',
            auto: true,
            cap: '已验收还原参考'
        })}</div><p>已验收还原参考</p></div>` : ''}</div><ul class="dot-list">${t.fixed.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="small muted">标题直接使用上面填写的原文；长标题按规则换行，放不下先给缩短建议确认。比例变化按目标比例重排，禁止拉伸原图或裁掉文字。</p><p class="small muted">可变：${esc(t.varies.join('；')) || '无'} · 原图证据 ${t.evidence.length} 条</p>` : '<p class="small muted">请选择已通过还原验收的模板。</p>'}</div>`;
    }

    function templateStepTasks(t) {
        const kind = t.state === '待拆解' || !t.evidence.length ? 'analyze' : 'restore';
        return D.TASKS.filter(task => currentTemplateTask(task, t) && task.request?.kind === kind && isPendingTask(task));
    }

    function templateWorkflow(t) {
        const tasks = templateStepTasks(t),
            label = W.isTemplateUsable(t) ? '使用模板' : !t.shots.length ? '添加模板原图' : t.state === '待验收' ? '查看还原图并验收' : tasks.length > 1 ? `选择 ${tasks.length} 项当前任务` : tasks.length ? taskActionLabel(tasks[0]) : t.state === '待拆解' || !t.evidence.length ? '创建拆解请求' : '创建还原请求';
        return `<div class="card pad template-workflow"><h3>${W.isTemplateUsable(t) ? '模板已可用' : '当前步骤 · ' + esc(t.state)} · v${t.version}</h3><p class="small muted">${t.sample ? '历史演示规则仅供阅读，需真实还原与人工验收。' : '导入真实结果后逐步验收；浏览器不代替 AI 执行。'}</p>${W.isTemplateUsable(t) ? '' : `<button class="btn p" data-act="template-step" data-id="${esc(t.id)}">${esc(label)}</button>`}<details class="task-secondary"><summary>其他操作</summary><div class="ops wrap-actions">${t.shots.length ? `<button class="btn s" data-act="tpl-shot-add" data-id="${esc(t.id)}">添加原图</button>` : ''}<button class="btn s" data-act="analyze-template" data-id="${esc(t.id)}">重新拆解</button><button class="btn s" data-act="rules-import" data-id="${esc(t.id)}">导入规则 JSON</button><button class="btn s" data-act="restore-template" data-id="${esc(t.id)}" ${t.evidence.length ? '' : 'disabled'}>新建还原请求</button><button class="btn s" data-act="restore-import" data-id="${esc(t.id)}" ${t.evidence.length ? '' : 'disabled'}>导入还原图</button><button class="btn s" data-act="template-fail" data-id="${esc(t.id)}">记录验收失败</button><button class="btn s" data-act="tpl-task" data-id="${esc(t.id)}">任务与历史</button><button class="btn s" data-act="template-history" data-id="${esc(t.id)}">版本历史 ${(t.history || []).length}</button></div></details><details class="task-secondary"><summary>当前规则与证据</summary><ul class="dot-list">${t.fixed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${t.evidence.map(e => `<div class="evidence-row">${imgBox({
            src: t.shots[e.sourceIndex],
            auto: true,
            ratio: '3/4',
            cap: '原图证据'
        })}<p>${esc(e.rule)}</p></div>`).join('') || '<p class="small muted">尚无已导入的原图证据。</p>'}${t.review ? `<p>最近人工评审 v${t.review.templateVersion}：${esc(t.review.reason || '已记录逐项检查')}</p>` : ''}</details></div>`;
    }

    function enhance() {
        const body = $('#body');
        body.insertAdjacentHTML('afterbegin', `<div class="prototype-banner"><b>浏览器交互原型</b> · 数据保存在本浏览器 · 协议链接可尝试唤起助手 · 系统目录 / 安装探测 / 真实授权尚未接入 ${FEATURE_AUTH ? `<button class="btn xs" data-act="auth-demo">鉴权演示：${esc(AUTH_LABEL[W.auth] || W.auth)}</button>` : '<span class="tag mute">免鉴权预览</span>'}${W.readonly ? `<p role="alert">${esc(W.error)} · 当前只读，可导出诊断及导入有效备份。</p>` : ''}</div>`);
        body.querySelectorAll('[data-open],[data-tpl],[data-pw],.dropzone[data-act]').forEach(el => {
            if (!['BUTTON', 'A'].includes(el.tagName)) {
                el.setAttribute('role', 'button');
                el.tabIndex = 0;
                el.setAttribute('aria-label', el.textContent.trim().slice(0, 100) || '查看详情');
            }
        });
        body.querySelectorAll('button').forEach(el => {
            if (!el.textContent.trim() && !el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tip || el.dataset.act || '操作');
        });

        if (S.page === 'template') {
            const t = D.tplOf(S.tid);
            if (t && (!W.isBuiltinTemplate(t) || !W.isTemplateUsable(t))) {
                body.querySelector('.stack')?.insertAdjacentHTML('afterbegin', templateWorkflow(t));
            }
        }
        if (S.page === 'project') {
            const p = D.byId(S.pid);
            if (p?.kind === '合集') body.querySelector('.hero .acts')?.insertAdjacentHTML('afterbegin', `<button class="btn" data-act="collection-members" data-id="${esc(p.id)}">管理成员</button>`);
        }
        if (S.page === 'more') body.querySelector('.wrap')?.insertAdjacentHTML('beforeend', workspaceCard());
    }

    function workspaceCard() {
        return `<div class="card pad"><h2>浏览器工作区与交接</h2><p class="small muted">库 ID：${esc(W.libraryId)} · schema 1 · 每文件 1 MiB / 工作区 4 MiB · 请定期导出。浏览器清理站点数据会删除本机工作区；导出备份可恢复。</p><div class="ops wrap-actions"><button class="btn" data-act="backup-export">导出工作区备份</button><button class="btn" data-act="backup-import">导入并恢复备份</button><button class="btn" data-act="backup-previous">恢复上一次导入前</button><button class="btn" data-act="trash">回收区 ${W.trash.length}</button><button class="btn" data-act="plugin-settings">插件与宿主配置</button><button class="btn" data-act="request-list">请求与返回结果</button>${FEATURE_AUTH ? '<button class="btn" data-act="auth-demo">鉴权演示</button>' : ''}</div></div>`;
    }

    A['auth-demo'] = () => modal({
        title: '鉴权状态演示 · 非真实授权',
        body: `<p>以下状态仅演示界面闸门，不产生 access token。到期 / 退出仍可浏览和导出已有成果。离线有效只允许本地写入；外部 AI 动作须在线开通。</p><div class="pills">${Object.entries(AUTH_LABEL).map(([k, v]) => `<button class="pill ${W.auth === k ? 'on' : ''}" data-act="auth-set" data-k="${k}">${v}</button>`).join('')}</div>`,
        actions: '<button class="btn" data-close>关闭</button>'
    });
    A['auth-set'] = el => {
        W.setAuth(el.dataset.k);
        closeModal();
        render();
    };
    A['refresh'] = A['auth-demo'];
    A['logout'] = () => {
        W.setAuth('logged-out');
        closeModal();
        render();
        toast('演示已退出；已有内容仍可浏览和导出');
    };
    A['logout-ok'] = A['logout'];
    A['open-host'] = () => handoffInfo();
    A['handoff-download'] = () => {
        if (!activeHandoff) throw Error('请先打开交接');
        downloadBlob(new Blob([JSON.stringify(activeHandoff, null, 2)], {type: 'application/json'}), 'HANDOFF.json');
    };
    A['project-cover-tasks'] = el => {
        const p = D.byId(el.dataset.id);
        if (!p) throw Error('内容不存在');
        const tasks = projectTasks(p).filter(t => isPendingTask(t) && t.request.kind === 'generate');
        if (tasks.length === 1) return openTask(tasks[0]);
        return showTaskChoices(tasks, [], p.name + ' · 封面任务');
    };
    A['project-tasks'] = el => {
        const p = D.byId(el.dataset.id);
        if (!p) throw Error('内容不存在');
        const all = projectTasks(p), pending = all.filter(isPendingTask),
            real = all.filter(t => isRealTask(t) && !isTransferredTask(t));
        if (pending.length === 1) return routeTask(pending[0]);
        if (pending.length > 1) return showTaskChoices(pending, all.filter(t => !pending.includes(t)), p.name + ' · 选择任务');
        if (real.length === 1) return openTask(real[0]);
        if (real.length > 1) return showTaskChoices(real, all.filter(t => !real.includes(t)), p.name + ' · 查看结果');
        return A['project-handoff']({dataset: {id: p.id}});
    };
    A['task-pick'] = el => {
        const id = el.dataset.id;
        if (!taskPicker?.ids.includes(id)) throw Error('任务不属于本次列表');
        const t = D.TASKS.find(t => t.id === id);
        if (!t) throw Error('任务已变化，请重新打开任务列表');
        taskPicker.selected = id;
        $('#m-live').querySelector('.modal-f').innerHTML = `<button class="btn p" data-act="task-picker-go">${esc(taskActionLabel(t))}</button><button class="btn" data-close>关闭</button>`;
    };
    A['task-picker-go'] = () => {
        if (!taskPicker?.selected) throw Error('请先选择一个任务');
        const t = D.TASKS.find(t => t.id === taskPicker.selected);
        if (!t || !taskPicker.ids.includes(t.id)) throw Error('任务已变化，请重新选择');
        return routeTask(t);
    };
    A['template-step'] = el => {
        const t = D.tplOf(el.dataset.id);
        if (!t) throw Error('模板不存在');
        if (W.isTemplateUsable(t)) return A['use-tpl'](el);
        if (!t.shots.length) return A['tpl-shot-add'](el);
        const tasks = templateStepTasks(t);
        if (t.state === '待验收') {
            if (tasks.length === 1) return openTask(tasks[0]);
            if (tasks.length > 1) return showTaskChoices(tasks, [], t.name + ' · 选择还原结果');
            return A['template-accept'](el);
        }
        if (tasks.length === 1) return routeTask(tasks[0]);
        if (tasks.length > 1) return showTaskChoices(tasks, [], t.name + ' · 选择当前任务');
        return A[t.state === '待拆解' || !t.evidence.length ? 'analyze-template' : 'restore-template'](el);
    };
    A['project-handoff'] = el => handoffInfo(null, {project: D.byId(el.dataset.id)});

    function launchTask(task) {
        if (!task) throw Error('任务不存在');
        handoffInfo(task, {mode: task.conv ? 'resume' : 'new'});
    }

    A['task-bridge'] = A['task-transfer'] = el => launchTask(D.TASKS.find(t => t.id === el.dataset.id));
    A['open-folder'] = A['in-folder'] = A['refind'] = A['bind'] = A['new-lib'] = A['bind-ok'] = () => modal({
        title: '系统目录 · 桌面版接入',
        body: '<p>浏览器预览不读写系统内容库。当前工作区保存在本浏览器；使用备份文件携带和恢复。</p>',
        actions: '<button class="btn" data-act="backup-export">导出备份</button><button class="btn" data-act="backup-import">导入备份</button><button class="btn" data-close>关闭</button>'
    });
    A['pw-folder'] = A['open-folder'];
    A['diagnostic-handoff'] = () => handoffInfo(null, {summary: `请核对 Nova Content Hub 的配套插件、skills 和 hooks。构建 ${W.config.pairId}；当前助手 ${HOST()}。浏览器无法探测真实安装、信任、授权与内容库目录；先调用配套插件 doctor / check-handoff，仅检查后报告证据，不自动安装或授予信任。`});
    A['check-run'] = () => {
        S.page = 'check';
        render();
    };
    A['host-copy'] = () => copy($('#host-text')?.value || '', '已复制交接文本，尚未发送到宿主');
    A['intake'] = el => {
        const p = D.byId(el?.dataset.id || S.pid);
        if (!p) throw Error('请明确选择要整理资料的内容');
        handoffInfo(null, {
            project: p,
            summary: `本次动作：整理资料。为「${p.name}」归纳现有资料、梳理缺失信息并给出整理建议。渠道：${p.channels.slice(0, 16).join('、') || '未指定'}；附件 ${p.files.length} 个，物料 ${p.materials.length} 个。浏览器中的附件与图片须由用户另行导出提供，未收到文件时不要假装已读取。`
        });
    };
    A['schedule'] = el => {
        const p = D.byId(el?.dataset.id || S.pid);
        if (!p) throw Error('请明确选择要排发布的内容');
        const dates = [...new Set(p.posts.map(x => `${x.date} ${x.channel}`))];
        handoffInfo(null, {
            project: p,
            summary: `本次动作：排发布。为「${p.name}」结合已有安排提出发布计划，待用户确认后再登记。计划日期：${p.plan || '未设定'}；渠道：${p.channels.slice(0, 16).join('、') || '未指定'}；已有发布安排：${dates.slice(0, 16).join('；') || '暂无'}${dates.length > 16 ? '（仅列前16项）' : ''}。本次不包含完整帖文或附件字节。`
        });
    };
    A['howto'] = A['plugin-settings'] = () => {
        modal({
            title: '插件与宿主配置 · 手动记录',
            body: `<p>未探测的值一律为未知；以下仅用于交接前人工核对，不构成安装证明。</p><p>当前助手：${esc(HOST())} · 在「更多 → 设置」统一切换</p><div class="field"><label>安装状态<select class="inp" id="host-install">${['unknown', 'installed', 'missing'].map(k => `<option value="${k}">${{
                unknown: '未知',
                installed: '人工记录已安装',
                missing: '未安装'
            }[k]}</option>`).join('')}</select></label></div><div class="field"><label>配套插件版本<input class="inp" id="host-version" placeholder="未知；期望 ${esc(W.config.version)}"></label></div><div class="field"><label>配套插件 pairId<input class="inp" id="plugin-pair-id" placeholder="待人工记录，期望 ${esc(W.config.pairId)}"></label></div><div class="field"><label>信任<select class="inp" id="host-trust"><option value="unknown">未知</option><option value="untrusted">未信任</option><option value="trusted">人工记录已信任</option></select></label></div><div class="field"><label>自媒体 clientId<input class="inp" id="client-id" value="${esc(D.SETTINGS.clientId || '')}" placeholder="待配置，禁止复用旅游产品"></label></div><p class="small">Scope：nova-content-hub · 版本 ${esc(W.config.version)} · 配对 ${esc(W.config.pairId)}</p><pre class="code">${esc(JSON.stringify(D.SETTINGS.hostConfig[D.SETTINGS.host], null, 2))}</pre>`,
            actions: '<button class="btn" data-act="plugin-config-save">保存人工配置</button><button class="btn" data-act="plugin-command">查看完整指令</button><button class="btn" data-close>关闭</button>'
        });
    };
    A['plugin-config-save'] = () => {
        const h = D.SETTINGS.host, v = $('#host-version').value.trim();
        D.SETTINGS.clientId = $('#client-id').value.trim();
        D.SETTINGS.hostConfig[h] = {
            installation: $('#host-install').value,
            version: v,
            pluginPairId: $('#plugin-pair-id').value.trim(),
            compatibility: !v || !$('#plugin-pair-id').value.trim() ? '未知' : v === W.config.version && $('#plugin-pair-id').value.trim() === W.config.pairId ? '人工记录匹配，未探测' : '插件版本或授权模式不匹配',
            trust: $('#host-trust').value,
            evidence: '用户手动记录，未探测'
        };
        closeModal();
        render();
    };
    A['plugin-command'] = () => modal({
        title: '自媒体插件命令 · 仅检查契约',
        body: `<p>先安装配对的插件包，并把 PLUGIN_ROOT 替换成真实绝对路径。check-request 仅校验，不执行 AI。内容库路径待绑定。</p><textarea class="inp code" id="host-text" readonly>${esc(`node "<PLUGIN_ROOT>/dist/content.mjs" check-request --file REQUEST.json\nScope: nova-content-hub\nPair: ${W.config.pairId}\nSkill: nova-content-template-study / nova-content-template-restore / nova-content-cover\nclientId: ${D.SETTINGS.clientId || '待配置'}\n内容库绝对路径: 待桌面版绑定`)}</textarea>`,
        actions: '<button class="btn" data-act="host-copy">复制完整指令</button><button class="btn" data-close>关闭</button>'
    });
    A['backup-export'] = () => {
        downloadBlob(new Blob([(W.readonly ? W.raw() : JSON.stringify(W.snapshot()))], {type: 'application/json'}), `nova-content-hub-${D.TODAY}.json`);
        toast('备份已提交浏览器下载，请确认文件保存后再清理站点数据');
    };
    A['backup-import'] = () => chooseFiles('.json,application/json', false, async fs => {
        if (!fs.length) return;
        if (fs[0].size > W.maxBytes / 2) throw Error('备份超出浏览器容量，未覆盖当前数据');
        const raw = await fs[0].text();
        const parsed = window.NCHCore.validate(JSON.parse(raw));
        modal({
            title: '恢复这份备份？',
            body: `<p>将当前工作区替换为 ${esc(parsed.libraryId)}：${parsed.data.PROJECTS.length} 条内容、${parsed.data.TEMPLATES.length} 套模板。恢复前保留一份上一工作区；请先导出当前备份。</p>`,
            actions: '<button class="btn" data-act="backup-export">先导出当前</button><button class="btn p" id="restore-confirm">确认恢复</button><button class="btn" data-close>取消</button>',
            after(mm) {
                mm.querySelector('#restore-confirm').onclick = () => {
                    try {
                        if (!W.allowed('recovery')) throw Error('请先在鉴权演示中选择已开通状态，再恢复工作区');
                        W.importBackup(raw);
                        closeModal();
                        S.pid = null;
                        S.page = 'today';
                        render();
                        toast('备份已验证并恢复', 'ok');
                    } catch (e) {
                        fail(e);
                    }
                };
            }
        });
    });
    A['backup-previous'] = () => {
        W.previous();
        render();
        toast('恢复到上一次导入前，原数据仍可再次切回', 'ok');
    };
    A['trash'] = () => modal({
        title: '回收区 · 浏览器工作区',
        body: W.trash.map(x => `<div class="line"><span class="k">${esc(x.value.name || x.kind)}</span><button class="btn s" data-act="trash-restore" data-id="${esc(x.id)}">恢复</button></div>`).join('') || '<p>回收区为空。</p>',
        actions: '<button class="btn" data-close>关闭</button>'
    });
    A['trash-restore'] = el => {
        W.restore(el.dataset.id);
        closeModal();
        render();
        toast('已恢复到原所属记录', 'ok');
    };
    A['new-project-ok'] = () => {
        const channels = (CHSEL['np-ch'] || []).slice(), p = W.addProject($('#np')?.value || '', '内容', channels);
        channels.forEach(c => D.chanAdd(c));
        closeModal();
        S.pid = p.id;
        S.page = 'project';
        render();
    };
    A['new-collection'] = () => modal({
        title: '新建合集',
        body: '<label>合集名<input class="inp" id="nc-name" maxlength="200"></label>',
        actions: '<button class="btn p" data-act="new-collection-ok">创建合集</button>' + cancel
    });
    A['new-collection-ok'] = () => {
        const p = W.addProject($('#nc-name').value, '合集');
        p.dates = {from: D.TODAY, to: D.TODAY};
        closeModal();
        S.pid = p.id;
        S.page = 'project';
        render();
    };
    A['collection-members'] = el => {
        const p = D.byId(el.dataset.id);
        modal({
            title: '管理合集成员',
            body: D.PROJECTS.filter(x => x.kind === '内容').map(x => `<label class="ckline"><input type="checkbox" data-member="${esc(x.id)}" ${p.members.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('') || '请先创建内容',
            actions: `<button class="btn p" data-act="collection-members-save" data-id="${esc(p.id)}">保存成员</button>` + cancel
        });
    };
    A['collection-members-save'] = el => {
        D.byId(el.dataset.id).members = $$('[data-member]:checked').map(x => x.dataset.member);
        closeModal();
        render();
    };
    A['use-tpl'] = el => {
        const t = D.tplOf(el.dataset.id);
        if (!W.isTemplateUsable(t)) throw Error('这套模板尚未通过规则和还原验收');
        modal({
            title: '选择使用这套模板的内容',
            body: `<p>${esc(t.name)} · v${t.version}</p><label>目标内容<select class="inp" id="use-target"><option value="">请明确选择</option>${D.PROJECTS.filter(p => p.kind === '内容').map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>`,
            actions: `<button class="btn p" data-act="use-target" data-id="${esc(t.id)}">进入出图配置</button><button class="btn" data-act="new-project">新建内容</button>` + cancel
        });
    };
    A['use-target'] = el => {
        const p = D.byId($('#use-target').value);
        if (!p || p.kind !== '内容') throw Error('请明确选择目标内容');
        closeModal();
        S.pid = p.id;
        S.page = 'project';
        S.sel = {};
        render();
        openCoverSetup(p);
        A['cv-tpl']({dataset: {k: el.dataset.id}});
    };
    A['rename'] = el => {
        const kind = el?.dataset?.kind || (S.page === 'template' ? 'template' : 'project');
        const itemId = el?.dataset?.id || (kind === 'template' ? S.tid : S.pid), mid = el?.dataset?.mid || '';
        const item = kind === 'template' ? D.tplOf(itemId) : kind === 'material' ? D.matOf(D.byId(itemId), mid) : D.byId(itemId);
        if (!item) throw Error('请明确选择要改名的目标');
        modal({
            title: '重命名',
            body: `<input class="inp" id="rename-value" value="${esc(item.name)}">`,
            actions: `<button class="btn p" data-act="rename-ok" data-kind="${esc(kind)}" data-id="${esc(itemId)}" data-mid="${esc(mid)}">保存</button>` + cancel
        });
    };
    A['rename-ok'] = el => {
        const {kind, id, mid} = el.dataset,
            item = kind === 'template' ? D.tplOf(id) : kind === 'material' ? D.matOf(D.byId(id), mid) : D.byId(id),
            name = $('#rename-value').value.trim();
        if (!item || !name) throw Error('名称不能为空，且目标必须存在');
        item.name = name;
        closeModal();
        render();
    };
    A['del-project'] = el => modal({
        title: '移入回收区？',
        body: `<p>${esc(D.byId(el.dataset.id).name)}</p>`,
        actions: `<button class="btn p" data-act="del-ok" data-id="${esc(el.dataset.id)}">移入回收区</button>` + cancel
    });
    A['del-ok'] = el => {
        if (!el.dataset.id) throw Error('请从具体内容删除；物料删除需保留发布引用，暂未开放');
        W.removeProject(D.byId(el.dataset.id));
        closeModal();
        S.page = 'projects';
        render();
    };
    A['save-account'] = () => {
        const fields = $$('#m-live input');
        D.ACCOUNT.name = fields[0].value.trim();
        D.ACCOUNT.marks[0].v = fields[1].value.trim();
        D.ACCOUNT.intro = fields[2].value.trim();
        closeModal();
        render();
    };
    A['pick-file'] = el => chooseFiles('', true, async fs => {
        if (!fs.length) return;
        const files = await Promise.all(fs.map(f => readFile(f)));
        W.authorize('write');
        W.transact(() => D.byId(el.dataset.p).files.push(...files));
        closeModal();
        render();
        toast('附件内容已保存在浏览器工作区，可导出备份', 'ok');
    });
    A['del-file'] = el => {
        W.removeFile(D.byId(el.dataset.p), el.dataset.file);
        closeModal();
        render();
    };
    A['tpl-shot-add'] = el => chooseFiles('image/png,image/jpeg,image/webp,image/gif', true, async fs => {
        const files = await Promise.all(fs.map(f => readFile(f, true)));
        W.authorize('write');
        W.transact(() => {
            const t = D.tplOf(el.dataset.id);
            W.archive(t);
            t.shots.push(...files.map(f => f.img));
            t.img ||= t.shots[0];
            t.state = '待拆解';
            t.evidence = [];
            t.restoreTest = false;
            t.validation = null;
            t.version++;
        });
        render();
    });
    A['tpl-shot-rep'] = el => chooseFiles('image/png,image/jpeg,image/webp,image/gif', false, async fs => {
        if (!fs.length) return;
        const f = await readFile(fs[0], true);
        W.authorize('write');
        W.transact(() => {
            const t = D.tplOf(el.dataset.id), i = +el.dataset.i, old = shotAt(t, i);
            W.archive(t);
            W.trash.push({id: W.uid('trash'), kind: 'shot', tid: t.id, value: old});
            if (i < 0) {
                const oi = t.shots.indexOf(old);
                if (oi >= 0) t.shots[oi] = f.img;
                t.img = f.img;
            } else {
                t.shots[i] = f.img;
                if (t.img === old) t.img = f.img;
            }
            t.state = '待拆解';
            t.evidence = [];
            t.restoreTest = false;
            t.validation = null;
            t.version++;
        });
        render();
    });
    A['tpl-shot-del'] = el => {
        W.removeShot(D.tplOf(el.dataset.id), +el.dataset.i);
        render();
    };
    pickImgs = cb => chooseFiles('image/png,image/jpeg,image/webp,image/gif', true, async fs => {
        const result = await Promise.all(fs.map(f => readFile(f, true)));
        cb(result.map(f => ({url: f.img, name: f.name})));
    });
    A['dl'] = async el => {
        const cand = el.closest?.('.cand')?.querySelector('img'),
            tid = el.dataset.tid || (S.page === 'template' ? S.tid : null);
        if (cand) return downloadSource(cand.getAttribute('src'), '封面');
        if (tid) {
            const t = D.tplOf(tid);
            return downloadSources(W.styleReferences(t, null), t.id + '-v' + t.version + '-样张组');
        }
        const p = D.byId(el.dataset.p || S.pid);
        if (!p) throw Error('请先选择内容或具体图片');
        const items = el.dataset.m ? [{m: D.matOf(p, el.dataset.m)}] : D.pickedOf(p);
        for (const item of items) {
            const c = item.c || D.usedCand(item.m);
            if (c) await downloadSource(c.img, `${p.name}-${item.m.format}`);
        }
    };
    A['copy-img'] = async el => {
        const p = D.byId(el.dataset.p), m = p && D.matOf(p, el.dataset.m),
            post = el.dataset.post && p.posts.find(x => x.id === el.dataset.post),
            c = post?.pub ? post.pub.snapshot : m && D.usedCand(m);
        if (!c) throw Error('没有选定图片');
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
            await downloadSource(c.img, p.name);
            toast('此浏览器不支持图片剪贴板，已改为下载');
            return;
        }
        try {
            const r = await fetch(c.img);
            if (!r.ok) throw Error('读取图片失败');
            const blob = await r.blob();
            await navigator.clipboard.write([new ClipboardItem({[blob.type]: blob})]);
            toast('图片已复制', 'ok');
        } catch {
            await downloadSource(c.img, p.name);
            toast('复制接口未成功，已改为下载');
        }
    };
    A['cv-pixels'] = el => {
        CV.pixels = el.value.trim();
    };


    A['analyze-template'] = el => {
        const t = D.tplOf(el.dataset.id);
        if (!t.shots.length) throw Error('请先导入原图');
        const task = W.addTask(W.request('analyze', t));
        render();
        launchTask(task);
    };
    A['restore-template'] = el => {
        const t = D.tplOf(el.dataset.id);
        if (!t.evidence.length) throw Error('请先导入带原图证据的规则');
        const task = W.addTask(W.request('restore', t));
        t.state = '待还原';
        render();
        launchTask(task);
    };
    A['template-history'] = el => {
        const t = D.tplOf(el.dataset.id);
        modal({
            title: '模板版本历史 · 文本与验收引用',
            body: `<pre class="code">${esc(JSON.stringify(t.history || [], null, 2))}</pre>`,
            actions: '<button class="btn" data-close>关闭</button>'
        });
    };

    function templateImportTasks(t, kind, taskId) {
        const running = D.TASKS.filter(task => task.tid === t.id && task.request?.kind === kind && task.state === 'running' && isRealTask(task) && !isTransferredTask(task));
        const tasks = taskId ? running.filter(task => task.id === taskId) : running.filter(task => task.request.templateVersion === t.version);
        if (taskId && !tasks.length) throw Error('任务已变化，请重新选择执行中的任务');
        if (tasks.some(task => task.request.templateVersion !== t.version) || !tasks.length && running.length) throw Error(kind === 'restore' ? '还原任务属于旧模板版本，请为当前版本新建还原请求' : '拆解任务属于旧模板版本，请为当前版本新建拆解请求');
        return tasks;
    }

    A['rules-import'] = el => {
        const t = D.tplOf(el.dataset.id), tasks = templateImportTasks(t, 'analyze', el.dataset.taskId);
        if (tasks.length > 1) return showTaskChoices(tasks, [], t.name + ' · 选择要导入规则的任务');
        const binding = Object.freeze({templateId: t.id, version: t.version, taskId: tasks[0]?.id || null});
        modal({
            title: '导入真实拆解规则',
            body: `<p>sourceIndex 从 0 开始，必须指向本模板已有原图；不会自动验收。</p><textarea class="inp code" id="rules-json" placeholder='{"fixed":["标题留白规则"],"varies":["跟随内容变化"],"evidence":[{"sourceIndex":0,"rule":"可见依据"}]}'></textarea>`,
            actions: `<button class="btn p" data-act="rules-save" data-id="${esc(t.id)}">验证并保存规则</button>` + cancel,
            after(mm) {
                mm.ruleImport = binding;
            }
        });
    };

    function templateTaskResult(t, kind, result, taskId = null) {
        const task = taskId ? D.TASKS.find(x => x.id === taskId) : null;
        if (taskId && (!task || task.tid !== t.id || task.request?.kind !== kind || task.state !== 'running')) throw Error('任务已变化，请重新打开当前任务导入');
        if (!task) return;
        if (kind === 'restore' && task.request.templateVersion !== t.version) throw Error('还原任务属于旧模板版本，请为当前版本新建还原请求');
        task.resultCount = 1;
        task.result = {
            ...result,
            templateVersion: kind === 'restore' ? task.request.templateVersion : t.version,
            requestId: task.request.requestId,
            importedAt: new Date().toISOString()
        };
        W.taskState(task, 'review');
    }

    A['rules-save'] = el => {
        const t = D.tplOf(el.dataset.id), binding = $('#m-live')?.ruleImport;
        if (binding && (binding.templateId !== t.id || binding.version !== t.version)) throw Error('模板版本已变化，请重新打开规则导入');
        const tasks = binding ? binding.taskId ? templateImportTasks(t, 'analyze', binding.taskId) : [] : templateImportTasks(t, 'analyze', el.dataset.taskId);
        if (tasks.length > 1) throw Error('存在多个执行中任务，请先明确选择要导入的任务');
        if (binding?.taskId && tasks[0]?.id !== binding.taskId) throw Error('任务已变化，不能改记到其他任务');
        W.rules(t, JSON.parse($('#rules-json').value));
        templateTaskResult(t, 'analyze', {type: 'rules', evidenceCount: t.evidence.length}, tasks[0]?.id || null);
        closeModal();
        render();
    };
    A['restore-import'] = el => {
        const t = D.tplOf(el.dataset.id), tasks = templateImportTasks(t, 'restore', el.dataset.taskId);
        if (tasks.length > 1) return showTaskChoices(tasks, [], t.name + ' · 选择要导入还原图的任务');
        const version = t.version, taskId = tasks[0]?.id || null;
        chooseFiles('image/png,image/jpeg,image/webp,image/gif', false, async fs => {
            if (!fs.length) return;
            const f = await readFile(fs[0], true);
            W.authorize('write');
            W.transact(() => {
                const current = D.tplOf(el.dataset.id);
                if (current.version !== version) throw Error('模板版本已变化，请重新为当前版本导入还原图');
                if (!current.evidence.length) throw Error('缺少规则证据');
                templateTaskResult(current, 'restore', {type: 'restore', restoreId: f.id}, taskId);
                current.validation = {
                    restoreId: f.id,
                    restoreImage: f.img,
                    px: f.px,
                    sha256: f.sha256 || '',
                    sourceIndex: 0,
                    accepted: false,
                    importedAt: new Date().toISOString()
                };
                current.state = '待验收';
            });
            render();
        });
    };
    const REVIEW_CHECKS = {
        title: '标题逐字无误',
        readability: '缩成手机小图仍能读清',
        boundary: '文字与主体不出安全边界',
        rules: '符合本模板的固定规则',
        identity: '无原图身份、标志或未经授权内容残留'
    };

    function templateReview(t, failed = false, taskId = null) {
        const binding = Object.freeze({
            templateId: t.id,
            version: t.version,
            restoreId: t.validation?.restoreId || null,
            taskId
        });
        modal({
            title: failed ? '记录验收失败' : '对照原图逐项验收',
            body: `${t.validation?.restoreImage ? `<div class="task-review-pair"><div><p>模板原图</p>${imgBox({
                src: t.shots[0],
                auto: true,
                ratio: '3/4',
                cap: '模板原图'
            })}</div><div><p>当前还原图</p>${imgBox({
                src: t.validation.restoreImage,
                auto: true,
                ratio: '3/4',
                cap: '当前还原图'
            })}</div></div>` : ''}<p>每项记录通过 / 失败 / 看不清；看不清不能算通过。AI 风格参考不会因此变为还原证据。</p>${Object.entries(REVIEW_CHECKS).map(([key, label]) => `<div class="field"><label for="review-${key}">${label}</label><select class="inp" id="review-${key}"><option value="unclear">看不清 / 还未检查</option><option value="pass">通过</option><option value="fail">失败</option></select></div>`).join('')}<div class="field"><label for="review-reason">${failed ? '失败原因（必填）' : '问题与补充说明'}</label><textarea class="inp" id="review-reason" maxlength="2000" placeholder="写清具体哪一处、下一轮改什么"></textarea></div>`,
            actions: `<button class="btn p" data-act="${failed ? 'template-fail-save' : 'template-review-save'}" data-id="${esc(t.id)}">${failed ? '保存失败记录' : '保存评审并验收通过'}</button>` + cancel,
            after(mm) {
                mm.templateReview = binding;
            }
        });
    }

    function readTemplateReview(t) {
        const mm = $('#m-live'), binding = mm?.templateReview;
        if (!binding || binding.templateId !== t.id || binding.version !== t.version || binding.restoreId !== (t.validation?.restoreId || null)) throw Error('还原图或模板版本已变化，请重新打开当前还原图验收');
        if (binding.taskId) {
            const task = D.TASKS.find(x => x.id === binding.taskId);
            if (task?.state !== 'review' || task.request?.templateVersion !== binding.version || task.result?.templateVersion !== binding.version || task.result?.restoreId !== binding.restoreId) throw Error('任务还原结果已变化，请重新打开当前任务验收');
        }
        return {
            templateVersion: binding.version,
            checks: Object.fromEntries(Object.keys(REVIEW_CHECKS).map(k => [k, mm.querySelector('#review-' + k).value])),
            reason: mm.querySelector('#review-reason').value.trim(),
            reviewedAt: new Date().toISOString()
        };
    }

    A['template-accept'] = el => templateReview(D.tplOf(el.dataset.id));
    A['template-fail'] = el => templateReview(D.tplOf(el.dataset.id), true);
    A['template-review-save'] = el => {
        const t = D.tplOf(el.dataset.id), review = readTemplateReview(t);
        if (Object.values(review.checks).some(x => x !== 'pass')) throw Error('仍有失败或看不清的项目，不能验收通过；可记录失败原因');
        W.acceptTemplate(t);
        t.review = review;
        const taskId = $('#m-live').templateReview.taskId;
        const task = taskId ? D.TASKS.find(x => x.id === taskId) : D.TASKS.filter(x => x.tid === t.id && x.state === 'review' && x.result?.type === 'restore' && x.request?.templateVersion === t.version && x.result.templateVersion === t.version && x.result.restoreId === t.validation.restoreId).at(-1);
        if (task) W.taskState(task, 'success');
        closeModal();
        render();
    };
    A['template-fail-save'] = el => {
        const t = D.tplOf(el.dataset.id), review = readTemplateReview(t);
        if (!review.reason) throw Error('请写明失败原因');
        t.review = review;
        t.state = '失败';
        t.restoreTest = false;
        if (t.validation?.kind !== 'authored-design' && t.validation) t.validation.accepted = false;
        closeModal();
        render();
    };
    A['builtin-update'] = el => {
        const t = D.tplOf(el.dataset.id), referenceOnly = W.builtinUpdate(t)?.version === t.version;
        W.updateBuiltin(t);
        render();
        toast(referenceOnly ? '参考资产已更新，AI 风格参考待人工验收；历史任务快照仍保留' : '已更新内置定义，上一版和历史任务快照仍保留', 'ok');
    };
    A['tpl-task'] = el => {
        const t = D.tplOf(el.dataset.id);
        if (!t) throw Error('模板不存在');
        const all = D.TASKS.filter(task => task.tid === t.id),
            current = all.filter(task => currentTemplateTask(task, t) && !isTransferredTask(task));
        if (current.length === 1 && !all.some(task => !current.includes(task))) return openTask(current[0]);
        return showTaskChoices(current, all.filter(task => !current.includes(task)), t.name + ' · 当前 v' + t.version + ' 与历史任务');
    };
    A['request-list'] = () => modal({
        title: '任务与历史结果',
        body: D.TASKS.map(taskRow).join('') || '暂无任务',
        actions: '<button class="btn" data-close>关闭</button>'
    });

    function taskCandidates(t) {
        if (t.request?.kind !== 'generate' || t.result?.requestId !== t.request.requestId) return [];
        const p = D.byId(t.pid), m = p && D.matOf(p, t.mid),
            batch = m?.batches.find(b => b.requestId === t.request.requestId),
            ids = new Set((t.result.candidates || []).map(c => c.id));
        return (batch?.cands || []).filter(c => ids.has(c.id));
    }

    function openTask(t) {
        const candidates = taskCandidates(t), template = D.tplOf(t.tid),
            historical = isTransferredTask(t) || !!t.tid && !currentTemplateTask(t, template), real = isRealTask(t);
        const restore = t.result?.type === 'restore' && template?.version === t.result.templateVersion && template.validation?.restoreId === t.result.restoreId ? template.validation.restoreImage : '';
        const reviewReady = t.request?.kind === 'generate' ? candidates.length > 0 : t.result?.type === 'restore' ? !!restore : t.result?.type === 'rules';
        let primary = '';
        if (real && !historical && !isCompletedTask(t)) {
            if (['handoff', 'failed', 'interrupted'].includes(t.state)) primary = `<button class="btn p" data-act="task-bridge" data-id="${esc(t.id)}">${t.state === 'handoff' ? '交给' : '重新交接到'}${esc(HOST())}继续</button>`;
            else if (t.state === 'running') primary = t.request.kind === 'generate' ? `<button class="btn p" data-act="task-import" data-id="${esc(t.id)}">导入本任务候选图</button>` : `<button class="btn p" data-act="${t.request.kind === 'restore' ? 'restore-import' : 'rules-import'}" data-id="${esc(t.tid)}" data-task-id="${esc(t.id)}">导入${t.request.kind === 'restore' ? '本任务还原图' : '拆解规则'}</button>`;
            else if (t.state === 'review') primary = `<button class="btn p" data-act="task-success" data-id="${esc(t.id)}" ${reviewReady ? '' : 'disabled'}>对照结果完成验收</button>`;
        }
        const previews = candidates.length ? `<div class="task-preview-grid">${candidates.map(c => `<button class="task-preview" data-act="zoom" data-src="${esc(c.img)}" data-cap="本任务候选 ${esc(c.no)}" aria-label="查看本任务候选 ${esc(c.no)} 大图">${pic(c.img)}<span>${esc(c.no)} 号 · ${c.px ? c.px.join(' × ') : '实际像素未记录'}</span></button>`).join('')}</div>` : t.request?.kind === 'generate' ? '<p class="muted">本任务还没有候选图，其他批次结果单独保留。</p>' : '';
        const restoration = t.result?.type === 'restore' ? (restore ? `<div class="task-restore">${imgBox({
            src: restore,
            ratio: '3/4',
            auto: true,
            cap: '本任务还原结果'
        })}</div>` : '<p class="small muted">此任务的还原图或模板版本已被替换；当前还原图不能作为旧任务的产物。</p>') : '';
        const management = real && !historical && !isCompletedTask(t) ? `<details class="task-secondary"><summary>接单与异常处理</summary><p class="small muted">状态由用户手动登记，不表示浏览器确认了外部执行。</p><div class="ops wrap-actions">${['handoff', 'interrupted', 'failed'].includes(t.state) ? `<button class="btn s" data-act="task-accept" data-id="${esc(t.id)}">我已在助手手动接单</button>` : ''}${['handoff', 'running', 'review'].includes(t.state) ? `<button class="btn s" data-act="task-failed" data-id="${esc(t.id)}">记失败</button><button class="btn s" data-act="task-stop" data-id="${esc(t.id)}">记中断</button>` : ''}</div></details>` : '';
        const technical = `<details class="task-secondary"><summary>请求与返回详情</summary><p>原助手：${esc(H(t.host))} · 原会话：${esc(t.conv || '未记录')}</p><div class="ops wrap-actions"><button class="btn s" data-act="host-copy">复制请求</button>${t.request ? `<button class="btn s" data-act="request-download" data-id="${esc(t.id)}">下载请求 JSON</button>` : ''}</div><textarea class="inp code" id="host-text" readonly>${esc(JSON.stringify(t.request || {note: '旧示例任务，不能作为执行证据'}, null, 2))}</textarea><pre class="code">${esc(JSON.stringify(t.result || {note: '还没有真实返回结果'}, null, 2))}</pre></details>`;
        modal({
            title: t.name + ' · ' + (real ? TASK_LABEL[t.state] : '历史演示'),
            wide: true,
            body: `<p>${esc(taskSummary(t))}</p>${historical ? '<p class="small muted">这是历史版本或已移交任务，记录只供查看；当前步骤不会推进这条旧记录。</p>' : ''}${!real ? '<p class="small muted">旧演示记录没有真实请求，不代表已交接或执行。</p>' : ''}${previews}${restoration}${t.result?.type === 'rules' ? `<p>本任务已导入 ${t.result.evidenceCount || 0} 条规则证据 · 结果版本 v${t.result.templateVersion}</p>` : ''}${real && !historical && t.state === 'running' ? `${t.request?.kind === 'generate' ? '<p class="small muted">本次导入作为新一轮结果，之前图片保留历史；不会累计到本轮验收。</p>' : ''}<p class="small muted">仍需在助手中操作时，<button class="btn xs g" data-act="task-bridge" data-id="${esc(t.id)}">在当前${esc(HOST())}继续会话</button></p>` : ''}${management}${technical}`,
            actions: primary + '<button class="btn" data-close>关闭</button>',
            after(mm) {
                if (candidates.length) mm.taskResultReview = {
                    taskId: t.id,
                    requestId: t.request.requestId,
                    candidateIds: candidates.map(c => c.id)
                };
            }
        });
    }

    A['task-open'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        if (!t) throw Error('任务不存在');
        openTask(t);
    };
    A['fix-go'] = A['task-fix'] = A['task-bridge'];
    A['request-download'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        if (!t?.request) throw Error('示例记录没有请求');
        downloadBlob(new Blob([JSON.stringify(t.request, null, 2)], {type: 'application/json'}), 'REQUEST.json');
    };
    A['task-accept'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        if (!t.request) throw Error('旧示例任务不能接单，请新建真实请求');
        W.taskState(t, 'running');
        render();
        openTask(t);
    };
    A['task-stop'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        W.taskState(t, 'interrupted');
        render();
        openTask(t);
    };
    A['task-failed'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        W.taskState(t, 'failed');
        render();
        openTask(t);
    };
    A['task-import'] = el => chooseFiles('image/png,image/jpeg,image/webp,image/gif', true, async fs => {
        if (!fs.length) return;
        const files = await Promise.all(fs.map(f => readFile(f, true)));
        W.authorize('write');
        W.transact(() => {
            const t = D.TASKS.find(x => x.id === el.dataset.id);
            if (t?.state !== 'running' || t.request?.kind !== 'generate') throw Error('请先在宿主手动接单；同一任务结果不能重复导入');
            const p = D.byId(t.pid), m = p && D.matOf(p, t.mid);
            let b = m?.batches.find(x => x.requestId === t.request.requestId);
            if (!b) throw Error('本任务批次不存在，请先恢复目标内容');
            if (files.length > t.request.options.count) throw Error('导入数量超过请求数量');
            const seen = new Set();
            files.forEach(f => {
                const key = f.sha256 || f.img;
                if (seen.has(key)) throw Error('同一批次包含重复图片');
                seen.add(key);
            });
            b.attempt ||= 1;
            if (b.cands.length) {
                b.sourceRequestId = b.requestId;
                delete b.requestId;
                b = {
                    no: Math.max(...m.batches.map(x => x.no)) + 1,
                    at: D.TODAY,
                    tpl: b.tpl,
                    title: b.title,
                    cands: [],
                    state: 'running',
                    requestId: t.request.requestId,
                    attempt: b.attempt + 1,
                    ref: (b.ref || []).slice()
                };
                m.batches.push(b);
            }
            files.forEach(f => {
                const no = String(D.candsOf(m).length + 1).padStart(2, '0');
                b.cands.push({
                    id: f.id,
                    no,
                    img: f.img,
                    px: f.px,
                    bytes: f.bytes,
                    sha256: f.sha256 || '',
                    srcPath: `内容/${esc(p.id)}/封面/${esc(m.id)}/${esc(f.id)}`,
                    store: 'browser',
                    use: false,
                    fav: false,
                    from: '人工导入真实文件'
                });
            });
            t.resultCount = b.cands.length;
            t.result = {
                requestId: t.request.requestId,
                attempt: b.attempt,
                candidates: b.cands.map(c => ({id: c.id, px: c.px, bytes: c.bytes, sha256: c.sha256})),
                importedAt: new Date().toISOString()
            };
            W.taskState(t, 'review');
        });
        render();
        openTask(D.TASKS.find(x => x.id === el.dataset.id));
    });
    A['task-success'] = el => {
        const t = D.TASKS.find(x => x.id === el.dataset.id);
        if (t.tid) {
            const template = D.tplOf(t.tid);
            if (!t.result || t.result.templateVersion !== template.version) throw Error('模板版本已变化，不能验收旧结果');
            if (t.result.type === 'restore') {
                if (t.state !== 'review' || t.request?.templateVersion !== template.version || !t.result.restoreId || t.result.restoreId !== template.validation?.restoreId) throw Error('当前还原图已更换或任务版本已过期，不能验收旧结果');
                return templateReview(template, false, t.id);
            }
            W.taskState(t, 'success');
            render();
            return openTask(t);
        }
        const viewed = $('#m-live')?.taskResultReview, current = taskCandidates(t);
        if (!viewed || viewed.taskId !== t.id || viewed.requestId !== t.request.requestId || !current.length || JSON.stringify(viewed.candidateIds) !== JSON.stringify(current.map(c => c.id))) throw Error('请先打开本任务的真实候选图，再完成验收');
        const p = D.byId(t.pid), m = p && D.matOf(p, t.mid),
            b = m?.batches.find(x => x.requestId === t.request.requestId);
        if (!b?.cands.length) throw Error('无真实产物，不能验收通过');
        const expected = t.request.options.pixels, mismatches = b.cands.filter(c => {
            const a = c.px[0] / c.px[1], rr = t.request.options.ratio.split(':').map(Number);
            return Math.abs(a - rr[0] / rr[1]) > 0.01 || expected && c.px.some((x, i) => x !== expected[i]);
        });
        if (mismatches.length) throw Error('有候选实际比例或像素不符请求，请记失败/中断后重新提交；原图已保留');
        W.taskState(t, t.resultCount < t.request.options.count ? 'partial' : 'success');
        render();
        openTask(t);
    };
    const readActions = new Set([
        'template-accept', 'template-fail', 'tpl-audience', 'tpl-scenario', 'cv-audience', 'cv-scenario', 'kw', 'day', 'cal-week', 'calmode', 'focus', 'calday', 'chf', 'mpick', 'mon', 'wk', 'pf', 'chan-add', 'chan-rm', 'chan-free', 'chan-need', 'chan-manage',
        'pw-kw', 'pw-cat', 'pw-tag', 'pw-filter', 'pw-copy', 'pw-pick', 'pw-fill-copy', 'pw-raw-copy', 'pw-reset', 'pw-select', 'pw-clear', 'pw-fav', 'pw-fav-one', 'pw-off-view', 'pw-goto', 'pw-cat-menu',
        'new-prompt-ok', 'pw-save-copy', 'pw-paste', 'pw-example', 'pw-variable', 'pw-variable-ok', 'pw-file', 'pw-directory', 'pw-batch-back', 'pw-batch-save', 'pw-see-miss', 'pw-folder', 'pw-rename', 'pw-del', 'new-prompt', 'pw-import', 'edit-account', 'files', 'ie', 'pub-add', 'pub-edit', 'pub-free', 'edit-proj', 'new-project', 'new-template', 'new-collection', 'collection-members', 'rename', 'del-project', 'use-tpl', 'use-target',
        'zoom', 'dl', 'copy-img', 'copy-text', 'cmp', 'cmp-clear', 'cand-sel', 'old-batch', 'versions', 'mat-more', 'det-more', 'tpl-more', 'task-open', 'task-fix', 'tpl-task',
        'open-folder', 'in-folder', 'refind', 'bind', 'bind-ok', 'new-lib', 'check-run', 'diagnostic-handoff', 'cp', 'host-copy', 'handoff-download', 'project-handoff', 'task-bridge', 'open-host', 'howto', 'plugin-settings', 'plugin-command', 'request-list', 'request-download',
        'backup-export', 'backup-import', 'trash', 'lib-more', 'builtin-list', 'auth-demo', 'auth-set', 'refresh', 'logout', 'logout-ok', 'motion',
        'project-cover-tasks', 'project-tasks', 'task-pick', 'task-picker-go', 'template-step', 'photo-export', 'reference-export', 'tpl-browse', 'cv-person', 'cv-brief', 'cv-title', 'cv-size', 'cv-add', 'cv-add-no', 'cv-wh', 'cv-n', 'cv-nc', 'cv-cnt', 'cv-kw', 'cv-own', 'cv-tpl', 'cv-new', 'cv-ref', 'cv-pixels', 'make-cover', 'rules-import', 'template-history'
    ]);
    const externalActions = new Set(['cv-go', 'vi', 'analyze-template', 'restore-template', 'task-accept', 'task-transfer', 'intake', 'schedule', 'pw-ask-ai', 'fix-go']);
    const writeActions = new Set([
        'photo-upload', 'photo-default', 'photo-delete', 'photo-restore', 'chan-need-ok', 'chan-del', 'tpl-cover', 'sample', 'set-host', 'pub-ok', 'pub-del', 'cv-rm', 'cv-quick', 'cv-add-ok', 'use-cand', 'cand-fav', 'use-batch',
        'edit-proj-ok', 'pw-restore', 'pw-clear-base', 'pw-off', 'pw-rename-ok', 'pw-del-ok', 'plugin-config-save', 'backup-previous', 'trash-restore',
        'new-project-ok', 'new-collection-ok', 'collection-members-save', 'rename-ok', 'del-ok', 'save-account', 'pick-file', 'del-file', 'tpl-shot-add', 'tpl-shot-rep', 'tpl-shot-del',
        'builtin-update', 'template-review-save', 'template-fail-save', 'rules-save', 'restore-import', 'task-stop', 'task-failed', 'task-import', 'task-success'
    ]);
    const actionKinds = Object.fromEntries([...readActions].map(k => [k, 'read']).concat([...writeActions].map(k => [k, 'write']), [...externalActions].map(k => [k, 'external'])));
    Object.keys(A).forEach(name => {
        if (!actionKinds[name]) throw Error('未分类动作：' + name);
    });

    const photoChanges = new Set(['photo-default', 'photo-delete', 'photo-restore']);
    Object.keys(A).forEach(name => {
        const fn = A[name];
        A[name] = (el, ev) => {
            try {
                const kind = actionKinds[name];
                W.authorize(kind);
                const value = kind === 'read' ? fn(el, ev) : W.mutate(kind, () => fn(el, ev));
                if (photoChanges.has(name)) {
                    photosChanged(name === 'photo-default' ? el.dataset.id : '');
                    if (name === 'photo-delete') toast('照片已移入本地回收区，可在照片区恢复', 'ok');
                }
                if (name === 'set-host') {
                    render();
                    if (el.id) $('#' + el.id)?.focus();
                    toast(`所有 AI 操作将使用${HOST()}`, 'ok');
                }
                if (value?.catch) value.catch(fail);
                return value;
            } catch (e) {
                if (photoChanges.has(name) || CV?.mm?.id === 'm-live') refreshPhotoView(); else render();
                if (name === 'set-host' && el?.id) $('#' + el.id)?.focus();
                fail(e);
            }
        };
    });


    /* ---------- 事件 ---------- */
    let PWD = null;
    document.addEventListener('click', ev => {
        if (!ev.target.closest('.ctx')) closeMenu();
        if (ev.target.id === 'mask') return closeModal();
        if (ev.target.closest('[data-close]')) return closeModal();
        const a = ev.target.closest('[data-act]');
        if (a && A[a.dataset.act] && a.tagName !== 'INPUT' && a.tagName !== 'SELECT') {
            ev.preventDefault();
            return runAction(a.dataset.act, a, ev);
        }
        const im = ev.target.closest('img.pic');
        if (im && !im.closest('[data-tpl], #v-live')) {
            ev.preventDefault();
            return viewImg(im);
        }
        const pm = ev.target.closest('.pill[data-pm]');
        if (pm) {
            pm.classList.toggle('on');
            return;
        }
        const w = ev.target.closest('[data-pw]');
        if (w) return pwModal(pwOf(w.dataset.pw));
        const o = ev.target.closest('[data-open]');
        if (o) {
            if (S.pid !== o.dataset.open) {
                S.sel = {};
                S.old = {};
            }
            S.pid = o.dataset.open;
            S.page = 'project';
            return render();
        }
        const t = ev.target.closest('[data-tpl]');
        if (t) {
            S.tid = t.dataset.tpl;
            S.page = 'template';
            return render();
        }
        const pg = ev.target.closest('[data-page]');
        if (pg) {
            S.page = pg.dataset.page;
            if (S.page === 'prompts') PWFOCUS = true;
            save();
            return render();
        }
    });
    document.addEventListener('input', ev => {
        const a = ev.target.closest('input[data-act],textarea[data-act]');
        if (a && A[a.dataset.act]) runAction(a.dataset.act, a, ev);
    });
    document.addEventListener('dragstart', ev => {
        const c = ev.target.closest('[data-pwdrag]');
        if (!c) return;
        PWD = c.dataset.pwdrag;
        c.classList.add('dragging');
        if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', PWD);
        }
    });
    document.addEventListener('dragover', ev => {
        if (!PWD) return;
        const c = ev.target.closest('[data-pwdrag]');
        if (!c || c.dataset.pwdrag === PWD) return;
        ev.preventDefault();
        $$('.pc.over').forEach(x => x !== c && x.classList.remove('over'));
        c.classList.add('over');
    });
    document.addEventListener('drop', ev => {
        if (!PWD) return;
        const c = ev.target.closest('[data-pwdrag]');
        if (!c) return;
        ev.preventDefault();
        const from = D.PROMPTS.findIndex(p => p.id === PWD), to = D.PROMPTS.findIndex(p => p.id === c.dataset.pwdrag);
        PWD = null;
        if (from < 0 || to < 0 || from === to) return render();
        try {
            W.mutate('write', () => {
                const [p] = D.PROMPTS.splice(from, 1);
                D.PROMPTS.splice(to, 0, p);
            });
            render();
            toast('提示词顺序已保存到浏览器工作区', 'ok');
        } catch (e) {
            render();
            fail(e);
        }
    });
    document.addEventListener('dragend', () => {
        PWD = null;
        pwDropHint(0);
        $$('.pc').forEach(x => x.classList.remove('dragging', 'over'));
    });
    /* 整页拖进来就导入：一个 .md 一条 */
    const pwHasFile = ev => !!(ev.dataTransfer && Array.from(ev.dataTransfer.types || []).indexOf('Files') >= 0);

    function pwDropHint(on) {
        const o = $('#pw-drop');
        if (on && !o) {
            const d = document.createElement('div');
            d.id = 'pw-drop';
            d.className = 'pw-drop';
            d.innerHTML = '<div class="in"><b>松手后先检查提示词</b><span>支持 .md / .txt · 检查后再确认保存</span></div>';
            document.body.appendChild(d);
        }
        if (!on && o) o.remove();
    }

    document.addEventListener('dragover', ev => {
        if (S.page !== 'prompts' || !pwHasFile(ev)) return;
        ev.preventDefault();
        pwDropHint(1);
    });
    document.addEventListener('dragleave', ev => {
        if (S.page !== 'prompts' || !pwHasFile(ev) || ev.relatedTarget) return;
        pwDropHint(0);
    });
    document.addEventListener('drop', ev => {
        if (S.page !== 'prompts' || !pwHasFile(ev)) return;
        ev.preventDefault();
        pwDropHint(0);
        pwDrop(ev).catch(fail);
    });
    document.addEventListener('dragover', ev => {
        const target = ev.target.closest('[data-photo-drop]');
        if (!target) return;
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', ev => {
        if (!ev.target.closest('[data-photo-drop]')) return;
        ev.preventDefault();
        return photoFiles(Array.from(ev.dataTransfer?.files || [])).catch(fail);
    });
    document.addEventListener('contextmenu', ev => {
        const c = ev.target.closest('[data-ctx]');
        if (!c) return;
        ev.preventDefault();
        const [kind, a, b, d] = c.dataset.ctx.split(':');
        if (kind === 'pw') {
            const p = pwOf(a);
            if (!p) return;
            const on = !!S.pfav[p.id], nf = D.pfill(p).length;
            const tail = p.mine
                ? ['-', {
                    label: `${BTN.del}这条`,
                    icon: 'trash',
                    danger: true,
                    run: () => A['pw-del']({dataset: {id: p.id}})
                }]
                : ['-', {
                    label: p.off ? BTN.pwOn : BTN.pwOff,
                    icon: p.off ? 'check' : 'trash',
                    run: () => A['pw-off']({dataset: {id: p.id}})
                }];
            menu([{label: BTN.copyText, icon: 'copy', run: () => A['pw-copy']({dataset: {id: p.id}})},
                {label: on ? BTN.unfav : BTN.fav, icon: 'star', run: () => A['pw-fav-one']({dataset: {id: p.id}})},
                {label: BTN.inFolder, icon: 'folder', run: () => A['pw-folder']({dataset: {id: p.id}})},
                {
                    label: BTN.rename,
                    icon: 'edit',
                    run: () => A['pw-rename']({dataset: {id: p.id}})
                }].concat(tail), ev.clientX, ev.clientY);
            return;
        }
        if (kind === 'project') {
            const p = D.byId(a);
            menu([{
                label: BTN.intake,
                icon: 'plug',
                run: () => A['intake']({dataset: {id: p.id}})
            }, {
                label: BTN.makeCover,
                icon: 'img',
                run: () => A['make-cover']({dataset: {id: p.id}})
            }, {
                label: BTN.editProject,
                icon: 'edit',
                run: () => A['edit-proj']({dataset: {id: p.id}})
            }, {label: BTN.inFolder, icon: 'folder', run: () => A['open-folder']()}, '-', {
                label: `${BTN.del}内容`,
                icon: 'trash',
                danger: true,
                run: () => A['del-project']({dataset: {id: p.id}})
            }], ev.clientX, ev.clientY);
        }
        if (kind === 'mat') {
            const p = D.byId(a);
            menu(matItems(p, D.matOf(p, b)), ev.clientX, ev.clientY);
        }
        if (kind === 'cand') {
            const p = D.byId(a), m = D.matOf(p, b), c2 = D.candsOf(m).find(x => x.no === d);
            menu([{
                label: BTN.pickOne,
                icon: 'check',
                run: () => A['use-cand']({dataset: {p: p.id, m: m.id, no: c2.no}})
            }, {
                label: '看大图',
                icon: 'img',
                run: () => A['zoom']({dataset: {src: c2.img}})
            }, '-', {
                label: c2.fav ? '取消收藏' : '收藏',
                icon: 'heart',
                run: () => A['cand-fav']({dataset: {p: p.id, m: m.id, no: c2.no}})
            }], ev.clientX, ev.clientY);
        }
        if (kind === 'post') {
            const p = D.byId(a), x = p.posts.find(y => y.id === b), pub = pubOf(p, x.id);
            menu([{
                label: BTN.copyText + '文案',
                icon: 'copy',
                run: () => A['copy-text']({dataset: {p: p.id, id: x.id}})
            },
                {
                    label: pub ? BTN.pubEdit : BTN.pub,
                    icon: 'check',
                    run: () => A[pub ? 'pub-edit' : 'pub-add']({dataset: {p: p.id, id: x.id, day: x.date}})
                },
                ...(pub ? [{
                    label: BTN.unpub,
                    icon: 'trash',
                    danger: true,
                    run: () => A['pub-del']({dataset: {p: p.id, id: x.id}})
                }] : []),
                {label: BTN.inFolder, icon: 'folder', run: () => A['open-folder']()}], ev.clientX, ev.clientY);
        }
        if (kind === 'tshot') {
            const t = D.tplOf(a), i = +b, src = shotAt(t, i), isCover = i < 0 || src === t.img;
            const items = [];
            if (i >= 0 && !isCover) items.push({
                label: BTN.setCover,
                icon: 'check',
                run: () => A['tpl-cover']({dataset: {id: t.id, i}})
            });
            items.push({label: BTN.repShot, icon: 'img', run: () => A['tpl-shot-rep']({dataset: {id: t.id, i}})});
            items.push({label: '看大图', icon: 'fit', run: () => A['zoom']({dataset: {src}})});
            if (!isCover) {
                items.push('-');
                items.push({
                    label: BTN.del,
                    icon: 'trash',
                    danger: true,
                    run: () => A['tpl-shot-del']({dataset: {id: t.id, i}})
                });
            }
            menu(items, ev.clientX, ev.clientY);
        }
        if (kind === 'tpl') {
            const t = D.tplOf(a), n = W.templateSamples(t).length;
            menu([{
                label: BTN.useTemplate,
                icon: 'check',
                run: () => A['use-tpl']({dataset: {id: t.id}})
            }, ...(n ? [{
                label: `下载 ${n} 张样张 ZIP`,
                icon: 'down',
                run: () => A['dl']({dataset: {tid: t.id, n}})
            }] : []), {
                label: BTN.rename,
                icon: 'edit',
                run: () => A['rename']({dataset: {kind: 'template', id: t.id}})
            }], ev.clientX, ev.clientY);
        }
    });
    document.addEventListener('change', ev => {
        const a = ev.target.closest('select[data-act]') || ev.target.closest('input[data-act="task-pick"]');
        if (a && A[a.dataset.act]) runAction(a.dataset.act, a, ev);
    });
    document.addEventListener('keydown', ev => {
        if (ev.isComposing || ev.keyCode === 229) return;
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && PWUSE && $('#m-live') === PWUSE.mm) {
            ev.preventDefault();
            return A['pw-fill-copy']();
        }
        const typed = ev.target.closest && ev.target.closest('input, textarea');
        if ($('#v-live') && !typed) {
            const m = {
                Escape: 'close',
                ArrowLeft: 'prev',
                ArrowRight: 'next',
                '+': '+',
                '=': '+',
                '-': '-',
                '0': 'fit'
            }[ev.key];
            if (m && (m !== 'prev' && m !== 'next' || V8.list.length > 1)) {
                ev.preventDefault();
                const b = document.querySelector(`#v-live [data-vb="${m}"]`);
                if (b) b.click(); else if (m === 'close') closeView();
            }
        }
        if (ev.key === 'Enter' && ev.target.closest && ev.target.closest('[data-chanfree]')) {
            ev.preventDefault();
            return chanFree(ev.target.closest('[data-chanfree]').dataset.chanfree);
        }
        if (ev.key === 'Tab' && $('#m-live')) {
            const f = Array.from($('#m-live').querySelectorAll('button:not(:disabled),input,select,textarea,summary,a[href],[tabindex="0"]')).filter(x => x.getClientRects().length);
            if (f.length && (ev.shiftKey && document.activeElement === f[0] || !ev.shiftKey && document.activeElement === f[f.length - 1])) {
                ev.preventDefault();
                f[ev.shiftKey ? f.length - 1 : 0].focus();
            }
        }
        if (!typed && (ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role="button"][tabindex]')) {
            ev.preventDefault();
            ev.target.click();
        }
        if (ev.key === 'Escape') {
            closeModal();
            closeMenu();
        }
        if ((ev.metaKey || ev.ctrlKey) && ev.key === '[') {
            if (S.page === 'project') {
                S.page = 'projects';
                render();
            } else if (S.page === 'template') {
                S.page = 'templates';
                render();
            }
        }
        if (S.page === 'prompts' && !$('#m-live') && !$('#v-live')) pwKeys(ev, typed);
    });

    /* 打字进搜索框，↑↓ 选，Enter 打开使用，Esc 清空。 */
    function pwKeys(ev, typed) {
        const inKw = ev.target && ev.target.id === 'pw-kw';
        const list = pwList();
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            if (!inKw && typed) return;
            ev.preventDefault();
            S.psi = Math.max(0, Math.min(list.length - 1, S.psi + (ev.key === 'ArrowDown' ? 1 : -1)));
            render();
            const el = $('.pc.hi');
            el && el.scrollIntoView({block: 'nearest'});
            return;
        }
        if (ev.key === 'Enter') {
            if (!inKw && (typed || ev.target.closest?.('button,a,[role="button"]'))) return;
            ev.preventDefault();
            const p = list[S.psi < 0 ? 0 : S.psi];
            if (p) A['pw-copy']({dataset: {id: p.id}});
            return;
        }
        if (ev.key === 'Escape') {
            if (S.pkw) {
                ev.preventDefault();
                S.pkw = '';
                S.psi = -1;
                render();
                const i = $('#pw-kw');
                i && i.focus();
            }
            return;
        }
        if (!inKw && !typed && !ev.target.closest?.('button,a,[role="button"]') && ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
            const i = $('#pw-kw');
            if (!i) return;
            i.value = ev.key;
            S.pkw = i.value;
            S.psi = -1;
            render();
            const n = $('#pw-kw');
            n && n.focus();
        }
    }

    async function clipboardWrite(text) {
        try {
            if (navigator.clipboard?.writeText) {
                let timer;
                try {
                    await Promise.race([navigator.clipboard.writeText(text), new Promise((_resolve, reject) => {
                        timer = setTimeout(() => reject(Error('剪贴板响应超时')), 2500);
                    })]);
                    return true;
                } finally {
                    clearTimeout(timer);
                }
            }
        } catch (e) {
        }
        const active = document.activeElement, ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('aria-label', '待复制文本');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            return !!document.execCommand('copy');
        } catch (e) {
            return false;
        } finally {
            ta.remove();
            if (active?.isConnected) active.focus();
        }
    }

    async function copy(text, msg) {
        const ok = await clipboardWrite(text);
        toast(ok ? msg || '已复制，粘到微信就能用' : '复制失败，请手动选择文本复制', ok ? 'ok' : 'no');
        return ok;
    }

    function apply() {
        document.documentElement.dataset.motion = S.motion ? 'on' : 'off';
    }

    const route = h => {
        if (h === 'bad') {
            S.bad = true;
            return true;
        }
        if (h.startsWith('p/')) {
            S.sel = {};
            S.old = {};
            S.page = 'project';
            S.pid = h.slice(2);
            return true;
        }
        if (h.startsWith('t/')) {
            S.page = 'template';
            S.tid = h.slice(2);
            return true;
        }
        if (V[h]) {
            S.page = h;
            S.bad = false;
            return true;
        }
        return false;
    };
    window.addEventListener('hashchange', () => {
        if (route((location.hash || '').replace(/^#\/?/, ''))) {
            save();
            render();
        }
    });
    route((location.hash || '').replace(/^#\/?/, ''));
    if (!W.readonly) W.commit();
    apply();
    render();
})();
