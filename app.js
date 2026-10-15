/* 2027 ISF 참석 수요조사 - 화면 동작 */

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
  last: null       // 마지막 제출 결과
};

// data-text="키" 가 붙은 곳에 글자 넣기 (항상 textContent → 입력값이 HTML로 해석되지 않음)
function setText(key, value) {
  $$(`[data-text="${key}"]`).forEach((el) => { el.textContent = value == null ? '' : String(value); });
}

function show(screen) {
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === `screen-${screen}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loading(on) { $('#loading').hidden = !on; }

async function api(payload) {
  loading(true);
  try {
    // text/plain 으로 보내야 Apps Script가 별도 사전요청 없이 받음
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    return { ok: false, message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
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
  state.empNo = ''; state.name = ''; state.info = null; state.last = null;
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
    err.textContent = res.message || '일시적인 오류가 발생했습니다. 다시 시도해 주세요.';
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
  $('#welcome-ok').hidden = !info.eligible;
  $('#welcome-no').hidden = !!info.eligible;
  $('#welcome-prev').hidden = !info.previous;
  $('#welcome').hidden = false;
  const focusBtn = $(info.eligible ? '#welcome-ok .btn' : '#welcome-no .btn');
  focusBtn.focus();
}
function closeWelcome() { $('#welcome').hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#welcome').hidden) closeWelcome();
});

// ─────────────── ③ 참석 정보 입력 ───────────────
const countInput = $('#count');

function prepareForm() {
  const info = state.info;
  if (!info) return show('intro');
  const prev = state.last;
  countInput.max = info.limit;
  countInput.disabled = info.limit === 0;
  $('#count-note').hidden = info.limit !== 0;

  $$('input[name="attend"]').forEach((r) => { r.checked = !!prev && r.value === prev.attend; });
  countInput.value = prev && prev.attend === '참석' ? prev.companions : 0;
  renderRelations(prev && prev.attend === '참석' ? prev.relations : []);
  $('#submit-error').hidden = true;
  refreshForm();
}

function currentAttend() {
  const r = $('input[name="attend"]:checked');
  return r ? r.value : '';
}

function currentCount() {
  const v = countInput.value.trim();
  if (v === '') return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

// 동반 인원 수만큼 관계 선택칸 생성 (기존 선택은 유지)
function renderRelations(preset) {
  const info = state.info;
  const list = $('#rel-list');
  const keep = preset || $$('#rel-list select').map((s) => s.value);
  const n = currentCount();
  const count = Number.isInteger(n) ? Math.min(n, info.limit) : 0;
  list.textContent = '';
  for (let i = 0; i < count; i++) {
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
  $('#rel-card').hidden = count === 0;
}

// 입력 상태에 따라 블록 표시·오류·제출 버튼 잠금
function refreshForm() {
  const info = state.info;
  const attend = currentAttend();
  const going = attend === '참석';
  $('#companion-block').hidden = !going;

  let valid = !!attend;
  if (going) {
    const n = currentCount();
    const over = !Number.isInteger(n) || n > info.limit;
    $('#count-error').hidden = !over || !Number.isInteger(n);
    $('#count-card').classList.toggle('is-invalid', over);
    const rels = $$('#rel-list select').map((s) => s.value);
    valid = !over && rels.length === n && rels.every(Boolean);
  } else {
    $('#count-error').hidden = true;
    $('#count-card').classList.remove('is-invalid');
  }
  $('#submit-btn').disabled = !valid;
}

$$('input[name="attend"]').forEach((r) => r.addEventListener('change', refreshForm));
countInput.addEventListener('input', () => {
  countInput.value = countInput.value.replace(/[^\d]/g, '');
  renderRelations();
  refreshForm();
});

$('#attend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#submit-error');
  err.hidden = true;
  const attend = currentAttend();
  const companions = attend === '참석' ? currentCount() : 0;
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
