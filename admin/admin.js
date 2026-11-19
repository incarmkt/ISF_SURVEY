/* ISF 수요조사 현황 - 화면 동작 */

// ─────────────── 바꿀 수 있는 값 ───────────────
const CONFIG = {
  // Apps Script 웹 앱 주소 (FA 페이지 app.js와 같은 주소)
  API_URL: 'https://script.google.com/macros/s/AKfycbw9Ve3k9fg9Vb8z96iH87WusRqFfLaKgB_IrQufZNM1FB40OlXz3sBktkR2MkmD0rpmkw/exec',
  PAGE: 20,        // 파트너 표 한 번에 보여줄 줄 수
  WAIT_PAGE: 20,   // 미응답자 표 한 번에 보여줄 줄 수
  MISS_SHOW: 5     // 관리자 미입력 파트너 처음에 보여줄 줄 수
};
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
// ──────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const KEY = 'isf_admin_pw';
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ss = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return mem.pw; } },
  set(v) { mem.pw = v; try { sessionStorage.setItem(KEY, v); } catch (e) { /* 저장 안 되는 브라우저는 메모리에만 */ } },
  clear() { mem.pw = ''; try { sessionStorage.removeItem(KEY); } catch (e) { /* noop */ } }
};
const mem = { pw: '' };
const st = { dShow: CONFIG.PAGE, pSort: 'rate_asc', data: null, pShow: CONFIG.PAGE, wShow: CONFIG.WAIT_PAGE, missAll: false, open: '' };

async function api(payload) {
  try {
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    return { ok: false, net: true, message: '네트워크 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.' };
  }
}

// ─────────────── 로그인 ───────────────
function showLogin(msg) {
  $('#view-login').hidden = false;
  $('#view-dash').hidden = true;
  ['#bar-title', '#bar-tools'].forEach((s) => { $(s).hidden = true; });
  const err = $('#login-err');
  err.hidden = !msg;
  err.textContent = msg || '';
  $('#login-form').classList.toggle('is-err', !!msg);
  $('#pw').value = '';
  $('#pw').focus();
}
function showDash() {
  $('#view-login').hidden = true;
  $('#view-dash').hidden = false;
  ['#bar-title', '#bar-tools'].forEach((s) => { $(s).hidden = false; });
}

$('#pw-eye').addEventListener('click', () => {
  const i = $('#pw');
  i.type = i.type === 'password' ? 'text' : 'password';
  $('#pw-eye').setAttribute('aria-label', i.type === 'password' ? '비밀번호 보기' : '비밀번호 숨기기');
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#pw').value.trim();
  if (!pw) return showLogin('비밀번호를 입력해 주세요.');
  const btn = $('#login-btn');
  btn.disabled = true; btn.textContent = '확인 중…';
  const res = await api({ action: 'stats', password: pw });
  btn.disabled = false; btn.textContent = '확인';
  if (!res.ok) {
    if (res.auth === false && !res.locked) {
      const left = Number(res.left);
      return showLogin(left > 0
        ? `비밀번호가 맞지 않습니다. (남은 횟수 ${left}회)\n5회 틀리면 10분간 입력이 제한됩니다.`
        : '비밀번호를 5회 틀려 10분간 입력이 제한됩니다.\n잠시 후 다시 시도해 주세요.');
    }
    return showLogin(res.message);
  }
  ss.set(pw);
  showDash();
  render(res);
});

$('#logout-btn').addEventListener('click', () => {
  ss.clear();
  st.data = null;
  showLogin('');
});

