/* 2027 ISF 참석 수요조사 - 화면 동작 (FA) */

// ─────────────── 바꿀 수 있는 값 ───────────────
const CONFIG = {
  // Apps Script 웹 앱 주소 (배포 → 배포 관리에서 확인)
  API_URL: 'https://script.google.com/macros/s/AKfycbw9Ve3k9fg9Vb8z96iH87WusRqFfLaKgB_IrQufZNM1FB40OlXz3sBktkR2MkmD0rpmkw/exec',
  // 화면에 보이는 조사 기간 문구
  PERIOD_TEXT: '10.27 ~ [마감일]'
};
// ──────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  empNo: '',
  name: '',
  info: null,      // 조회 결과
  last: null,      // 마지막 제출 내용
  count: 0         // 예상 동반인원
};

// data-text="키" 가 붙은 곳에 글자 넣기 (항상 textContent → 입력값이 HTML로 해석되지 않음)
function setText(key, value) {
  $$(`[data-text="${key}"]`).forEach((el) => { el.textContent = value == null ? '' : String(value); });
}

// ─────────────── 화면 전환 + 뒤로가기 ───────────────
// 화면을 바꿀 때마다 브라우저 기록에 남겨서, 상단 [뒤로] 버튼과 휴대폰 뒤로가기가 같은 동작을 하게 함
let current = 'intro';
function show(screen, push = true) {
  current = screen;
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === `screen-${screen}`));
  $('#back-btn').hidden = screen === 'intro';
  $('#bar-title').hidden = screen !== 'intro';
  if (push) history.pushState({ screen }, '');
  window.scrollTo({ top: 0 });
}
history.replaceState({ screen: 'intro' }, '');

window.addEventListener('popstate', (e) => {
  if (!$('#welcome').hidden) { closeWelcome(); return; }
  const to = (e.state && e.state.screen) || 'intro';
  // 조회 정보 없이 입력·완료 화면으로 돌아가는 것은 막음
  if ((to === 'form' || to === 'done') && !state.info) return show('intro', false);
  show(to, false);
});

$('#back-btn').addEventListener('click', () => {
  if (!$('#welcome').hidden) { closeWelcome(); return; }
  history.back();
});

function loading(on) { $('#loading').hidden = !on; }

async function api(payload) {
  loading(true);
  try {
    // text/plain 으로 보내야 Apps Script가 별도 사전요청 없이 받음
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    return { ok: false, message: '네트워크 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.' };
  } finally {
    loading(false);
  }
}

// ─────────────── 화면 이동 버튼 ───────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (!btn) return;
  const go = btn.dataset.go;
  if (go === 'verify') show('verify');
  if (go === 'form') { closeWelcome(); prepareForm(); show('form'); }
  if (go === 'reset') resetAll();
});

function resetAll() {
  closeWelcome();
  state.empNo = ''; state.name = ''; state.info = null; state.last = null; state.count = 0;
  $('#verify-form').reset();
  $('#attend-form').reset();
  updateAgree();
  $('#verify-error').hidden = true;
  show('intro');
}

// ─────────────── ① 본인 확인 ───────────────
const agree = $('#agree');
function updateAgree() {
  $('#verify-btn').disabled = !agree.checked;
  $('#agree-hint').hidden = agree.checked;
}
agree.addEventListener('change', updateAgree);

// 동의서 내용 접기/펼치기
$('#consent-toggle').addEventListener('click', () => {
  const body = $('#consent-body');
  const open = body.hidden;
  body.hidden = !open;
  $('#consent').classList.toggle('is-open', open);
  $('#consent-toggle').setAttribute('aria-expanded', String(open));
  $('#consent-toggle').textContent = open ? '접기 ▴' : '내용 보기 ▾';
});

$('#emp').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });

$('#verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#verify-error');
  err.hidden = true;
  if (!agree.checked) return updateAgree();

  const empNo = $('#emp').value.trim();
  if (!empNo) { err.textContent = '사원번호를 입력해 주세요.'; err.hidden = false; return; }

  const res = await api({ action: 'lookup', empNo, agree: true });
  if (!res.ok || !res.name || !res.grade) {
    err.textContent = res.message || '일시적인 오류가 발생했습니다.\n다시 시도해 주세요.';
    err.hidden = false;
    return;
  }

  state.empNo = empNo;
  state.name = res.name;
  state.info = res;
  state.last = res.previous || null;
  openWelcome(res);
});

