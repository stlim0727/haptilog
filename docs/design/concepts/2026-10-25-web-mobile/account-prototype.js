/* Future account UX only. No OAuth request, token, or real user data is used. */
let accountSignedIn = false;
let guestConnected = true;
let activeWatch = 'current';
let authReturnView = 'list';
let pairingNewWatch = false;
let pendingUnlink = null;
const sampleAccount = { name: '민수', email: 'minsu@example.com' };
const demoWatches = [
  { id: 'current', name: 'Galaxy Watch7', code: 'HL-0123456789', label: '현재 워치', linked: false },
  { id: 'old', name: 'Galaxy Watch5', code: 'HL-0987654321', label: '이전 워치', linked: false },
];
records.forEach(r => r.watchId = 'current');
records.push(
  { ...records[0], id: 51, watchId: 'old', day: 23, title: '이전 워치에서 남긴 여행 준비 메모', text: '다음 여행에는 가벼운 가방을 챙겨 가자.', place: null },
  { ...records[3], id: 52, watchId: 'old', day: 22, title: '출근길에 떠올랐던 아이디어', text: '출근길 생각을 음성으로 남겨두기.', place: null },
);
paths.person = 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0';
paths.watch = 'M8 2h8l1 5v10l-1 5H8l-1-5V7l1-5ZM7 7h10v10H7z';
paths.logout = 'M10 4H4v16h6M14 8l4 4-4 4m-5-4h9';
const originalRender = render;
const originalFiltered = filtered;
const originalMenu = menu;
const originalGoBack = goBack;
const authScreens = ['welcome', 'account', 'watches', 'link-account', 'unlink-watch', 'signin-error'];
const accountFooter = () => `<div class="demo">Google 로그인 추가 시안 · 모든 계정·워치·기록은 예시입니다.<br>실제 Google 인증·기록 연결·해제는 실행되지 않습니다.<br><a href="?view=welcome">로그인 진입</a> · <a href="?view=list">코드 연결 사용자</a> · <a href="?view=watches&account=linked">로그인한 사용자</a></div>`;
const googleButton = (label, action) => `<button class="google-button full" onclick="${action}"><span class="google-letter" aria-hidden="true">G</span><span>${label}</span></button>`;
const currentWatch = () => demoWatches.find(w => w.id === activeWatch) ?? demoWatches[0];
const linkedWatches = () => demoWatches.filter(w => w.linked);
const recoveryHelp = () => `<details class="recovery-help"><summary>어떤 기록을 다시 볼 수 있나요?</summary><p>계정에 연결한 워치의 업로드된 기록을 다시 볼 수 있어요.</p><p>계정 연결 전에 워치 인증 정보와 기존 브라우저 접근을 모두 잃은 기록은 복구할 수 없어요.</p><p>워치에만 남아 있는 미업로드 녹음은 Google 로그인으로 복원되지 않아요.</p></details>`;
function accountPageHeader(backLabel = '돌아가기') {
  return `<header><button class="back" onclick="accountBack()">${icon('back')}${backLabel}</button><span class="small">${accountSignedIn ? 'Google 계정' : 'HaptiLog'}</span></header>`;
}
function goAccountView(next, remember = true) {
  if (dialog.open) dialog.close();
  if (remember && !authScreens.includes(view) && view !== 'pair') authReturnView = view;
  view = next;
  history.replaceState({ view }, '', `?view=${view}${accountSignedIn ? '&account=google' : ''}`);
  render(); scrollTo(0, 0); document.querySelector('h1')?.focus({ preventScroll: true });
}
function accountBack() {
  if (accountSignedIn && !currentWatch().linked && !guestConnected) { goAccountView('watches', false); return; }
  goAccountView(guestConnected || accountSignedIn ? authReturnView : 'welcome', false);
}
header = function(detail = false) {
  return `<header class="${detail ? 'detail-head' : ''}">${detail ? `<button class="back" onclick="goBack()">${icon('back')} 돌아가기</button>` : `<div class="brand"><span class="mark">${icon('wave')}</span>haptilog<em>.</em></div>`}<div class="header-tools"><button class="account-avatar ${accountSignedIn ? 'signed-in' : ''}" aria-label="${accountSignedIn ? '민수 계정' : '계정 및 로그인'}" onclick="goAccountView('account')">${accountSignedIn ? '민' : icon('person')}</button><button class="icon" aria-label="${detail ? '기록 메뉴' : '더보기'}" onclick="menu(${detail})">${icon('more')}</button></div></header>`;
};
filtered = function() { return originalFiltered().filter(r => r.watchId === activeWatch); };
render = function() {
  document.title = 'HaptiLog · ' + ({ welcome: '로그인', account: '내 계정', watches: '내 워치', 'link-account': '계정에 기록 연결', 'unlink-watch': '워치 연결 해제', 'signin-error': '로그인 확인' }[view] || '내 기록');
  if (authScreens.includes(view)) { renderAccountScreen(); return; }
  originalRender();
  const demo = document.querySelector('.demo'); if (demo) demo.outerHTML = accountFooter();
  if (['list', 'map', 'calendar'].includes(view)) {
    const heading = document.querySelector('main > h1');
    const watch = currentWatch();
    heading?.insertAdjacentHTML('afterend', `<button class="watch-picker" onclick="goAccountView('watches')"><span class="watch-picker-icon">${icon('watch')}</span><span><b>${watch.name}</b><small>${watch.code} · ${watch.label}</small></span>${icon('chevron')}</button>`);
    const all = records.filter(r => r.watchId === activeWatch);
    const summary = document.querySelector('.summary');
    if (summary) summary.innerHTML = `<span>선택한 워치 · 기록 <strong>${all.length}개</strong></span><span>${all.some(r => r.amount) ? '지출 <strong>₩5,000</strong>' : ''}</span>`;
    if (!watch.linked) document.querySelector('.toolbar')?.insertAdjacentHTML('beforebegin', `<section class="account-nudge"><span class="account-status">계정 미연결</span><button onclick="googleLogin('link')">Google 계정에 연결해 기록 보관 ${icon('chevron')}</button></section>`);
    if (!all.length) document.querySelector('#content')?.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', innerHTML: '<strong>아직 업로드된 기록이 없어요</strong><p>이 워치에서 기록을 업로드하면 여기에 표시돼요.</p>' }));
  }
};
// Preserve the existing page-scroll, calendar and detail interactions while scoping to a watch.
const originalUpdateContent = updateContent;
updateContent = function() {
  if (view !== 'list') { originalUpdateContent(); return; }
  const root = document.querySelector('#content'); if (!root) return;
  const list = filtered();
  root.innerHTML = list.length ? [...new Set(list.map(r => r.day))].sort((a,b) => b-a).map(day => `<div class="day-heading">10월 ${day}일<span>${list.filter(r => r.day === day).length}개</span></div>${list.filter(r => r.day === day).map(card).join('')}`).join('') : '<div class="empty"><strong>찾는 기록이 없어요</strong><p>다른 검색어나 필터로 찾아보세요.</p></div>';
};
function renderAccountScreen() {
  if (view === 'welcome' || view === 'signin-error') {
    app.innerHTML = `<header><div class="brand"><span class="mark">${icon('wave')}</span>haptilog<em>.</em></div><span class="small">나의 음성 기록</span></header><main class="account-welcome"><div class="eyebrow">FROM YOUR WRIST, TO YOU.</div><h1 tabindex="-1">워치가 바뀌어도,<br>나의 순간은 이어지게.</h1><p class="sub">Google 계정으로 로그인하거나<br>워치 코드로 먼저 시작하세요.</p>${view === 'signin-error' ? '<p class="auth-error" role="alert">로그인을 완료하지 못했어요. 다시 시도하거나 워치 코드로 연결해 주세요.</p>' : ''}<section class="auth-entry"><div class="entry-icon">${icon('person')}</div><h2>내 계정으로 계속하기</h2><p>계정에 연결한 워치와<br>업로드된 기록을 다시 확인하세요.</p>${googleButton('Google로 로그인', "googleLogin('login')")}</section><div class="auth-divider"><span>또는</span></div><button class="outline full" onclick="startPair(false)">${icon('watch')}워치 코드로 연결${icon('chevron')}</button><p class="small entry-note">계정 없이도 코드로 시작할 수 있어요.<br>계속 보관할 기록은 Google 계정에 연결해 주세요.</p>${recoveryHelp()}</main>${accountFooter()}`;
    return;
  }
  if (view === 'link-account') {
    const w = currentWatch();
    app.innerHTML = accountPageHeader() + `<main><div class="eyebrow">KEEP YOUR MOMENTS</div><h1 tabindex="-1">이 계정에<br>워치 기록을 연결할까요?</h1><p class="sub">로그인은 완료됐어요.<br>워치의 계정 연결은 아직 완료되지 않았어요.</p><div class="identity-card"><span class="account-avatar signed-in">민</span><span><b>${sampleAccount.name}</b><small>${sampleAccount.email}</small></span><span class="account-status">로그인됨</span></div><section class="block"><h2>${w.name}</h2><p class="small">${w.code} · 코드로 소유 확인됨</p><div class="data-row">연결할 업로드 기록<strong>${records.filter(r => r.watchId === w.id).length}개</strong></div></section><p class="small">연결을 완료하면 이 Google 계정으로 로그인해<br>이 워치의 업로드된 기록에 다시 접근할 수 있어요.</p><button class="primary full" style="margin-top:24px" onclick="confirmAccountLink()">이 계정에 기록 연결</button><button class="text-button full" onclick="accountBack()">나중에 연결하기</button>${recoveryHelp()}</main>${accountFooter()}`;
    return;
  }
  if (view === 'watches') {
    const watches = accountSignedIn ? linkedWatches() : [currentWatch()];
    app.innerHTML = accountPageHeader('기록으로') + `<main><div class="section-head"><h1 tabindex="-1">${accountSignedIn ? '내 워치' : '연결된 워치'}</h1><button class="icon" aria-label="계정 보기" onclick="goAccountView('account',false)">${icon('person')}</button></div><p class="sub">${accountSignedIn ? sampleAccount.email + '<br>열어볼 워치를 선택하세요.' : '이 브라우저에서 코드로 연결한 워치예요.'}</p><div class="watch-list">${watches.map(w => `<button class="watch-card ${w.id === activeWatch ? 'selected' : ''}" onclick="chooseWatch('${w.id}')" aria-label="${w.name}, ${w.label}, 기록 ${records.filter(r => r.watchId === w.id).length}개 보기"><span class="watch-picker-icon">${icon('watch')}</span><span><b>${w.name}</b><small>${w.code}</small><span class="watch-meta">${w.label} · 기록 ${records.filter(r => r.watchId === w.id).length}개</span></span>${w.id === activeWatch ? icon('check') : icon('chevron')}</button>`).join('') || '<div class="empty"><strong>연결된 워치가 없어요</strong><p>워치의 6자리 코드로 새 워치를 연결하세요.</p></div>'}</div><button class="outline full" onclick="startPair(true)">${icon('watch')}새 워치 연결${icon('chevron')}</button>${!accountSignedIn ? `<section class="account-callout"><h2>워치를 바꾸기 전에</h2><p>Google 계정에 연결해 업로드한 기록을 계속 확인하세요.</p>${googleButton('Google 계정에 연결해 기록 보관', "googleLogin('link')")}</section>` : '<p class="small entry-note">이전 워치의 기록도 해당 워치를 선택해 볼 수 있어요.</p>'}${recoveryHelp()}</main>${accountFooter()}`;
    return;
  }
  if (view === 'unlink-watch') {
    const w = demoWatches.find(w => w.id === pendingUnlink) || currentWatch();
    app.innerHTML = accountPageHeader('계정으로') + `<main><div class="eyebrow">ACCOUNT CONNECTION</div><h1 tabindex="-1">계정에서 이 워치의<br>연결을 해제할까요?</h1><section class="block"><h2>${w.name}</h2><p class="small">${w.code}</p><p>이 계정으로 해당 워치의 기록에 접근할 수 없게 됩니다.</p></section><div class="account-warning">브라우저 로그아웃과 다른 작업이에요.<br>코드로 소유를 확인해 다시 연결할 수 있어요.</div><button class="outline full destructive" style="margin-top:24px" onclick="confirmUnlink()">계정에서 워치 연결 해제</button><button class="text-button full" onclick="goAccountView('account',false)">취소</button></main>${accountFooter()}`;
    return;
  }
  const w = currentWatch();
  app.innerHTML = accountPageHeader('기록으로') + `<main><div class="eyebrow">MY ACCOUNT</div><h1 tabindex="-1">내 계정</h1>${accountSignedIn ? `<div class="identity-card"><span class="account-avatar signed-in">민</span><span><b>${sampleAccount.name}</b><small>${sampleAccount.email}</small></span></div>` : '<p class="sub">현재 Google 계정에 로그인하지 않았어요.</p>'}<section class="block"><div class="section-head"><h2>기록 보관 연결</h2><span class="account-status ${w.linked ? 'complete' : ''}">${w.linked ? '계정 연결 완료' : '계정 미연결'}</span></div><p>${w.linked ? '이 워치의 업로드된 기록은 이 Google 계정으로 다시 확인할 수 있어요.' : '워치 인증 정보와 브라우저 접근을 잃기 전에 Google 계정에 연결해 주세요.'}</p>${!w.linked ? googleButton('Google 계정에 연결해 기록 보관', "googleLogin('link')") : ''}</section><button class="account-row" onclick="goAccountView('watches',false)">${icon('watch')}<span>워치 선택 · 새 워치 연결<small>${accountSignedIn ? linkedWatches().length : 1}개 워치</small></span>${icon('chevron')}</button>${accountSignedIn ? `<button class="account-row" onclick="logoutConfirm()">${icon('logout')}<span>이 브라우저에서 로그아웃<small>워치의 계정 연결은 유지돼요</small></span>${icon('chevron')}</button>` : googleButton('Google로 로그인', "googleLogin('login')")}${w.linked ? `<section class="account-danger"><h2>계정 연결 관리</h2><p class="small">${w.name} · ${w.code}</p><button class="text-button destructive" onclick="requestUnlink('${w.id}')">계정에서 워치 연결 해제</button></section>` : ''}${recoveryHelp()}</main>${accountFooter()}`;
}
function googleLogin(mode) {
  accountSignedIn = true;
  if (mode === 'link') { goAccountView('link-account'); return; }
  demoWatches[0].linked = true; demoWatches[1].linked = true;
  goAccountView('watches');
}
function confirmAccountLink() {
  currentWatch().linked = true;
  guestConnected = true;
  goAccountView('account', false);
  document.querySelector('.account-status.complete')?.setAttribute('role', 'status');
}
function chooseWatch(id) {
  activeWatch = id; category = '전체'; search = ''; selectedPlace = null;
  goAccountView('list', false);
}
function startPair(newWatch) { pairingNewWatch = newWatch; goAccountView('pair'); }
pair = function() {
  app.innerHTML = accountPageHeader() + `<main class="pair"><div class="eyebrow">${accountSignedIn ? 'ADD A WATCH' : 'CONNECT BY CODE'}</div><h1 tabindex="-1">${accountSignedIn && pairingNewWatch ? '새 워치 연결하기' : '워치와 연결하기'}</h1><p class="sub">${accountSignedIn ? sampleAccount.email + '<br>이 계정에 연결할 워치의 코드를 입력하세요.' : '워치에 표시된 접속 코드로 연결하면<br>업로드된 기록을 바로 볼 수 있어요.'}</p><form class="pair-box" onsubmit="event.preventDefault();connect()"><label for="code">6자리 접속 코드</label><input class="code" id="code" name="code" placeholder="000000" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required aria-describedby="code-help"><p class="small" id="code-help">워치 앱 → 웹 접속 → 코드 생성</p><p class="error" id="code-error" role="alert"></p><button class="primary full" style="margin-top:20px" type="submit">${accountSignedIn ? '코드 확인 후 계정에 워치 연결' : '워치 연결하기'}</button><details class="help"><summary>접속 코드를 찾을 수 없나요?</summary><p class="small">워치 앱의 설정에서 ‘웹 접속’을 열어 코드를 생성하세요. 코드는 5분 동안 유효해요.</p></details></form>${!accountSignedIn ? '<div class="account-warning">코드 연결만으로는 계정에 기록이 보관되지 않아요.<br>연결 후 Google 계정에 기록을 연결할 수 있어요.</div>' : ''}${recoveryHelp()}</main>${accountFooter()}`;
};
connect = function() {
  const code = document.querySelector('#code').value;
  if (!/^\d{6}$/.test(code)) { document.querySelector('#code-error').textContent = '숫자 6자리를 입력해 주세요.'; return; }
  guestConnected = true;
  if (accountSignedIn && pairingNewWatch) {
    const id = 'new-' + demoWatches.length;
    demoWatches.push({ id, name: '새 Galaxy Watch', code: 'HL-1122334455', label: '새 워치', linked: true });
    activeWatch = id;
  } else if (accountSignedIn) currentWatch().linked = true;
  pairingNewWatch = false;
  goAccountView('list', false);
};
function requestUnlink(id) { pendingUnlink = id; goAccountView('unlink-watch', false); }
function confirmUnlink() {
  const w = demoWatches.find(w => w.id === pendingUnlink); if (w) w.linked = false;
  pendingUnlink = null;
  if (linkedWatches().length) activeWatch = linkedWatches()[0].id;
  goAccountView('watches', false);
}
function logoutConfirm() {
  showDialog(`<div class="section-head"><h2 id="dialog-title">이 브라우저에서 로그아웃할까요?</h2><button class="icon" aria-label="닫기" onclick="dialog.close()">${icon('close')}</button></div><p class="small">계정에 연결한 워치는 그대로 유지돼요.<br>다시 로그인하면 연결된 워치와 기록을 볼 수 있어요.</p><button class="primary full" style="margin-top:20px" onclick="accountLogout()">로그아웃</button><button class="text-button full" onclick="dialog.close()">취소</button>`);
}
function accountLogout() { dialog.close(); accountSignedIn = false; guestConnected = false; goAccountView('welcome', false); }
menu = function(isDetail) {
  originalMenu(isDetail);
  if (!isDetail) dialog.insertAdjacentHTML('beforeend', `<button class="menu-option" onclick="dialog.close();goAccountView('account')">${icon('person')}계정 및 로그인</button><button class="menu-option" onclick="dialog.close();goAccountView('watches')">${icon('watch')}워치 선택 · 새 워치 연결</button>`);
};
goBack = function() { if (authScreens.includes(view) || view === 'pair') accountBack(); else originalGoBack(); };
const accountParams = new URLSearchParams(location.search);
if (accountParams.get('account') === 'linked') { guestConnected = false; accountSignedIn = true; demoWatches.forEach(w => w.linked = true); }
if (accountParams.get('account') === 'google') accountSignedIn = true;
if (accountParams.get('watch') === 'old') activeWatch = 'old';
if (view === 'welcome' || view === 'signin-error') guestConnected = false;
if (accountParams.get('authview')) view = accountParams.get('authview');
if (view === 'unlink-watch') pendingUnlink = activeWatch;
nearestDay = function() { year=2026; month=10; date=Math.max(...filtered().map(r=>r.day),1); updateContent(); document.querySelector('.days button[aria-pressed=true]')?.focus(); };
render();
