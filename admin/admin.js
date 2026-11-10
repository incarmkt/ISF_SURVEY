/* ISF 수요조사 현황 (마케팅부 전용) - 화면 동작 */

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
const st = { data: null, pShow: CONFIG.PAGE, wShow: CONFIG.WAIT_PAGE, missAll: false, open: '' };

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
  ['#bar-title', '#bar-tag', '#bar-tools'].forEach((s) => { $(s).hidden = true; });
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
  ['#bar-title', '#bar-tag', '#bar-tools'].forEach((s) => { $(s).hidden = false; });
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
  $('#k-wait').textContent = fmt(t.wait);
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
function partnerRows() {
  const dv = $('#p-div').value, hq = $('#p-hq').value, q = $('#p-q').value.trim().toLowerCase();
  return st.data.partners
    .filter((p) => (!dv || p[0] === dv) && (!hq || p[1] === hq) && (!q || String(p[2]).toLowerCase().includes(q)))
    .map((p) => ({ p, rate: p[3] ? (p[4] + p[5]) / p[3] : 2 }))   // 대상 0명(관리자만)은 맨 뒤
    .sort((a, b) => a.rate - b.rate || b.p[6] - a.p[6] || b.p[3] - a.p[3])
    .map((x) => x.p);
}
function renderPartners() {
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
    if (open) {
      const ws = st.data.waiting.filter((w) => w[1] === name);
      const mgrLine = to > 0 ? `<div class="only-m" style="margin-top:8px">관리자 ${mi == null ? '미입력' : fmt(mi) + '명 입력'} / TO ${fmt(to)} · 동반 ${fmt(comp)}명 · 불참 ${fmt(no)}명</div>` : `<div class="only-m" style="margin-top:8px">동반 ${fmt(comp)}명 · 불참 ${fmt(no)}명</div>`;
      html += `<tr class="p-detail"><td colspan="10"><div style="font-weight:700;font-size:12.5px;margin-bottom:8px">미응답자 ${fmt(ws.length)}명</div>
        ${ws.length ? `<div class="wl">${ws.map((w) => `<span>${esc(w[2])}<small>${esc(w[3])} · ${esc(w[4])}</small></span>`).join('')}</div>` : '<div style="color:var(--muted);font-size:12.5px">모두 응답했습니다.</div>'}
        ${mgrLine}</td></tr>`;
    }
    return html;
  }).join('') || '<tr><td colspan="10" class="empty">조건에 맞는 파트너가 없습니다.</td></tr>';

  const more = all.length > rows.length ? ` · <button type="button" id="p-more-btn">${fmt(Math.min(CONFIG.PAGE, all.length - rows.length))}곳 더 보기 ›</button>` : '';
  $('#p-more').innerHTML = `${fmt(all.length)}곳 중 ${fmt(rows.length)}곳 표시 · 파트너 클릭 시 미응답자 명단 확인 가능${more}`;
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
  const rows = partnerRows().map(([dv, hq, name, t, go, no, wait, comp, mi, to]) => [
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

