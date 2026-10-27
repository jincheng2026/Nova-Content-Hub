(function (root) {
  'use strict';
  const num = value => Number(value).toLocaleString('zh-CN');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const likesText = (value, missing = 0, hasRows = true) => !hasRows ? '无评论' : value === null ? '获赞未取得' : missing ? `已知 ${num(value)} 赞 · ${num(missing)} 条未取得` : `${num(value)} 赞`;
  function statistics(data, video = 'all', level = 'all', sort = 'count') {
    const comments = data.comments.filter(c => (video === 'all' || c.content_id === video) && (level === 'all' || c.level === level));
    const reviewed = comments.filter(c => c.reviewed);
    const topics = data.topics.map(t => {
      const rows = reviewed.filter(c => c.topic_ids.includes(t.id));
      const known = rows.filter(c => c.likes !== null);
      return {...t, count: rows.length, likes: known.length ? known.reduce((sum,c) => sum + c.likes, 0) : null,
        likes_missing: rows.length - known.length, cids: rows.map(c => c.cid)};
    });
    const key = sort === 'likes' ? 'likes' : 'count';
    topics.sort((a,b) => (b[key] ?? -1) - (a[key] ?? -1) || b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {total: comments.length, reviewed: reviewed.length, unreviewed: comments.length - reviewed.length,
      tagged: reviewed.filter(c => c.topic_ids.length).length, untagged: reviewed.filter(c => !c.topic_ids.length).length,
      levels: Object.fromEntries(['top','reply','unknown'].map(k => [k,comments.filter(c => c.level === k).length])), topics};
  }
  function chartHTML(stats, selected = '') {
    if (!stats.reviewed) return '<p class="empty">当前范围没有已复核评论。可切换视频或评论层级。</p>';
    if (!stats.topics.length) return '<p class="empty">当前材料未归纳需求主题，原文保留在下方。</p>';
    if (!stats.topics.some(t => t.count)) return '<p class="empty">当前范围没有归入需求主题的已复核评论，原文仍可查看。</p>';
    const maxCount = Math.max(1,...stats.topics.map(t => t.count));
    const maxLikes = Math.max(1,...stats.topics.map(t => t.likes || 0));
    const knownLikes = stats.topics.map(t => t.likes).filter(value => value !== null);
    const likesLimit = knownLikes.length ? Math.max(...knownLikes) : null;
    const likesScale = likesLimit === null ? '获赞未取得' : likesLimit === 0 ? '当前 0 赞' : `0 至 ${num(likesLimit)}`;
    const head = `<div class="chart-head" aria-hidden="true"><span>需求主题</span><span>评论条数 <small>0 至 ${num(maxCount)}</small></span><span>这些评论的获赞 <small>${likesScale}</small></span></div>`;
    return head + stats.topics.map(t => `<div class="topic-row${selected === t.id ? ' selected' : ''}"><button class="topic-label" type="button" data-topic="${escape(t.id)}" aria-pressed="${selected === t.id}">${escape(t.label)}</button><div class="measure"><span class="metric-label">评论条数</span><div class="track"><i style="width:${100*t.count/maxCount}%"></i></div><b>${num(t.count)} 条</b></div><div class="measure likes"><span class="metric-label">这些评论的获赞</span><div class="track"><i style="width:${100*(t.likes || 0)/maxLikes}%"></i></div><b>${likesText(t.likes,t.likes_missing,!!t.count)}</b></div></div>`).join('');
  }
  root.CommentReport = {statistics, chartHTML, likesText};
  if (typeof document === 'undefined') return;
  const node = document.getElementById('comment-report-data');
  if (!node) return;
  const data = JSON.parse(node.textContent);
  const get = id => document.getElementById(id);
  const controls = {video:get('video-filter'),level:get('level-filter'),sort:get('sort-filter'),search:get('comment-search')};
  const rows = new Map(Array.from(document.querySelectorAll('tr[data-cid]'),row => [row.dataset.cid,row]));
  let selectedTopic = '';
  const current = () => statistics(data,controls.video?.value || 'all',controls.level?.value || 'all',controls.sort?.value || 'count');
  function matches(c) {
    return (!controls.video || controls.video.value === 'all' || c.content_id === controls.video.value) &&
      (!controls.level || controls.level.value === 'all' || c.level === controls.level.value) &&
      (!selectedTopic || c.reviewed && c.topic_ids.includes(selectedTopic)) &&
      (!controls.search || c.text.toLocaleLowerCase().includes(controls.search.value.trim().toLocaleLowerCase()));
  }
  function filterTable() {
    let visible = 0;
    for (const c of data.comments) {
      const row = rows.get(c.cid);
      if (row) { row.hidden = !matches(c); if (!row.hidden) visible++; }
    }
    const name = data.topics.find(t => t.id === selectedTopic)?.label;
    if (get('comment-count')) get('comment-count').textContent = `当前显示 ${num(visible)} / ${num(data.comments.length)} 条评论${name ? ' · ' + name : ''}。${visible ? '' : '没有匹配结果，可清除筛选。'}`;
  }
  function evidence(stats) {
    const panel = get('topic-evidence');
    if (!panel) return;
    const topic = stats.topics.find(t => t.id === selectedTopic);
    panel.hidden = !topic;
    if (!topic) {panel.replaceChildren();return;}
    const candidates = data.comments.filter(c => topic.cids.includes(c.cid)).sort((a,b) => (b.likes ?? -1) - (a.likes ?? -1));
    const excerpts = candidates.slice(0,3).map(c => `<blockquote><p data-original="comment:${escape(c.cid)}">${escape(c.text)}</p><cite>${escape(c.video_title)} · ${likesText(c.likes)} · <a href="#${rows.get(c.cid)?.id || ''}" data-source="comment:${escape(c.cid)}">定位这条评论</a></cite></blockquote>`).join('');
    panel.innerHTML = `<h3>${escape(topic.label)}</h3><p>${escape(topic.description)}</p><p class="meta">当前范围 ${num(topic.count)} 条。下方列出${Math.min(candidates.length,3)} 条原话；完整明细已按这个主题筛选。</p>${excerpts || '<p>当前范围没有属于该主题的已复核评论。</p>'}<a href="#originals">查看对应评论明细</a>`;
  }
  function update() {
    const stats = current();
    if (get('theme-chart')) get('theme-chart').innerHTML = chartHTML(stats,selectedTopic);
    if (get('theme-scope')) get('theme-scope').textContent = `当前范围 ${num(stats.total)} 条，其中 ${num(stats.reviewed)} 条已复核、${num(stats.tagged)} 条有需求标签。${num(stats.untagged)} 条已复核评论未归入需求主题，${num(stats.unreviewed)} 条尚未复核。`;
    evidence(stats);filterTable();
  }
  function resetFilters() {
    if (controls.video) controls.video.value = 'all';
    if (controls.level) controls.level.value = 'all';
    if (controls.search) controls.search.value = '';
    selectedTopic = '';update();
  }
  for (const control of [controls.video,controls.level,controls.sort]) control?.addEventListener('change',update);
  controls.search?.addEventListener('input',filterTable);
  get('clear-filters')?.addEventListener('click',resetFilters);
  get('theme-chart')?.addEventListener('click',event => {
    const button = event.target.closest('[data-topic]');
    if (!button) return;
    selectedTopic = selectedTopic === button.dataset.topic ? '' : button.dataset.topic;
    update();
    // Restore keyboard focus after replacing the rows.
    Array.from(get('theme-chart').querySelectorAll('[data-topic]')).find(x => x.dataset.topic === button.dataset.topic)?.focus();
  });
  function revealSource(target, behavior = 'auto') {
    if (target.matches('tr')) resetFilters();
    if (target.matches('details')) target.open = true;
    let parent = target.parentElement;
    while (parent) {if (parent.matches('details')) parent.open = true; parent = parent.parentElement;}
    target.setAttribute('tabindex','-1');
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start',behavior});
  }
  document.addEventListener('click',event => {
    if (event.target.closest('a[href="#originals"]') && get('comment-browser')) get('comment-browser').open = true;
    const link = event.target.closest('a[data-source]');
    if (!link) return;
    const target = get(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    revealSource(target, matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
    try {history.replaceState(null,'',link.getAttribute('href'));} catch (_) { /* File viewers may not expose History. */ }
  });
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const resize = () => document.documentElement.style.setProperty('--nav-height',`${navbar.offsetHeight}px`);
    resize(); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(navbar);
  }
  if (typeof IntersectionObserver !== 'undefined') {
    const links = Array.from(document.querySelectorAll('.nav-link'));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) for (const link of links) {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
      }
    },{rootMargin:'-15% 0px -65% 0px'});
    document.querySelectorAll('section[id]').forEach(section => observer.observe(section));
  }
  update();
  function revealHash() {
    const hash = root.location?.hash || '';
    if (hash === '#originals' && get('comment-browser')) get('comment-browser').open = true;
    if (!hash.startsWith('#source-')) return;
    const target = get(hash.slice(1));
    if (target) revealSource(target);
  }
  revealHash();
  root.addEventListener?.('hashchange',revealHash);
})(globalThis);