// ─────────────── 불러오기 ───────────────
async function load(refresh) {
  const pw = ss.get();
  if (!pw) return showLogin('');
  showDash();
  const btn = $('#refresh-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span class="lbl"> 불러오는 중</span>';
  if (!st.data) { $('#dash-loading').hidden = false; $('#dash').hidden = true; }
  $('#dash-err').hidden = true;
  const res = await api({ action: 'stats', password: pw, refresh: !!refresh });
  btn.disabled = false; btn.innerHTML = '↻<span class="lbl"> 새로고침</span>';
  $('#dash-loading').hidden = true;
  if (!res.ok) {
    if (res.auth === false) { ss.clear(); return showLogin(res.locked ? res.message : '비밀번호가 바뀌었거나 맞지 않습니다.\n다시 입력해 주세요.'); }
    $('#dash-err').textContent = res.message || '불러오지 못했습니다.';
    $('#dash-err').hidden = false;
    return;
  }
  render(res);
}
$('#refresh-btn').addEventListener('click', () => load(true));

// ─────────────── 그리기 ───────────────
function render(d) {
  st.data = d;
  $('#dash-loading').hidden = true;
  $('#dash').hidden = false;
  $('#upd-text').textContent = `마지막 갱신 ${d.updatedAt}`;
  $('#m-upd').textContent = `마지막 갱신 ${d.updatedAt}`;

  const t = d.total, m = d.mgr;
  const answered = t.go + t.no;
  const rate = pct(answered, t.t);
  $('#k-rate').textContent = `${rate}%`;
  $('#k-rate-sub').textContent = `달성 대상 ${fmt(t.t)}명 중 ${fmt(answered)}명 응답`;
  $('#k-rate-bar').style.width = `${rate}%`;
  const mrate = pct(m.entered, m.partners);
  $('#k-mrate').textContent = `${mrate}%`;
  $('#k-mrate-sub').textContent = `TO 있는 파트너 ${fmt(m.partners)}곳 중 ${fmt(m.entered)}곳 입력`;
  $('#k-mrate-bar').style.width = `${mrate}%`;
  $('#k-go').textContent = fmt(t.go);
  $('#k-go-sub').textContent = `응답자의 ${pct(t.go, answered)}%`;
  $('#k-no').textContent = fmt(t.no);
  $('#k-no-sub').textContent = `응답자의 ${pct(t.no, answered)}%`;
  const missTo = m.missing.reduce((a, x) => a + (Number(x[2]) || 0), 0);
  $('#k-wait').textContent = fmt(t.wait + missTo);
  $('#k-wait-sub').textContent = `FA ${fmt(t.wait)} + 관리자 ${fmt(missTo)}`;
  $('#k-all').textContent = fmt(t.go + t.comp + m.sum);
  $('#k-all-sub').textContent = `FA ${fmt(t.go)} + 동반 ${fmt(t.comp)} + 관리자 ${fmt(m.sum)}`;

  // 부문별
  $('#div-rows').innerHTML = d.divisions.map((v) => {
    const w = (x) => (v.t ? (x / v.t) * 100 : 0).toFixed(1);
    return `<div class="row"><div class="row__name">${esc(v.d)}<small>${fmt(v.t)}명</small></div>
      <div class="stack" title="참석 ${fmt(v.go)} · 불참 ${fmt(v.no)} · 미응답 ${fmt(v.wait)}"><i class="go" style="width:${w(v.go)}%"></i><i class="no" style="width:${w(v.no)}%"></i><i class="wait" style="width:${w(v.wait)}%"></i></div>
      <div class="row__pct">${Math.round(pct(v.go + v.no, v.t))}%<small>응답률</small></div></div>`;
  }).join('') || '<div class="empty">데이터가 없습니다.</div>';

  // 관리자
  const mp = pct(m.sum, m.to);
  $('#m-sum').textContent = fmt(m.sum);
  $('#m-to').textContent = `/ 관리자 TO ${fmt(m.to)}명`;
  $('#m-pct').textContent = `${Math.round(mp)}%`;
  $('#m-bar').style.width = `${Math.min(100, mp)}%`;
  $('#m-miss-n').textContent = `${fmt(m.missing.length)}곳`;
  renderMiss();

  // 구간별 (높은 구간이 위)
  $('#grade-rows').innerHTML = d.grades.slice().reverse().map(([g, tt, go, no]) => {
    const p = Math.round(pct(go, go + no));
    return `<div class="mini" title="대상 ${fmt(tt)} · 참석 ${fmt(go)} · 불참 ${fmt(no)}"><span>${esc(g)}</span><div class="track"><i style="width:${p}%"></i></div><b>${go + no ? p + '%' : '-'}</b></div>`;
  }).join('');

  renderTrend(d);
  fillFilters();
  renderPartners();
  renderWaiting();
}

function renderMiss() {
  const list = st.data.mgr.missing;
  const rows = st.missAll ? list : list.slice(0, CONFIG.MISS_SHOW);
  $('#m-body').innerHTML = rows.map(([dv, p, to]) => `<tr><td>${esc(dv)}</td><td>${esc(p)}</td><td class="num">${fmt(to)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">모든 파트너가 입력했습니다.</td></tr>';
  $('#m-wrap').classList.toggle('scroll-y', st.missAll);
  $('#m-more').innerHTML = list.length > CONFIG.MISS_SHOW
    ? `TO 많은 순 · <button type="button" id="m-toggle">${st.missAll ? '접기 ‹' : `전체 ${fmt(list.length)}곳 보기 ›`}</button>`
    : (list.length ? 'TO 많은 순' : '');
  const b = $('#m-toggle');
  if (b) b.onclick = () => { st.missAll = !st.missAll; renderMiss(); };
}

function renderTrend(d) {
  const box = $('#trend-box');
  if (!d.trend.length) { box.innerHTML = '<div class="trend-empty">아직 제출된 응답이 없습니다.</div>'; return; }
  let acc = 0;
  const pts = d.trend.map(([day, n]) => [day, (acc += n)]);
  const W = 300, H = 150, top = 14, bot = 140;
  const max = acc || 1;
  const x = (i) => (pts.length === 1 ? W / 2 : 10 + (i * (W - 20)) / (pts.length - 1));
  const y = (v) => bot - (v / max) * (bot - top);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const md = (s) => s.slice(5).replace('-', '.');
  const mid = pts[Math.floor((pts.length - 1) / 2)];
  const todayN = (d.trend.find((r) => r[0] === d.today) || [0, 0])[1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="날짜별 누적 응답, 현재 ${fmt(last[1])}명">
      <line x1="0" y1="${bot}" x2="${W}" y2="${bot}" stroke="#E3EAF4"/>
      <line x1="0" y1="${(top + bot) / 2}" x2="${W}" y2="${(top + bot) / 2}" stroke="#EEF2F8"/>
      <line x1="0" y1="${top}" x2="${W}" y2="${top}" stroke="#EEF2F8"/>
      <polyline points="${line}" fill="none" stroke="#1D6FD8" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:4px"><span>${md(pts[0][0])}</span>${pts.length > 2 ? `<span>${md(mid[0])}</span>` : ''}${pts.length > 1 ? `<span>${md(last[0])}</span>` : ''}</div>
    <div style="margin-top:8px;font-size:12.5px">누적 <b>${fmt(last[1])}명</b> · 오늘 <b>+${fmt(todayN)}명</b> 응답</div>`;
}

// ─────────────── 필터 ───────────────
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
function setOptions(sel, all, items, keep) {
  const cur = keep ? sel.value : '';
  sel.innerHTML = `<option value="">${all}</option>` + items.map((v) => `<option>${esc(v)}</option>`).join('');
  if (items.includes(cur)) sel.value = cur;
}
function fillFilters() {
  const d = st.data;
  const divs = d.divisions.map((v) => v.d);
  setOptions($('#p-div'), '전체 부문', uniq(divs.concat(d.partners.map((p) => p[0]))), true);
  fillHq(true);
  setOptions($('#w-div'), '전체 부문', uniq(d.waiting.map((w) => w[0])), true);
  fillWaitPartner(true);
  setOptions($('#w-grade'), '전체 구간', d.grades.map((g) => g[0]).filter((g) => d.waiting.some((w) => w[4] === g)), true);
}
function fillHq(keep) {
  const dv = $('#p-div').value;
  setOptions($('#p-hq'), '전체 총괄', uniq(st.data.partners.filter((p) => !dv || p[0] === dv).map((p) => p[1])), keep);
}
function fillWaitPartner(keep) {
  const dv = $('#w-div').value;
  setOptions($('#w-part'), '전체 파트너', uniq(st.data.waiting.filter((w) => !dv || w[0] === dv).map((w) => w[1])), keep);
}

$('#p-div').addEventListener('change', () => { fillHq(false); st.pShow = CONFIG.PAGE; renderPartners(); });
$('#p-hq').addEventListener('change', () => { st.pShow = CONFIG.PAGE; renderPartners(); });
$('#p-q').addEventListener('input', () => { st.pShow = CONFIG.PAGE; renderPartners(); });
$('#w-div').addEventListener('change', () => { fillWaitPartner(false); st.wShow = CONFIG.WAIT_PAGE; renderWaiting(); });
$('#w-part').addEventListener('change', () => { st.wShow = CONFIG.WAIT_PAGE; renderWaiting(); });
$('#w-grade').addEventListener('change', () => { st.wShow = CONFIG.WAIT_PAGE; renderWaiting(); });

// ─────────────── 파트너별 상세 ───────────────
function partnerRows(all) {
  const dv = $('#p-div').value, hq = $('#p-hq').value, q = $('#p-q').value.trim().toLowerCase();
  return st.data.partners
    .filter((p) => (!dv || p[0] === dv) && (!hq || p[1] === hq) && (!q || String(p[2]).toLowerCase().includes(q)))
    .map((p) => ({ p, rate: p[3] ? (p[4] + p[5]) / p[3] : -1 }))
    .filter((x) => all || !isDone(x.p))
    .sort(SORTS[st.pSort] || SORTS.rate_asc)
    .map((x) => x.p);
}
// 응답 완료 = 대상이 있고 미응답 0명
const isDone = (p) => p[3] > 0 && p[6] === 0;
function renderDone() {
  const dv = $('#p-div').value, hq = $('#p-hq').value, q = $('#p-q').value.trim().toLowerCase();
  const done = st.data.partners
    .filter((p) => isDone(p) && (!dv || p[0] === dv) && (!hq || p[1] === hq) && (!q || String(p[2]).toLowerCase().includes(q)))
    .sort((a, b) => b[3] - a[3] || String(a[2]).localeCompare(String(b[2]), 'ko'));
  const total = st.data.partners.filter((p) => p[3] > 0 && (!dv || p[0] === dv) && (!hq || p[1] === hq)).length;
  $('#d-count').textContent = fmt(done.length) + '곳';
  const box = $('#d-body'), mode = box.dataset.mode;
  const shown = done.slice(0, st.dShow);
  const mgr = (mi, to) => (to > 0 ? (mi == null ? '<span class="chip chip--wait">미입력</span>' : fmt(mi) + '/' + fmt(to)) : '-');
  if (!done.length) {
    box.innerHTML = '<div class="d-empty">아직 응답을 모두 마친 파트너가 없습니다.</div>';
  } else if (mode === 'table') {
    box.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>파트너</th><th class="ctr">대상</th><th class="ctr">참석</th><th class="ctr">불참</th><th class="ctr">동반</th><th class="ctr">관리자</th></tr></thead><tbody>` +
      shown.map(([d, , n, t, go, no, , comp, mi, to]) => `<tr><td>${esc(n)}<small class="sub">${esc(d)}</small></td><td class="ctr">${fmt(t)}</td><td class="ctr">${fmt(go)}</td><td class="ctr">${fmt(no)}</td><td class="ctr">${fmt(comp)}</td><td class="ctr">${mgr(mi, to)}</td></tr>`).join('') + '</tbody></table></div>';
  } else if (mode === 'chips') {
    box.innerHTML = '<div class="d-chips">' + shown.map(([d, , n, t, go, no, , comp]) =>
      `<div class="d-chip"><b>${esc(n)}</b><small>${esc(d)}</small><span>대상 ${fmt(t)} · 참석 <em>${fmt(go)}</em> · 동반 ${fmt(comp)}</span></div>`).join('') + '</div>';
  } else {
    box.innerHTML = `<div class="d-prog"><span>완료 ${fmt(done.length)}곳 / 대상 있는 파트너 ${fmt(total)}곳</span><i><b style="width:${total ? Math.round(done.length / total * 100) : 0}%"></b></i></div><ul class="d-list">` +
      shown.map(([d, , n, t, go, no, , comp]) => `<li><span class="ck">✓</span><div><b>${esc(n)}</b><small>${esc(d)}</small></div><span class="nums">참석 <em>${fmt(go)}</em> / ${fmt(t)}명${comp ? ` · 동반 ${fmt(comp)}` : ''}</span></li>`).join('') + '</ul>';
  }
  const rest = done.length - shown.length;
  $('#d-more').innerHTML = rest > 0 ? `<button type="button" id="d-more-btn">${fmt(Math.min(CONFIG.PAGE, rest))}곳 더 보기 ›</button>` : '';
  const b = $('#d-more-btn'); if (b) b.onclick = () => { st.dShow += CONFIG.PAGE; renderDone(); };
}
// 정렬 방식 (대상 0명 = 관리자만 있는 파트너는 항상 맨 뒤)
const last0 = (a, b) => (a.rate < 0) - (b.rate < 0);
const SORTS = {
  rate_asc:  (a, b) => last0(a, b) || a.rate - b.rate || b.p[6] - a.p[6] || b.p[3] - a.p[3],
  rate_desc: (a, b) => last0(a, b) || b.rate - a.rate || b.p[3] - a.p[3],
  wait_desc: (a, b) => b.p[6] - a.p[6] || a.rate - b.rate,
  t_desc:    (a, b) => b.p[3] - a.p[3] || a.rate - b.rate
};
const SORT_LABEL = { rate_asc: '응답률 낮은 순', rate_desc: '응답률 높은 순', wait_desc: '미응답 많은 순', t_desc: '대상 많은 순' };
function setSort(k) {
  st.pSort = k; st.pShow = CONFIG.PAGE;
  const lb = document.querySelector('#p-sort-label'); if (lb) lb.textContent = SORT_LABEL[k];
  document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === k));
  const sel = document.querySelector('#p-sort'); if (sel) sel.value = k;
  renderPartners();
}
function renderPartners() {
  renderDone();
  const all = partnerRows();
  const rows = all.slice(0, st.pShow);
  const mgrCell = (mi, to) => (to > 0 ? (mi == null ? '<span class="chip chip--wait">미입력</span>' : fmt(mi)) : '-');
  $('#p-body').innerHTML = rows.map((p) => {
    const [dv, , name, t, go, no, wait, comp, mi, to] = p;
    const r = t ? Math.round(((go + no) / t) * 100) : null;
    const open = st.open === name;
    let html = `<tr class="p-row${open ? ' is-open' : ''}" data-p="${esc(name)}" tabindex="0" aria-expanded="${open}">
      <td class="hide-m">${esc(dv)}</td><td>${esc(name)}<small class="only-m">${esc(dv)}</small></td>
      <td class="ctr">${fmt(t)}</td><td class="ctr">${fmt(go)}</td><td class="ctr hide-m">${fmt(no)}</td>
      <td class="ctr"><span class="chip ${wait ? 'chip--wait' : 'chip--zero'}">${fmt(wait)}</span></td>
      <td class="ctr">${r == null ? '-' : `<span class="pbar${r < 50 ? ' low' : ''}"><b>${r}%</b><span><i style="width:${r}%"></i></span></span>`}</td>
      <td class="ctr hide-m">${fmt(comp)}</td><td class="ctr hide-m bl">${mgrCell(mi, to)}</td><td class="ctr hide-m">${to > 0 ? fmt(to) : '-'}</td></tr>`;
    if (open) html += `<tr class="p-detail"><td colspan="10">${detailHtml(p)}</td></tr>`;
    return html;
  }).join('') || '<tr><td colspan="10" class="empty">조건에 맞는 파트너가 없습니다.</td></tr>';

  const more = all.length > rows.length ? ` · <button type="button" id="p-more-btn">${fmt(Math.min(CONFIG.PAGE, all.length - rows.length))}곳 더 보기 ›</button>` : '';
  $('#p-more').innerHTML = `응답 진행 중 ${fmt(all.length)}곳 중 ${fmt(rows.length)}곳 표시 · 파트너 클릭 시 미응답자 명단 확인 가능${more}`;
  const b = $('#p-more-btn');
  if (b) b.onclick = () => { st.pShow += CONFIG.PAGE; renderPartners(); };
}
function togglePartner(tr) {
  const name = tr.dataset.p;
  st.open = st.open === name ? '' : name;
  renderPartners();
}
$('#p-body').addEventListener('click', (e) => { const tr = e.target.closest('tr.p-row'); if (tr) togglePartner(tr); });
$('#p-body').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr.p-row');
  if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); togglePartner(tr); }
});

// ─────────────── 미응답자 명단 ───────────────
function waitRows() {
  const dv = $('#w-div').value, pt = $('#w-part').value, g = $('#w-grade').value;
  return st.data.waiting.filter((w) => (!dv || w[0] === dv) && (!pt || w[1] === pt) && (!g || w[4] === g));
}
function renderWaiting() {
  const all = waitRows();
  const rows = all.slice(0, st.wShow);
  $('#w-n').textContent = `${fmt(st.data.waiting.length)}명`;
  $('#w-body').innerHTML = rows.map((w) => `<tr><td class="hide-m">${esc(w[0])}</td><td>${esc(w[1])}</td><td>${esc(w[2])}</td><td class="hide-m">${esc(w[3])}</td><td><span class="chip chip--g">${esc(w[4])}</span></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">미응답자가 없습니다.</td></tr>';
  const more = all.length > rows.length ? ` · <button type="button" id="w-more-btn">${fmt(Math.min(CONFIG.WAIT_PAGE, all.length - rows.length))}명 더 보기 ›</button>` : '';
  $('#w-more').innerHTML = `${fmt(all.length)}명 중 ${fmt(rows.length)}명 표시 · 엑셀 다운로드 시 전체 명단 저장${more}`;
  const b = $('#w-more-btn');
  if (b) b.onclick = () => { st.wShow += CONFIG.WAIT_PAGE; renderWaiting(); };
}

// ─────────────── 엑셀 다운로드 ───────────────
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  if (!xlsxLoading) {
    xlsxLoading = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = XLSX_URL; s.onload = ok;
      s.onerror = () => { xlsxLoading = null; no(new Error('xlsx')); };
      document.head.appendChild(s);
    });
  }
  return xlsxLoading;
}
async function download(btn, fileBase, header, rows, widths) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = '만드는 중…';
  try {
    await loadXlsx();
    const ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, fileBase.slice(0, 31));
    const stamp = (st.data.updatedAt || '').replace(/[.: ]/g, '');
    XLSX.writeFile(wb, `${fileBase}_${stamp}.xlsx`);
  } catch (e) {
    alertBox('엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}
function alertBox(msg) {
  const el = $('#dash-err');
  el.textContent = msg; el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#p-xlsx').addEventListener('click', (e) => {
  const rows = partnerRows(true).map(([dv, hq, name, t, go, no, wait, comp, mi, to]) => [
    dv, hq, name, t, go, no, wait, t ? Math.round(((go + no) / t) * 1000) / 10 : '', comp,
    to > 0 ? (mi == null ? '미입력' : mi) : '', to > 0 ? to : ''
  ]);
  download(e.currentTarget, 'ISF_파트너별현황',
    ['부문', '총괄', '파트너', '대상', '참석', '불참', '미응답', '응답률(%)', '동반', '관리자 입력 인원', '관리자 TO'],
    rows, [12, 14, 18, 7, 7, 7, 8, 10, 7, 14, 10]);
});
$('#w-xlsx').addEventListener('click', (e) => {
  download(e.currentTarget, 'ISF_미응답자명단', ['부문', '파트너', '이름', '사원번호', '최종달성'],
    waitRows().map((w) => [w[0], w[1], w[2], String(w[3]), w[4]]), [12, 18, 10, 12, 12]);
});

// ─────────────── 시작 ───────────────
if (ss.get()) load(false); else showLogin('');


document.addEventListener('change', (e) => { if (e.target.id === 'p-sort') setSort(e.target.value); });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (b) setSort(b.dataset.sort); });

