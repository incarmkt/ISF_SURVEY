/* 2027 ISF 관리자 참석 수요조사 - 화면 동작 */

// ─────────────── 바꿀 수 있는 값 ───────────────
const CONFIG = {
  // Apps Script 웹 앱 주소 (FA 페이지 app.js와 같은 주소)
  API_URL: 'https://script.google.com/macros/s/AKfycbw9Ve3k9fg9Vb8z96iH87WusRqFfLaKgB_IrQufZNM1FB40OlXz3sBktkR2MkmD0rpmkw/exec',
  // 화면에 보이는 조사 기간 문구
  PERIOD_TEXT: '10.27 ~ [마감일]'
};
// ──────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = { empNo: '', info: null, lastCount: null };

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
    const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    return { ok: false, message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
  } finally {
    loading(false);
  }
}

// ─────────────── 화면 이동 ───────────────
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
  state.empNo = ''; state.info = null; state.lastCount = null;
  $('#verify-form').reset();
  updateAgree();
  $('#verify-error').hidden = true;
  show('intro');
}

// ─────────────── ① 관리자 확인 ───────────────
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

  const res = await api({ action: 'mlookup', empNo, agree: true });
  if (!res.ok || !res.name || !res.partner) {
    err.textContent = res.message || '일시적인 오류가 발생했습니다. 다시 시도해 주세요.';
    err.hidden = false;
    return;
  }
  state.empNo = empNo;
  state.info = res;
  state.lastCount = res.current ? res.current.count : null;
  openWelcome(res);
});

// ─────────────── ② 관리자 TO 안내 ───────────────
function openWelcome(info) {
  setText('name', info.name);
  setText('partner', info.partner);
  setText('to', info.to);
  if (info.deadline) setText('deadline', info.deadline);
  $('#welcome-ok').hidden = !info.eligible;
  $('#welcome-no').hidden = !!info.eligible;
  $('#welcome-reason').textContent = info.reason || '';
  const prev = $('#welcome-prev');
  if (info.current) {
    prev.textContent = `현재 ${info.current.count}명으로 입력되어 있습니다. (${info.current.by}님, ${info.current.at})`;
    prev.hidden = false;
  } else {
    prev.hidden = true;
  }
  $('#welcome').hidden = false;
  $(info.eligible ? '#welcome-ok .btn' : '#welcome-no .btn').focus();
}
function closeWelcome() { $('#welcome').hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#welcome').hidden) closeWelcome();
});

// ─────────────── ③ 인원 입력 ───────────────
const countInput = $('#count');

function prepareForm() {
  const info = state.info;
  if (!info || !info.eligible) return show('intro');
  countInput.max = info.to;
  countInput.value = state.lastCount != null ? state.lastCount : 0;
  const note = $('#current-note');
  if (info.current) {
    note.textContent = `현재 입력값: ${info.current.count}명 (${info.current.by}님 입력). 다시 제출하면 이 값이 바뀝니다.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
  $('#submit-error').hidden = true;
  refreshForm();
}

function currentCount() {
  const v = countInput.value.trim();
  if (v === '') return NaN;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function refreshForm() {
  const n = currentCount();
  const over = Number.isInteger(n) && n > state.info.to;
  $('#count-error').hidden = !over;
  $('#count-card').classList.toggle('is-invalid', over);
  $('#submit-btn').disabled = !Number.isInteger(n) || over;
}

countInput.addEventListener('input', () => {
  countInput.value = countInput.value.replace(/[^\d]/g, '');
  refreshForm();
});
$$('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const n = Number.isInteger(currentCount()) ? currentCount() : 0;
  countInput.value = Math.max(0, n + Number(b.dataset.step));
  refreshForm();
}));

$('#count-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#submit-error');
  err.hidden = true;
  const res = await api({ action: 'msubmit', empNo: state.empNo, agree: true, count: currentCount() });
  if (!res.ok) { err.textContent = res.message; err.hidden = false; return; }

  state.lastCount = res.count;
  state.info.current = { count: res.count, by: res.name, at: res.submittedAt };
  setText('s-count', `${res.count}명`);
  setText('s-at', res.submittedAt);
  if (res.deadline) setText('deadline', res.deadline);
  show('done');
});

// ─────────────── 시작 ───────────────
setText('period', CONFIG.PERIOD_TEXT);
updateAgree();
