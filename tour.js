/* 여행 안내 (링크 열면 처음에 보이는 여러 장짜리 안내) - FA·관리자 공용 */
(function () {
  // ─────────────── 기항지·코스 내용 (여기만 고치면 화면에 반영) ───────────────
  const PORTS = [
    { key: 'kanazawa', name: '가나자와', en: 'KANAZAWA', courses: [
      ['유노쿠니노모리', '나가마치 무사마을', '히가시차야 거리', '겐로쿠엔 정원'],
      ['시라카와고', '겐로쿠엔 정원', '히가시차야 거리'],
      ['알펜루트 [다테야마-오오기자와] 편도 관통코스'],
      ['겐로쿠엔 정원', '알펜루트 (무로도 코스)']
    ] },
    { key: 'sakai', name: '사카이미나토', en: 'SAKAIMINATO', courses: [
      ['마쓰에성', '호리카와 유람선', '유시엔 정원'],
      ['아다치 미술관', '다이센지', '하나카이로'],
      ['유시엔 정원', '유메미나토 타워 전망대', '미즈키 시게루 로드 (요괴거리)']
    ] },
    { key: 'nagasaki', name: '나가사키', en: 'NAGASAKI', courses: [
      ['구라바엔', '원폭자료관 & 위령비', '나가사키 평화공원', '시내면세점 (쇼핑)'],
      ['하우스텐보스 (자유투어)', '시내면세점 (쇼핑)'],
      ['운젠 지옥계곡', '시마바라성', '시내면세점 (쇼핑)'],
      ['나가사키 역사문화박물관', '원폭자료관', '나가사키 평화공원', '시내면세점 (쇼핑)'],
      ['이나사야마 전망대 & 슬로프카', '스와신사', '나가사키 평화공원', '시내면세점 (쇼핑)']
    ] }
  ];
  // ──────────────────────────────────────────────

  const tour = document.getElementById('tour');
  if (!tour) return;
  const $ = (s) => tour.querySelector(s);
  const track = $('.tour__track');

  // 항로 장: 기항지 순서
  $('#tour-stops').innerHTML = PORTS.map((p, i) => `
    <li class="stop stop--${p.key}"><span class="stop__no">${i + 1}</span>
      <span class="stop__name"><b>${p.name}</b><small>${p.en}</small></span>
      <span class="stop__cnt">관광 코스 ${p.courses.length}개</span></li>`).join('');

  // 기항지마다 한 장씩: 코스 + 선착순 안내
  const fcfs = $('#tour-fcfs').innerHTML;
  // 짧은 장소명은 중간에서 줄이 끊기지 않게 (예: 나가마치 무사마을)
  const keep = (t) => t;
  const stopHtml = (s) => { const m = s.match(/^(.*?)\s*\((.+)\)$/); return m ? `${keep(m[1])}<small>${m[2]}</small>` : keep(s); };
  track.insertAdjacentHTML('beforeend', PORTS.map((p, i) => `
    <section class="slide slide--port port--${p.key}" aria-label="기항지 ${i + 1} ${p.name} 관광 코스">
      <div class="s3">
        <div class="s3__head">
          <h2><em>기항지 ${i + 1}</em>${p.name}<span>${p.en}</span></h2>
        </div>
        <div class="s3__body">
          <ol class="courses">${p.courses.map((c, n) => `
            <li class="course"><span class="course__no">${n + 1}코스</span>
              <ol class="course__stops">${c.map((s) => `<li${s.replace(/\s*\(.+\)$/, '').length > 14 ? ' class="long"' : ''}><span class="chip">${stopHtml(s)}</span></li>`).join(' ')}${i === PORTS.length - 1 ? ' <li class="end"><span class="chip">부산 도착</span></li>' : ''}</ol></li>`).join('')}
          </ol>
          ${p.tail ? `<div class="tail"><span class="tail__lbl">모든 코스 공통</span><ol class="course__stops tail__stops">${p.tail.map((s, n) => `<li${n === p.tail.length - 1 ? ' class="end"' : ''}><span class="chip">${stopHtml(s)}</span></li>`).join(' ')}</ol></div>` : ''}
        </div>
        <div class="s3__foot"><p class="more-hint">아래로 밀면 코스가 더 있어요 ↓</p>${fcfs}</div>
      </div>
    </section>`).join(''));

  const PAGES = tour.querySelectorAll('.slide').length;
  // 코스가 화면보다 길면 '더 있어요' 안내 표시
  // 화면 높이에 맞춰 코스 글씨 크기를 자동 조절 (17px → 최소 13px), 그래도 넘치면 '더 있어요' 안내
  const markMore = () => tour.querySelectorAll('.slide--port').forEach((sl) => {
    const bd = sl.querySelector('.s3__body');
    let fs = 17;
    sl.style.setProperty('--fs', fs + 'px');
    while (fs > 13 && bd.scrollHeight > bd.clientHeight + 1) { fs -= 0.5; sl.style.setProperty('--fs', fs + 'px'); }
    sl.classList.toggle('has-more', bd.scrollHeight > bd.clientHeight + 4);
  });
  window.addEventListener('resize', markMore);
  requestAnimationFrame(markMore);
  $('#tour-dots').innerHTML = Array.from({ length: PAGES }, () => '<i></i>').join('');

  // 넘기기 (손가락으로 밀거나 버튼으로)
  const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  function go(n) { track.scrollTo({ left: n * track.clientWidth, behavior: 'smooth' }); }
  function sync() {
    const page = cur();
    tour.dataset.page = page === PAGES - 1 ? 'last' : page === 0 ? 'first' : 'mid';
    tour.querySelectorAll('.tour__dots i').forEach((d, i) => d.classList.toggle('on', i === page));
  }
  track.addEventListener('scroll', () => { window.requestAnimationFrame(sync); });
  $('#tour-next').addEventListener('click', () => go(cur() + 1));
  $('#tour-prev').addEventListener('click', () => go(cur() - 1));
  const close = () => { tour.hidden = true; document.body.classList.remove('tour-open'); };
  $('#tour-skip').addEventListener('click', close);
  $('#tour-start').addEventListener('click', close);
  document.body.classList.add('tour-open');
  sync();

  // 첫 화면 [항로·기항지 관광 코스 보기] → 안내 다시 열기 (처음 장부터)
  const reopen = document.getElementById('tour-reopen');
  if (reopen) reopen.addEventListener('click', () => {
    tour.hidden = false;
    document.body.classList.add('tour-open');
    track.scrollTo({ left: 0 });
    sync();
  });

  window.ISF_TOUR = { go }; // 시안 촬영용
})();