// ─────────────── ② 환영 팝업 ───────────────
function openWelcome(info) {
  setText('name', info.name);
  setText('grade', info.grade);
  setText('limit', info.limit);
  setText('org', [info.division, info.partner].filter(Boolean).join(' · '));
  if (info.deadline) setText('deadline', info.deadline);
  // 제외 부문(다이렉트 등)은 서버가 보낸 안내 문구로 표시
  const noTitle = $('#welcome-no-title');
  if (info.reason) noTitle.textContent = info.reason;
  else noTitle.innerHTML = '아쉽게도 이번 ISF<br>달성 대상이 아닙니다.';
  noTitle.style.whiteSpace = info.reason ? 'pre-line' : '';
  $('#welcome-no-sub').hidden = !!info.reason;
  // 미달성자: 합산 실적에 따른 현금 시상 안내
  $('#consol-card').hidden = !info.consolation;
  $('#consol-amount').textContent = info.consolation || '';
  $('#welcome-ok').hidden = !info.eligible;
  $('#welcome-no').hidden = !!info.eligible;
  $('#welcome-prev').hidden = !info.previous;
  $('#welcome').hidden = false;
  $(info.eligible ? '#welcome-ok .btn' : '#welcome-no .btn').focus();
}
function closeWelcome() { $('#welcome').hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#welcome').hidden) closeWelcome();
});

// ─────────────── ③ 참석 정보 입력 ───────────────
function prepareForm() {
  const info = state.info;
  if (!info) return show('intro');
  const prev = state.last;
  $('#count-note').hidden = info.limit !== 0;
  $$('input[name="attend"]').forEach((r) => { r.checked = !!prev && r.value === prev.attend; });
  state.count = prev && prev.attend === '참석' ? Math.min(prev.companions, info.limit) : 0;
  $('#count-error').hidden = true;
  renderCount();
  renderRelations(prev && prev.attend === '참석' ? prev.relations : []);
  $('#submit-error').hidden = true;
  refreshForm();
}

function currentAttend() {
  const r = $('input[name="attend"]:checked');
  return r ? r.value : '';
}

function renderCount() {
  const limit = state.info.limit;
  $('#count').textContent = `${state.count}명`;
  $('#count-minus').disabled = state.count <= 0;
  $('#count-plus').disabled = limit === 0;
}

// − / + 버튼: 한도를 넘기려 하면 경고만 띄우고 숫자는 한도에서 멈춤
$('#count-minus').addEventListener('click', () => {
  if (state.count > 0) state.count -= 1;
  $('#count-error').hidden = true;
  renderCount(); renderRelations(); refreshForm();
});
$('#count-plus').addEventListener('click', () => {
  if (state.count >= state.info.limit) {
    $('#count-error').hidden = false;
    // 경고는 3초 뒤 자동으로 닫힘 (작은 화면에서 칸을 오래 차지하지 않게)
    clearTimeout(state.warnTimer);
    state.warnTimer = setTimeout(() => { $('#count-error').hidden = true; refreshForm(); }, 3000);
  } else {
    state.count += 1;
    $('#count-error').hidden = true;
  }
  renderCount(); renderRelations(); refreshForm();
});

// 예상 동반인원 수만큼 관계 선택칸 생성 (기존 선택은 유지)
function renderRelations(preset) {
  const info = state.info;
  const list = $('#rel-list');
  const keep = preset || $$('#rel-list select').map((s) => s.value);
  list.textContent = '';
  for (let i = 0; i < state.count; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = `rel-${i}`;
    label.textContent = `동반인 ${i + 1}`;
    const sel = document.createElement('select');
    sel.id = `rel-${i}`;
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = '선택';
    sel.appendChild(ph);
    info.relations.forEach((r) => {
      const o = document.createElement('option');
      o.value = r; o.textContent = r;
      sel.appendChild(o);
    });
    if (keep[i] && info.relations.includes(keep[i])) sel.value = keep[i];
    sel.addEventListener('change', refreshForm);
    wrap.append(label, sel);
    list.appendChild(wrap);
  }
  $('#rel-card').hidden = state.count === 0;
}

// 참석/불참에 따라 보이는 칸과 제출 버튼 잠금 정리
function refreshForm() {
  const attend = currentAttend();
  const going = attend === '참석';
  $('#companion-block').hidden = !going;
  $('#cash-card').hidden = attend !== '불참';
  $('#count-card').classList.toggle('is-invalid', going && !$('#count-error').hidden);


  let valid = !!attend;
  if (going) {
    const rels = $$('#rel-list select').map((s) => s.value);
    valid = rels.length === state.count && rels.every(Boolean);
  }
  $('#submit-btn').disabled = !valid;
}

$$('input[name="attend"]').forEach((r) => r.addEventListener('change', refreshForm));

$('#attend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#submit-error');
  err.hidden = true;
  const attend = currentAttend();
  const companions = attend === '참석' ? state.count : 0;
  const relations = attend === '참석' ? $$('#rel-list select').map((s) => s.value) : [];

  const res = await api({
    action: 'submit', empNo: state.empNo, agree: true,
    attend, companions, relations
  });
  if (!res.ok) { err.textContent = res.message; err.hidden = false; return; }

  state.last = { attend: res.attend, companions: res.companions, relations: res.relations };
  setText('s-attend', res.attend);
  setText('s-count', `${res.companions}명`);
  setText('s-rel', res.relations.length ? res.relations.join(', ') : '-');
  setText('s-at', res.submittedAt);
  if (res.deadline) setText('deadline', res.deadline);
  show('done');
});

// ─────────────── 시작 ───────────────
setText('period', CONFIG.PERIOD_TEXT);
updateAgree();