// ─────────────── 파트너 펼침 상세 ───────────────
function mgrInfo(p) {
  const [, , , , , , , , mi, to, mn, me, mt] = p;
  if (!(to > 0)) return null;
  return { to, mi, done: mi != null, name: mn || '-', emp: me || '-', at: mt || '' };
}
function detailHtml(p) {
  const [, , name, t, go, no, wait, comp] = p;
  const ws = st.data.waiting.filter((w) => w[1] === name);
  const m = mgrInfo(p);
  const box = (k, v, cls) => `<div class="dt-num${cls ? ' ' + cls : ''}"><span>${k}</span><b>${v}</b></div>`;
  const mgr = m ? `<div class="dt-card dt-mgr">
      <h4>관리자 <span class="st ${m.done ? 'ok' : 'no'}">${m.done ? '입력 완료' : '미입력'}</span></h4>
      <div class="dt-big"><b>${m.done ? fmt(m.mi) : '-'}</b><span>/ TO ${fmt(m.to)}명</span></div>
      <dl><dt>관리자</dt><dd>${esc(m.name)}</dd><dt>사원번호</dt><dd>${esc(m.emp)}</dd>${m.done ? `<dt>입력일시</dt><dd>${esc(m.at || '-')}</dd>` : ''}</dl>
    </div>` : `<div class="dt-card dt-mgr dt-mgr--none"><h4>관리자</h4><p>이 파트너는 관리자 TO가 없습니다.</p></div>`;
  return `<div class="dt-grid">
    <div class="dt-card">
      <h4>FA 응답 현황</h4>
      <div class="dt-nums">${box('대상', fmt(t))}${box('참석', fmt(go), 'go')}${box('불참', fmt(no))}${box('미응답', fmt(wait), wait ? 'wait' : '')}${box('동반', fmt(comp))}</div>
      <h5>미응답자 ${fmt(ws.length)}명</h5>
      ${ws.length ? `<div class="wl">${ws.map((w) => `<span>${esc(w[2])}<small>${esc(w[3])} · ${esc(w[4])}</small></span>`).join('')}</div>` : '<p class="dt-ok">모두 응답했습니다.</p>'}
    </div>${mgr}</div>`;
}

// ─────────────── KPI 상세 팝업 ───────────────
function openPop(title, html) {
  $('#pop-title').textContent = title;
  $('#pop-time').textContent = '기준 ' + (st.data.updatedAt || '');
  $('#pop-body').innerHTML = html;
  $('#pop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closePop() { $('#pop').hidden = true; document.body.style.overflow = ''; }
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closePop();
  if (e.target.closest('#k-wait-btn')) openPop('미응답 상세', waitPopHtml());
  if (e.target.closest('#k-all-btn')) openPop('예상 총 인원 상세', allPopHtml());
  if (e.target.closest('#pp-to-wait')) openPop('미응답 상세', waitPopHtml());
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pop').hidden) closePop(); });

// 미응답자가 응답한다고 가정한 예상치 (구간별 현재 참석률·평균 동반 적용 / 최대치)
function estimate() {
  const d = st.data, t = d.total, m = d.mgr;
  const allRate = t.go + t.no ? t.go / (t.go + t.no) : 0;
  const rows = d.grades.map(([g, tt, go, no, comp, lim, wait]) => {
    tt = Number(tt) || 0; go = Number(go) || 0; no = Number(no) || 0; comp = Number(comp) || 0;
    wait = (wait === undefined || wait === null || wait === '') ? Math.max(0, tt - go - no) : Number(wait) || 0;
    lim = Number(lim) || 0;
    const rate = go + no ? go / (go + no) : allRate;
    const avgComp = go ? comp / go : 0;
    const eGo = wait * rate, eComp = Math.min(eGo * avgComp, eGo * lim);
    return { g, tt, go, no, comp, lim, wait, eGo, eComp, maxComp: wait * lim };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const missTo = m.missing.reduce((a, x) => a + (Number(x[2]) || 0), 0);
  const enteredTo = m.to - missTo;
  const mRate = enteredTo ? m.sum / enteredTo : 1;
  const now = t.go + t.comp + m.sum;
  return { rows, now, wait: t.wait, eGo: Math.round(sum('eGo')), eComp: Math.round(sum('eComp')), maxComp: sum('maxComp'),
           missTo, eMgr: Math.round(missTo * Math.min(1, mRate)) };
}

var POP_V = 'I';
function waitPopHtml() {
  const old = !(st.data.grades[0] && st.data.grades[0].length >= 7);
  const warn = old ? '<p class="pp-warn">Apps Script가 최신 버전(v46)이 아니라 구간별 동반 한도를 못 받아왔어요. 새 버전 배포 후 [대시보드 숫자 즉시 갱신]을 눌러주세요.</p>' : '';
  return warn + waitPopHtml0();
}
function waitPopHtml0() {
  const d = st.data, t = d.total, m = d.mgr, e = estimate();
  const rows = e.rows.slice().reverse().map((r) => `<tr><td>${esc(r.g)}</td><td class="w">${fmt(r.wait)}</td><td class="hide-m">${r.lim ? r.lim + '명' : '-'}</td><td>${fmt(r.maxComp)}</td><td class="em">${fmt(r.wait + r.maxComp)}</td></tr>`).join('');
  const addE = e.eGo + e.eComp + e.eMgr, addM = e.wait + e.maxComp + e.missTo;
  const est = e.now + addE, max = e.now + addM;
  let bottom = '';
  if (POP_V === 'A') {
    bottom = `<div class="pv-a">
        <div class="pv-a__c main"><span>예상 인원</span><b>${fmt(est)}<i>명</i></b><small>지금 응답 추세 적용</small></div>
        <div class="pv-a__c"><span>최대 인원</span><b>${fmt(max)}<i>명</i></b><small>미응답 전원 참석 시</small></div>
      </div>`;
  } else if (POP_V === 'B') {
    const w = (x) => Math.max(2, Math.round(x / max * 100));
    bottom = `<div class="pv-b">
        <div class="pv-b__bar"><i class="now" style="width:${w(e.now)}%"></i><i class="est" style="width:${w(est) - w(e.now)}%"></i><i class="max" style="width:${100 - w(est)}%"></i></div>
        <div class="pv-b__lg">
          <div><em class="now"></em>현재<b>${fmt(e.now)}</b></div>
          <div><em class="est"></em>예상<b>${fmt(est)}</b></div>
          <div><em class="max"></em>최대<b>${fmt(max)}</b></div>
        </div></div>`;
  } else if (POP_V === 'I') {
    const w = Math.max(2, Math.round(e.now / max * 100));
    const cols = [
      { k: 'now', l: '현재', s: '지금까지 응답', tot: fmt(e.now), v: [t.go, t.comp, m.sum] },
      { k: 'add', l: '미응답 추가', s: '전원 참석 + 동반 최대', tot: fmt(addM), v: [e.wait, e.maxComp, e.missTo], plus: true },
      { k: 'max', l: '최대', s: '', tot: fmt(max), v: [t.go + e.wait, t.comp + e.maxComp, m.sum + e.missTo] }
    ];
    bottom = `<table class="pv-i"><thead><tr><th></th>${cols.map((c) => `<th class="${c.k}"><span><em class="${c.k}"></em>${c.l}</span><b>${c.tot}</b>${c.s ? `<small>${c.s}</small>` : '<small>&nbsp;</small>'}</th>`).join('')}</tr>
        <tr class="bar"><td></td><td colspan="3"><div class="pv-b__bar"><i class="now" style="width:${w}%"></i><i class="add" style="width:${100 - w}%"></i></div></td></tr></thead>
      <tbody>${['FA', '동반', '관리자'].map((l, i) => `<tr><td>${l}</td>${cols.map((c) => `<td class="${c.k}">${c.plus ? '+' : ''}${fmt(c.v[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else if (POP_V === 'H') {
    const w = Math.max(2, Math.round(e.now / max * 100));
    const bar = `<div class="pv-b__bar"><i class="now" style="width:${w}%"></i><i class="add" style="width:${100 - w}%"></i></div>`;
    const card = (k, l, s, tot, fa, cp, mg) => `<div class="pv-g__c ${k}"><span><em class="${k}"></em>${l}</span><b>${fmt(tot)}<i>명</i></b><small>${s}</small>
        <dl><dt>FA</dt><dd>${fmt(fa)}</dd><dt>동반</dt><dd>${fmt(cp)}</dd><dt>관리자</dt><dd>${fmt(mg)}</dd></dl></div>`;
    bottom = `${bar}<div class="pv-g pv-g--2">
        ${card('now', '현재', '지금까지 응답한 인원', e.now, t.go, t.comp, m.sum)}
        <div class="pv-plus">+${fmt(addM)}</div>
        ${card('max', '최대', '미응답 전원 참석 + 동반 최대', max, t.go + e.wait, t.comp + e.maxComp, m.sum + e.missTo)}
      </div>`;
  } else if (POP_V === 'F' || POP_V === 'G') {
    const w = (x) => Math.max(2, Math.round(x / max * 100));
    const bar = `<div class="pv-b__bar"><i class="now" style="width:${w(e.now)}%"></i><i class="est" style="width:${w(est) - w(e.now)}%"></i><i class="max" style="width:${100 - w(est)}%"></i></div>`;
    const cols = [
      { k: 'now', l: '현재', s: '지금까지 응답', tot: e.now, fa: t.go, cp: t.comp, mg: m.sum },
      { k: 'est', l: '예상', s: '응답 추세 적용', tot: est, fa: t.go + e.eGo, cp: t.comp + e.eComp, mg: m.sum + e.eMgr },
      { k: 'max', l: '최대', s: '전원 참석 시', tot: max, fa: t.go + e.wait, cp: t.comp + e.maxComp, mg: m.sum + e.missTo }
    ];
    if (POP_V === 'F') {
      bottom = `${bar}<table class="pp-tbl pv-f"><thead><tr><th></th>${cols.map((c) => `<th class="${c.k}"><span><em class="${c.k}"></em>${c.l}</span><b>${fmt(c.tot)}</b><small>${c.s}</small></th>`).join('')}</tr></thead>
        <tbody>${[['FA', 'fa'], ['동반', 'cp'], ['관리자', 'mg']].map(([l, k]) => `<tr><td>${l}</td>${cols.map((c) => `<td class="${c.k}">${fmt(c[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else {
      bottom = `${bar}<div class="pv-g">${cols.map((c) => `<div class="pv-g__c ${c.k}"><span><em class="${c.k}"></em>${c.l}</span><b>${fmt(c.tot)}<i>명</i></b><small>${c.s}</small>
        <dl><dt>FA</dt><dd>${fmt(c.fa)}</dd><dt>동반</dt><dd>${fmt(c.cp)}</dd><dt>관리자</dt><dd>${fmt(c.mg)}</dd></dl></div>`).join('')}</div>`;
    }
  } else if (POP_V === 'D' || POP_V === 'E') {
    const w = (x) => Math.max(2, Math.round(x / max * 100));
    const bar = `<div class="pv-b__bar"><i class="now" style="width:${w(e.now)}%"></i><i class="est" style="width:${w(est) - w(e.now)}%"></i><i class="max" style="width:${100 - w(est)}%"></i></div>`;
    const row = (k, a, b, c) => `<tr><td>${k}</td><td>${fmt(a)}</td><td>${fmt(b)}</td><td>${fmt(c)}</td></tr>`;
    const body = row('FA', t.go, t.go + e.eGo, t.go + e.wait) + row('동반', t.comp, t.comp + e.eComp, t.comp + e.maxComp) + row('관리자', m.sum, m.sum + e.eMgr, m.sum + e.missTo);
    if (POP_V === 'D') {
      bottom = `${bar}<table class="pp-tbl pv-d"><thead><tr><th></th><th><em class="now"></em>현재</th><th><em class="est"></em>예상</th><th><em class="max"></em>최대</th></tr></thead>
        <tbody>${body}</tbody><tfoot><tr><td>합계</td><td>${fmt(e.now)}</td><td class="hl">${fmt(est)}</td><td>${fmt(max)}</td></tr></tfoot></table>`;
    } else {
      bottom = `<div class="pv-b__lg pv-e">
          <div><em class="now"></em>현재<b>${fmt(e.now)}</b></div>
          <div class="on"><em class="est"></em>예상<b>${fmt(est)}</b></div>
          <div><em class="max"></em>최대<b>${fmt(max)}</b></div></div>${bar}
        <table class="pp-tbl pv-d pv-d--sm"><tbody>${body}</tbody></table>`;
    }
  } else {
    bottom = `<table class="pp-tbl pv-c"><thead><tr><th></th><th>현재</th><th>예상</th><th>최대</th></tr></thead><tbody>
        <tr><td>FA</td><td>${fmt(t.go)}</td><td>${fmt(t.go + e.eGo)}</td><td>${fmt(t.go + e.wait)}</td></tr>
        <tr><td>동반</td><td>${fmt(t.comp)}</td><td>${fmt(t.comp + e.eComp)}</td><td>${fmt(t.comp + e.maxComp)}</td></tr>
        <tr><td>관리자</td><td>${fmt(m.sum)}</td><td>${fmt(m.sum + e.eMgr)}</td><td>${fmt(m.sum + e.missTo)}</td></tr></tbody>
        <tfoot><tr><td>합계</td><td>${fmt(e.now)}</td><td class="hl">${fmt(est)}</td><td>${fmt(max)}</td></tr></tfoot></table>`;
  }
  return `<div class="pp-tiles">
      <div class="pp-tile wait"><span>FA 미응답</span><b>${fmt(t.wait)}명</b><small>달성자 ${fmt(t.t)}명 중 ${Math.round(pct(t.wait, t.t))}%</small></div>
      <div class="pp-tile"><span>관리자 미입력</span><b>TO ${fmt(e.missTo)}명</b><small>파트너 ${fmt(m.missing.length)}곳 아직 입력 전</small></div>
    </div>
    <h4 class="pp-h">구간별 미응답</h4>
    <table class="pp-tbl"><thead><tr><th>구간</th><th>미응답</th><th class="hide-m">동반 한도</th><th>최대 동반</th><th>최대 인원</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td>${fmt(e.wait)}</td><td class="hide-m"></td><td>${fmt(e.maxComp)}</td><td>${fmt(e.wait + e.maxComp)}</td></tr></tfoot></table>
    <h4 class="pp-h">최대 예상 인원</h4>
    ${bottom}
    <p class="pp-note">최대 = 현재 + FA 미응답자(동반 최대) + 관리자 미입력 TO</p>`;
}

function allPopHtml() {
  const d = st.data, t = d.total, m = d.mgr;
  const rows = d.grades.slice().reverse().map(([g, tt, go, no, comp]) => `<tr><td>${esc(g)}</td><td class="hide-m sep">${fmt(tt)}</td><td>${fmt(go + no)}</td><td>${fmt(go)}</td><td class="hide-m">${fmt(no)}</td><td>${fmt(comp)}</td><td class="em">${fmt(go + comp)}</td></tr>`).join('');
  const now = t.go + t.comp + m.sum;
  return `<div class="pp-eq"><b class="big">${fmt(now)}명</b><span>=</span> FA 참석 <em>${fmt(t.go)}</em> <span>+</span> 동반 <em>${fmt(t.comp)}</em> <span>+</span> 관리자 <em>${fmt(m.sum)}</em></div>
    <h4 class="pp-h">구간별 참석·동반 <small>응답자 기준</small></h4>
    <table class="pp-tbl"><thead><tr><th>구간</th><th class="hide-m sep">대상</th><th>응답</th><th>참석</th><th class="hide-m">불참</th><th>동반</th><th>참석+동반</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td class="hide-m sep">${fmt(t.t)}</td><td>${fmt(t.go + t.no)}</td><td>${fmt(t.go)}</td><td class="hide-m">${fmt(t.no)}</td><td>${fmt(t.comp)}</td><td>${fmt(t.go + t.comp)}</td></tr></tfoot></table>
    <h4 class="pp-h">관리자</h4>
    <table class="pp-tbl"><thead><tr><th>구분</th><th>입력 파트너</th><th>관리자 TO</th><th>입력 인원</th></tr></thead>
      <tbody><tr><td>입력 완료</td><td>${fmt(m.entered)}곳</td><td>${fmt(m.to - m.missing.reduce((a, x) => a + x[2], 0))}</td><td class="em">${fmt(m.sum)}</td></tr>
      <tr><td>미입력</td><td class="w">${fmt(m.missing.length)}곳</td><td>${fmt(m.missing.reduce((a, x) => a + x[2], 0))}</td><td>-</td></tr></tbody></table>
    <p class="pp-note">미응답 FA ${fmt(t.wait)}명·관리자 ${fmt(m.missing.length)}곳 제외 · <button type="button" class="pp-link" id="pp-to-wait">미응답 포함 최대 인원 보기 ›</button></p>`;
}
