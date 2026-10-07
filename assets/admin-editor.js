(() => {
  const app = window.LOVETT_APP;
  const utils = window.LOVETT_IMAGE_UTILS;
  if (!app || !utils) return;

  const loginModal = document.getElementById('adminLoginModal');
  const loginForm = document.getElementById('adminLoginForm');
  const passwordInput = document.getElementById('adminPasswordInput');
  const loginError = document.getElementById('adminLoginError');
  const loginClose = document.querySelector('.admin-login-close');
  const secretTarget = document.getElementById('adminSecretTarget');
  const editor = document.getElementById('adminEditor');
  let activeTab = 'home';
  let selectedProjectId = app.projects[0]?.id || null;
  let selectedEventId = app.events[0]?.id || null;
  let selectedScheduleYear = new Date().getFullYear();
  let homeHeroBlobUrl = null;
  const collapsedCards = new Set();

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  const isTemp = v => /^(blob:|data:)/.test(String(v || ''));
  function projectThumbUrl(p) {
    const preview = p.previewCovers?.all;
    if (preview) return preview;
    const cover = p.covers?.all || p.images?.[0]?.src;
    if (!cover) return '';
    const img = (p.images || []).find(i => i.src === cover);
    if (img?.thumbSrc) return img.thumbSrc;
    return isTemp(cover) ? cover : window.LOVETT_ASSET('thumbs', cover);
  }
  function eventThumbUrl(e) {
    const first = e.images?.[0];
    if (!first) return '';
    return isTemp(first) ? first : window.LOVETT_ASSET('full', first);
  }
  function listThumb(url) {
    return url ? `<img class="admin-list-thumb" src="${url}" alt="" loading="lazy" decoding="async">` : '<span class="admin-list-thumb is-empty">NO IMAGE</span>';
  }
  const QUICK_KEY = 'lovett-quick-upload';
  function quickUploadOn() { try { return localStorage.getItem(QUICK_KEY) !== 'off'; } catch (_) { return true; } }
  function setQuickUpload(on) { try { localStorage.setItem(QUICK_KEY, on ? 'on' : 'off'); } catch (_) {} }

  // 자르기 없이 바로 추가: 상세는 긴 변 2800px WebP, 썸네일은 4:3으로 자동(세로 그림은 얼굴이 있는 위쪽 기준)
  async function quickConvert(file) {
    const source = await utils.fileToSource(file);
    try {
      const full = await utils.makeResizedWebP(source, { maxEdge: 2800, quality: .88 });
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 600;
      const scale = Math.max(800 / source.width, 600 / source.height);
      const w = source.width * scale, h = source.height * scale;
      const y = h > 600 ? -(h - 600) * 0.28 : (600 - h) / 2;
      canvas.getContext('2d').drawImage(source, (800 - w) / 2, y, w, h);
      const thumb = await utils.makeCanvasWebP(canvas, { quality: .84 });
      const fullUrl = URL.createObjectURL(full.blob);
      return { fullUrl, cleanFullUrl: fullUrl, thumbUrl: URL.createObjectURL(thumb.blob), commercial: false, company: '' };
    } finally { if (source.close) source.close(); }
  }

  // 업로드 칸에 파일을 끌어다 놓으면 '파일 선택'과 똑같이 처리합니다.
  function enableDrop(label) {
    if (!label || label.dataset.dropReady) return;
    label.dataset.dropReady = '1';
    const input = label.querySelector('input[type=file]');
    ['dragenter', 'dragover'].forEach(type => label.addEventListener(type, event => { event.preventDefault(); label.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(type => label.addEventListener(type, () => label.classList.remove('is-dragover')));
    label.addEventListener('drop', event => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
      if (!files.length || !input) return;
      const dt = new DataTransfer();
      (input.multiple ? files : files.slice(0, 1)).forEach(f => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function openLogin() {
    if (!loginModal?.open) loginModal.showModal();
    loginError.textContent = '';
    passwordInput.value = '';
    setTimeout(() => passwordInput.focus(), 50);
  }

  secretTarget?.addEventListener('click', event => {
    if (event.ctrlKey && event.shiftKey && event.altKey) {
      event.preventDefault();
      openLogin();
    }
  });

  loginClose?.addEventListener('click', () => loginModal.close());
  loginModal?.addEventListener('click', event => { if (event.target === loginModal) loginModal.close(); });
  // 비밀번호는 사이트 파일에 글자 그대로 넣지 않고, 되돌릴 수 없는 암호값(해시)만 저장합니다.
  async function passwordHash(value) {
    if (!window.crypto?.subtle) throw new Error('이 주소에서는 확인할 수 없습니다. https 주소(lovett.my)로 열어 주세요.');
    const bytes = new TextEncoder().encode(`lovett-portfolio::${value}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const legacy = app.settings.adminPreviewPassword; // 예전 data.js와도 호환
      const ok = app.settings.adminPasswordHash
        ? (await passwordHash(passwordInput.value)) === app.settings.adminPasswordHash
        : (legacy != null && passwordInput.value === legacy);
      if (!ok) {
        loginError.textContent = '비밀번호가 맞지 않습니다.';
        return;
      }
    } catch (error) { loginError.textContent = error.message; return; }
    loginModal.close();
    openEditor();
  });

  function openEditor() {
    editor.hidden = false;
    document.body.classList.add('admin-editor-open');
    renderEditor();
    // 비공개 저장소의 미공개 작품을 불러와 목록에 추가합니다 (사이트에는 표시하지 않음).
    window.LOVETT_PUBLISH?.loadPrivate?.().then(changed => {
      if (changed) { renderEditor(); setTab(activeTab); }
      const st = window.LOVETT_PUBLISH?.privateStatus?.();
      const n = app.projects.filter(x => x.private).length;
      const el = editor.querySelector('#adminSaveStatus');
      if (el && st?.loaded && n) el.insertAdjacentHTML('beforeend', ` <span class="admin-private-note">· 미공개 작품 ${n}개 불러옴</span>`);
      else if (el && st?.error && app.projects.some(x => x.private)) el.insertAdjacentHTML('beforeend', ` <span class="admin-private-note">· 미공개 저장소 연결 안 됨: ${escapeHtml(st.error)}</span>`);
    });
  }

  function closeEditor() {
    editor.hidden = true;
    document.body.classList.remove('admin-editor-open');
  }

  function toast(text) {
    let el = editor.querySelector('.admin-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function setTab(tab) {
    if (tab !== activeTab) { const body = editor.querySelector('.admin-body'); if (body) body.scrollTop = 0; }
    activeTab = tab;
    editor.querySelectorAll('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    editor.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.section === tab));
  }

  function renderEditor() {
    const keepScroll = editor.querySelector('.admin-body')?.scrollTop || 0;
    editor.innerHTML = `
      <div class="admin-top">
        <div class="admin-top-line">
          <div><p class="eyebrow">PRIVATE EDITOR</p><h2>포트폴리오 편집</h2></div>
          <div class="admin-top-actions"><button class="admin-primary-btn admin-publish-btn" id="adminPublish">사이트에 저장</button><button class="admin-soft-btn" id="adminPublishSettings" title="저장 연결 설정">설정</button><button class="admin-soft-btn" id="adminPreviewGuide">GUIDE 보기</button><button class="admin-icon-btn" id="adminClose">닫기</button></div>
        </div>
        <div class="admin-unsaved" id="adminSaveStatus">수정한 뒤 <b>사이트에 저장</b>을 눌러야 실제 사이트에 반영됩니다. 저장하지 않고 새로고침하면 수정 내용이 사라집니다.</div>
        <div class="admin-tabs">
          <button class="admin-tab" data-tab="home">HOME</button>
          <button class="admin-tab" data-tab="works">WORKS</button>
          <button class="admin-tab" data-tab="activity">ACTIVITY</button>
          <button class="admin-tab" data-tab="guide">GUIDE</button>
          <button class="admin-tab" data-tab="assistant">도우미</button>
        </div>
      </div>
      <div class="admin-body">
        <section class="admin-section" data-section="home">${homeSection()}</section>
        <section class="admin-section" data-section="works">${worksSection()}</section>
        <section class="admin-section" data-section="activity">${activitySection()}</section>
        <section class="admin-section" data-section="guide">${guideSection()}</section>
        <section class="admin-section" data-section="assistant">${assistantSection()}</section>
      </div>
      <div class="admin-toast"></div>
      <div class="admin-crop-modal" id="adminCropModal" hidden></div>
    `;
    bindCommon();
    bindHome();
    bindWorks();
    bindActivity();
    bindGuide();
    bindAssistant();
    enableCardFolding();
    editor.querySelectorAll('.admin-upload, .ah-hero').forEach(enableDrop);
    editor.querySelectorAll('[data-list-search]').forEach(input => {
      const list = editor.querySelector(input.dataset.listSearch);
      const apply = () => {
        const q = input.value.trim().toLowerCase();
        list?.querySelectorAll('.admin-list-item').forEach(item => { item.hidden = q && !item.textContent.toLowerCase().includes(q); });
      };
      input.addEventListener('input', apply); apply();
    });
    setTab(activeTab);
    const body = editor.querySelector('.admin-body');
    if (body && keepScroll) body.scrollTop = keepScroll;
  }

  function enableCardFolding() {
    editor.querySelectorAll('.admin-section').forEach(section => {
      const title = section.querySelector(':scope > .admin-section-title');
      if (title && !title.querySelector('.admin-fold-all')) {
        const group = document.createElement('div');
        group.className = 'admin-fold-all';
        group.innerHTML = '<button type="button" data-fold-all="close">모두 접기</button><button type="button" data-fold-all="open">모두 펼치기</button>';
        title.appendChild(group);
        group.querySelector('[data-fold-all="close"]').addEventListener('click', () => {
          section.querySelectorAll('.admin-card:not(.admin-rule-card)').forEach(card => setCardCollapsed(card, true));
          section.querySelectorAll('details.admin-rule-card').forEach(card => card.open = false);
        });
        group.querySelector('[data-fold-all="open"]').addEventListener('click', () => {
          section.querySelectorAll('.admin-card:not(.admin-rule-card)').forEach(card => setCardCollapsed(card, false));
          section.querySelectorAll('details.admin-rule-card').forEach(card => card.open = true);
        });
      }
    });
    editor.querySelectorAll('.admin-card:not(.admin-rule-card)').forEach((card, index) => {
      const head = card.querySelector(':scope > .admin-card-head');
      if (!head || head.querySelector('.admin-fold-toggle')) return;
      const section = card.closest('.admin-section')?.dataset.section || 'section';
      const label = head.querySelector('h4')?.textContent?.trim() || `card-${index}`;
      const key = `${section}:${label}`;
      card.dataset.foldKey = key;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-fold-toggle';
      btn.setAttribute('aria-label', '접기 또는 펼치기');
      btn.textContent = '⌃';
      btn.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        setCardCollapsed(card, !card.classList.contains('collapsed'));
      });
      head.appendChild(btn);
      setCardCollapsed(card, collapsedCards.has(key), false);
    });
  }

  function setCardCollapsed(card, collapsed, remember = true) {
    if (!card) return;
    card.classList.toggle('collapsed', collapsed);
    const btn = card.querySelector(':scope > .admin-card-head .admin-fold-toggle');
    if (btn) btn.textContent = collapsed ? '⌄' : '⌃';
    const key = card.dataset.foldKey;
    if (remember && key) { if (collapsed) collapsedCards.add(key); else collapsedCards.delete(key); }
  }

  function bindCommon() {
    editor.querySelector('#adminClose')?.addEventListener('click', closeEditor);
    editor.querySelector('#adminPreviewGuide')?.addEventListener('click', () => app.showPage('guide'));
    editor.querySelector('#adminPublish')?.addEventListener('click', () => window.LOVETT_PUBLISH?.publish({ toast, rerender: () => { renderEditor(); } }));
    editor.querySelector('#adminPublishSettings')?.addEventListener('click', () => window.LOVETT_PUBLISH?.openSettings());
    editor.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  }

  function heroImageUrl() {
    const v = app.settings.heroImage;
    if (!v) return document.getElementById('heroImage')?.src || '';
    return /^(blob:|data:|https?:)/.test(v) ? v : window.LOVETT_ASSET('full', v);
  }

  function homeSection() {
    const ko = app.translations.ko;
    const hasKey = !!(app.settings.formsubmitId || '').trim();
    return `
      <div class="admin-section-title"><div><h3>HOME</h3><p>첫 화면 문구와 대표 이미지, 연락처를 수정합니다.</p></div></div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>첫 화면 문구</h4><p class="admin-subtle">한국어(KO) 화면에 보이는 문구입니다. 입력하면 왼쪽 사이트에 바로 보입니다.</p></div></div>
        <div class="ah-preview" aria-hidden="true">
          <span id="ahPrev1">${escapeHtml(ko.heroLine1)}</span>
          <span class="ah-preview-hl" id="ahPrev2">${escapeHtml(ko.heroLine2)}</span>
          <span id="ahPrev3">${escapeHtml(ko.heroLine3)}</span>
        </div>
        <div class="ah-lines">
          <label class="admin-field"><span>1줄</span><input id="editHero1" value="${escapeHtml(ko.heroLine1)}"></label>
          <label class="admin-field"><span>2줄 · 강조(노란 형광펜)</span><input id="editHero2" value="${escapeHtml(ko.heroLine2)}"></label>
          <label class="admin-field"><span>3줄</span><input id="editHero3" value="${escapeHtml(ko.heroLine3)}"></label>
        </div>
        <label class="admin-field"><span>소개 문구</span><textarea id="editHeroDescription">${escapeHtml(ko.heroDescription)}</textarea></label>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>대표 이미지</h4><p class="admin-subtle">첫 화면 오른쪽에 크게 보이는 그림입니다.</p></div></div>
        <div class="ah-hero">
          <img id="adminHeroPreview" src="${heroImageUrl()}" alt="현재 대표 이미지">
          <div class="ah-hero-actions">
            <label class="aii-btn ah-file">새 이미지 올리기<input id="editHeroImage" type="file" accept="image/*"></label>
            <button type="button" class="aii-btn" id="recropHero">지금 이미지 다시 자르기</button>
            <p class="admin-subtle">올린 뒤 확대·축소·위치 이동으로 맞춥니다. 파일을 이 칸으로 끌어다 놓아도 돼요.</p>
          </div>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>연락처</h4><p class="admin-subtle">첫 화면, 푸터, 문의 폼의 '메일 앱으로 보내기'에 쓰입니다.</p></div></div>
        <div class="admin-grid">
          <label class="admin-field"><span>이메일</span><input id="editEmail" type="email" value="${escapeHtml(app.settings.email)}"></label>
          <label class="admin-field"><span>X 주소</span><input id="editXUrl" type="url" value="${escapeHtml(app.settings.xUrl)}"></label>
        </div>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>문의 폼 연결</h4><p class="admin-subtle">'작업 문의' 폼은 FormSubmit(무료)으로 위 이메일에 보내집니다. 참고 이미지는 메일 첨부파일로 와요.</p></div><span class="ah-status ${hasKey?'on':''}" id="contactKeyStatus">${hasKey?'주소 숨김 코드 사용 중':'이메일로 바로 전송'}</span></div>
        <ol class="ah-steps">
          <li>사이트에서 문의 폼으로 <b>시험 문의를 한 번</b> 보냅니다.</li>
          <li>메일함에 FormSubmit의 확인 메일이 오면 <b>Activate Form</b>을 누릅니다. 이때부터 문의가 메일로 와요. (스팸함도 확인)</li>
          <li>선택: 활성화 후 오는 메일의 <b>긴 무작위 코드</b>를 아래에 넣고 저장하면, 사이트 코드에서 이메일 대신 그 코드가 쓰입니다.</li>
        </ol>
        <label class="admin-field"><span>FormSubmit 코드 (선택)</span><input id="editContactKey" value="${escapeHtml(app.settings.formsubmitId || '')}" placeholder="비워두면 위 이메일 주소로 보냅니다" autocomplete="off"></label>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>편집기 비밀번호</h4><p class="admin-subtle">편집 화면을 여는 비밀번호입니다. 사이트 파일에는 암호화된 값만 저장돼서 코드를 열어봐도 보이지 않아요.</p></div></div>
        <div class="admin-grid">
          <label class="admin-field"><span>새 비밀번호</span><input id="newAdminPw" type="password" autocomplete="new-password" placeholder="6자 이상"></label>
          <label class="admin-field"><span>한 번 더</span><input id="newAdminPw2" type="password" autocomplete="new-password"></label>
        </div>
        <button type="button" class="aii-btn" id="changeAdminPw">비밀번호 바꾸기</button>
      </div>`;
  }

  function bindHome() {
    const update = () => {
      app.setHeroText({
        line1: editor.querySelector('#editHero1').value,
        line2: editor.querySelector('#editHero2').value,
        line3: editor.querySelector('#editHero3').value,
        description: editor.querySelector('#editHeroDescription').value
      });
      app.settings.email = editor.querySelector('#editEmail').value.trim();
      app.settings.xUrl = editor.querySelector('#editXUrl').value.trim();
      app.settings.formsubmitId = editor.querySelector('#editContactKey').value.trim();
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => a.href = `mailto:${app.settings.email}`);
      document.querySelectorAll('a[href*="x.com/"]').forEach(a => a.href = app.settings.xUrl);
    };
    ['#editHero1','#editHero2','#editHero3','#editHeroDescription','#editEmail','#editXUrl','#editContactKey'].forEach(sel => editor.querySelector(sel)?.addEventListener('input', update));
    [['#editHero1','#ahPrev1'],['#editHero2','#ahPrev2'],['#editHero3','#ahPrev3']].forEach(([from,to]) => editor.querySelector(from)?.addEventListener('input', e => { const el = editor.querySelector(to); if (el) el.textContent = e.target.value; }));
    editor.querySelector('#editContactKey')?.addEventListener('input', e => { const st = editor.querySelector('#contactKeyStatus'); const on = !!e.target.value.trim(); if (st) { st.classList.toggle('on', on); st.textContent = on ? '주소 숨김 코드 사용 중' : '이메일로 바로 전송'; } });
    editor.querySelector('#changeAdminPw')?.addEventListener('click', async () => {
      const a = editor.querySelector('#newAdminPw').value, b = editor.querySelector('#newAdminPw2').value;
      if (a.length < 6) { alert('비밀번호는 6자 이상으로 정해 주세요.'); return; }
      if (a !== b) { alert('두 칸의 비밀번호가 다릅니다.'); return; }
      try { app.settings.adminPasswordHash = await passwordHash(a); } catch (error) { alert(error.message); return; }
      editor.querySelector('#newAdminPw').value = ''; editor.querySelector('#newAdminPw2').value = '';
      toast('비밀번호를 바꿨습니다. 사이트에 저장을 눌러야 적용돼요.');
    });
    editor.querySelector('#recropHero')?.addEventListener('click', async () => {
      try {
        const source = await utils.urlToSource(heroImageUrl());
        const cropped = await openCropper(source, { title:'HOME 대표 이미지', aspect:1.45, outputWidth:1740, outputHeight:1200, quality:.88, allowAspect:false });
        if (homeHeroBlobUrl) URL.revokeObjectURL(homeHeroBlobUrl);
        homeHeroBlobUrl = URL.createObjectURL(cropped.blob);
        app.setHeroImage(homeHeroBlobUrl);
        if (source.close) source.close();
        renderEditor(); setTab('home');
        toast('대표 이미지를 다시 잘랐습니다. 사이트에 저장을 눌러 반영하세요.');
      } catch (error) { if (error.message !== 'CROP_CANCEL') alert(error.message); }
    });
    editor.querySelector('#editHeroImage')?.addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const source = await utils.fileToSource(file);
        const cropped = await openCropper(source, { title:'HOME 대표 이미지', aspect:1.45, outputWidth:1740, outputHeight:1200, quality:.88, allowAspect:false });
        if (homeHeroBlobUrl) URL.revokeObjectURL(homeHeroBlobUrl);
        homeHeroBlobUrl = URL.createObjectURL(cropped.blob);
        app.setHeroImage(homeHeroBlobUrl);
        if (source.close) source.close();
        renderEditor(); setTab('home');
        toast('HOME 대표 이미지를 바꿨습니다. 사이트에 저장을 눌러 반영하세요.');
      } catch (error) { if (error.message !== 'CROP_CANCEL') alert(error.message); }
      event.target.value = '';
    });
  }

  function worksSection() {
    const selected = app.projects.find(p => p.id === selectedProjectId) || app.projects[0];
    if (selected) selectedProjectId = selected.id;
    return `
      <div class="admin-section-title"><div><h3>WORKS</h3><p>프로젝트 추가·수정·숨김·삭제와 이미지를 관리합니다.</p></div><button class="admin-soft-btn" id="addProject">+ 프로젝트</button></div>
      <div class="admin-split">
        <div class="admin-list-wrap"><input class="admin-list-search" type="search" placeholder="프로젝트 검색" data-list-search="#projectList"><div class="admin-list" id="projectList">${projectListHtml()}</div></div>
        <div id="projectEditor">${selected ? projectEditorHtml(selected) : '<div class="admin-card">프로젝트가 없습니다.</div>'}</div>
      </div>`;
  }

  function projectListHtml() {
    return app.projects.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(p => `
      <button class="admin-list-item has-thumb ${p.id===selectedProjectId?'active':''} ${p.visible===false?'is-hidden-item':''} ${p.private?'is-private-item':''}" data-project-id="${escapeHtml(p.id)}">
        ${listThumb(projectThumbUrl(p))}
        <span class="admin-list-text"><b>${escapeHtml(typeof p.title === 'object' ? p.title.ko : p.title)}</b><small>${escapeHtml(p.year)} · ${(p.categories||[]).join(' / ').toUpperCase()} · ${(p.images||[]).length}장${p.visible===false?' · 숨김':''}</small>${p.private?'<span class="admin-private-badge">미공개</span>':''}
        <span class="admin-list-tools"><span class="admin-mini" data-move="up">↑</span><span class="admin-mini" data-move="down">↓</span></span></span>
      </button>`).join('');
  }

  function projectEditorHtml(p) {
    const cats = ['ld','cover','sd','costume','original','edit','background'];
    const title = typeof p.title === 'object' ? p.title.ko : p.title;
    const desc = typeof p.description === 'object' ? p.description.ko : p.description;
    return `
      <div class="admin-card">
        <div class="admin-card-head"><h4>기본 정보</h4><button class="admin-danger-btn" id="deleteProject">삭제</button></div>
        <div class="admin-grid">
          <label class="admin-field full"><span>제목</span><input data-pfield="title" value="${escapeHtml(title)}"></label>
          <label class="admin-field full"><span>영문 이름 (파일 이름용)</span><input data-pfield="slug" value="${escapeHtml(p.slug || '')}" placeholder="${escapeHtml(window.LOVETT_FILE_NAMES?.projectSlug(p) || '')}"><small>영문 소문자·숫자·하이픈(-)만 사용. 새로 올리는 이미지 이름: <b>${escapeHtml(window.LOVETT_FILE_NAMES?.projectExample(p) || '')}</b></small></label>
          <label class="admin-field"><span>연도</span><input data-pfield="year" value="${escapeHtml(p.year)}"></label>
          <label class="admin-field"><span>구분</span><select data-pfield="type"><option ${p.type==='WORK'?'selected':''}>WORK</option><option ${p.type==='FANART'?'selected':''}>FANART</option><option ${p.type==='ORIGINAL'?'selected':''}>ORIGINAL</option></select></label>
          <label class="admin-field"><span>채색</span><select data-pfield="style"><option value="">없음</option><option ${p.style==='깔끔'?'selected':''}>깔끔</option><option ${p.style==='꾸덕'?'selected':''}>꾸덕</option><option ${p.style==='기타'?'selected':''}>기타</option></select></label>
          <label class="admin-field full admin-private-toggle"><input type="checkbox" data-private-toggle ${p.private?'checked':''}><span><b>미공개 작품</b> 사이트에 올리지 않고 비공개 저장소에만 보관합니다. 공개할 때 체크를 풀고 저장하세요.</span></label>
          <label class="admin-field"><span>공개</span><select data-pfield="visible"><option value="true" ${p.visible!==false?'selected':''}>공개</option><option value="false" ${p.visible===false?'selected':''}>숨김</option></select></label>
          <label class="admin-field full"><span>설명</span><textarea data-pfield="description">${escapeHtml(desc)}</textarea></label>
          <label class="admin-field full"><span>추가 태그 · 쉼표 구분</span><input data-pfield="extraTags" value="${escapeHtml((p.extraTags||[]).join(', '))}"></label>
        </div>
        <span class="admin-label">분야</span><div class="admin-checks">${cats.map(cat=>`<label class="admin-check"><input type="checkbox" data-category="${cat}" ${(p.categories||[]).includes(cat)?'checked':''}>${cat.toUpperCase()}</label>`).join('')}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-head"><div><h4>이미지</h4><p class="admin-subtle">추가할 때 상세 이미지와 4:3 썸네일을 각각 확대·축소·이동해 자를 수 있습니다.</p></div></div>
        <div class="admin-image-grid" id="projectImages">${projectImagesHtml(p)}</div>
        <label class="admin-upload" style="margin-top:9px"><span class="admin-upload-text">이미지 추가 · 여러 장 선택하거나 여기로 끌어다 놓기</span><input id="projectImageInput" type="file" accept="image/*" multiple></label>
        <label class="admin-quick-toggle"><input type="checkbox" id="quickUploadToggle" ${quickUploadOn()?'checked':''}><span><b>빠른 업로드</b> 자르기 없이 바로 추가하고 썸네일은 자동으로 만듭니다. 마음에 안 드는 것만 나중에 '썸네일 자르기'로 고치면 돼요.</span></label>
      </div>`;
  }

  function projectImagesHtml(p) {
    const cats = ['all', ...(p.categories||[])];
    return (p.images||[]).map((img,index) => {
      const src = img.thumbSrc || (String(img.src).startsWith('blob:') ? img.src : window.LOVETT_ASSET('thumbs', img.src));
      const coverOf = cats.filter(cat => p.covers?.[cat] === img.src);
      const caption = typeof img.caption==='object' ? img.caption.ko : (img.caption||'');
      return `<div class="admin-image-item aii" data-image-index="${index}">
        <div class="aii-media">
          <img src="${src}" alt="" loading="lazy" decoding="async">
          <span class="aii-num">${index + 1}</span>
          ${coverOf.length ? `<span class="aii-cover-badge">대표 · ${coverOf.map(c=>c.toUpperCase()).join(' / ')}</span>` : ''}
          ${img.commercial && img.company ? '<span class="aii-copy-badge">©</span>' : ''}
        </div>
        <div class="admin-image-info aii-body">
          <label class="aii-field"><span class="aii-title">캡션</span><input class="admin-field-caption" value="${escapeHtml(caption)}" placeholder="예: LD 일러스트 · 장패드"></label>
          <div class="aii-group">
            <span class="aii-title">자르기</span>
            <div class="aii-row"><button type="button" class="aii-btn" data-edit-thumb>썸네일 (4:3)</button><button type="button" class="aii-btn" data-edit-full>상세 이미지</button></div>
          </div>
          <div class="aii-group">
            <span class="aii-title">대표 이미지로 쓰기 <small>누르면 해당 필터의 목록 사진이 이 그림으로 바뀌어요</small></span>
            <div class="aii-row">${cats.map(cat => { const on = p.covers?.[cat] === img.src; return `<button type="button" class="aii-chip ${on?'is-on':''}" data-cover="${cat}" aria-pressed="${on}">${on?'✓ ':''}${cat.toUpperCase()}</button>`; }).join('')}</div>
          </div>
          <div class="admin-image-license"><label class="admin-commercial-check"><input type="checkbox" data-image-commercial ${img.commercial?'checked':''}><span>상업적 작업 · 저작권 양도</span></label><label class="admin-company-field ${img.commercial?'':'is-hidden'}"><span>회사명</span><input data-image-company value="${escapeHtml(img.company||'')}" placeholder="예: COMPANY NAME"></label>${img.commercial&&img.company?`<small class="admin-copyright-preview">Copyright assigned to ${escapeHtml(img.company)}.</small>`:''}</div>
          <div class="aii-footer"><button type="button" class="aii-delete" data-remove-image>이미지 삭제</button></div>
        </div>
      </div>`;
    }).join('') || '<div class="admin-subtle">등록된 이미지가 없습니다.</div>';
  }

  function bindWorks() {
    editor.querySelector('#addProject')?.addEventListener('click', () => {
      const id = `project-${Date.now()}`;
      const order = Math.max(0,...app.projects.map(p=>p.sortOrder||0))+10;
      app.projects.push({id,title:'새 프로젝트',year:String(new Date().getFullYear()),categories:['ld'],style:'',type:'WORK',description:'',extraTags:[],covers:{},images:[],visible:true,sortOrder:order});
      selectedProjectId = id; app.refreshAll(); renderEditor(); setTab('works');
    });
    editor.querySelectorAll('#projectList .admin-list-item').forEach(item => {
      item.addEventListener('click', event => {
        const move = event.target.closest('[data-move]');
        if (move) { event.stopPropagation(); moveProject(item.dataset.projectId, move.dataset.move); return; }
        selectedProjectId = item.dataset.projectId; renderEditor(); setTab('works');
      });
    });
    bindProjectEditor();
  }

  function moveProject(id, dir) {
    const sorted = app.projects.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
    const index = sorted.findIndex(p=>p.id===id); const target = dir==='up'?index-1:index+1;
    if (index<0 || target<0 || target>=sorted.length) return;
    const a=sorted[index], b=sorted[target]; const tmp=a.sortOrder; a.sortOrder=b.sortOrder; b.sortOrder=tmp;
    app.refreshAll(); renderEditor(); setTab('works');
  }

  function bindProjectEditor() {
    const p = app.projects.find(p=>p.id===selectedProjectId); if (!p) return;
    editor.querySelectorAll('[data-pfield]').forEach(input => input.addEventListener('input', () => {
      const field = input.dataset.pfield;
      if (field==='visible') p.visible = input.value==='true';
      else if (field==='extraTags') p.extraTags = input.value.split(',').map(v=>v.trim()).filter(Boolean);
      else p[field] = input.value;
      app.refreshAll();
    }));
    editor.querySelector('[data-private-toggle]')?.addEventListener('change', event => {
      if (event.target.checked) p.private = true; else delete p.private;
      app.refreshAll(); renderEditor(); setTab('works');
      toast(p.private ? '미공개로 바꿨습니다. 사이트에 저장하면 비공개 저장소로 옮겨집니다.' : '공개로 바꿨습니다. 사이트에 저장하면 사이트에 올라갑니다.');
    });
    editor.querySelectorAll('[data-category]').forEach(box => box.addEventListener('change', () => {
      p.categories = [...editor.querySelectorAll('[data-category]:checked')].map(el=>el.dataset.category);
      app.refreshAll(); renderEditor(); setTab('works');
    }));
    editor.querySelector('#deleteProject')?.addEventListener('click', () => {
      if (!confirm('이 프로젝트를 삭제할까요? (사이트에 저장을 눌러야 실제로 반영됩니다)')) return;
      const index = app.projects.findIndex(x=>x.id===p.id); if(index>=0) app.projects.splice(index,1);
      selectedProjectId = app.projects[0]?.id || null; app.refreshAll(); renderEditor(); setTab('works');
    });
    editor.querySelectorAll('.admin-field-caption').forEach(input => input.addEventListener('input', () => {
      const index = Number(input.closest('[data-image-index]').dataset.imageIndex); p.images[index].caption = input.value; app.refreshAll();
    }));
    editor.querySelectorAll('[data-image-commercial]').forEach(input => input.addEventListener('change', async () => {
      const index = Number(input.closest('[data-image-index]').dataset.imageIndex);
      const image = p.images[index]; image.commercial = input.checked;
      if (!image.commercial) image.company = '';
      try { await refreshImageWatermark(p, image); }
      catch(error) { alert(`저작권 문구 적용에 실패했습니다.\n${error.message}`); }
      app.refreshAll(); renderEditor(); setTab('works');
    }));
    editor.querySelectorAll('[data-image-company]').forEach(input => {
      input.addEventListener('input', () => {
        const index = Number(input.closest('[data-image-index]').dataset.imageIndex);
        p.images[index].company = input.value.trim();
        const preview = input.closest('.admin-image-license')?.querySelector('.admin-copyright-preview');
        if (preview) preview.textContent = input.value.trim() ? `Copyright assigned to ${input.value.trim()}.` : '';
      });
      input.addEventListener('change', async () => {
        const index = Number(input.closest('[data-image-index]').dataset.imageIndex);
        const image = p.images[index];
        try { await refreshImageWatermark(p, image); }
        catch(error) { alert(`저작권 문구 적용에 실패했습니다.\n${error.message}`); }
        app.refreshAll(); renderEditor(); setTab('works');
      });
    });
    editor.querySelectorAll('[data-cover]').forEach(btn => btn.addEventListener('click', () => {
      const item = btn.closest('[data-image-index]'); const image = p.images[Number(item.dataset.imageIndex)]; const cat = btn.dataset.cover;
      p.covers ||= {}; p.previewCovers ||= {};
      p.covers[cat] = image.src;
      if (image.thumbSrc) p.previewCovers[cat] = image.thumbSrc; else delete p.previewCovers[cat];
      app.refreshAll(); renderEditor(); setTab('works'); toast(`${cat.toUpperCase()} 대표 이미지를 바꿨습니다.`);
    }));
    editor.querySelectorAll('[data-edit-thumb]').forEach(btn => btn.addEventListener('click', async () => {
      const index = Number(btn.closest('[data-image-index]').dataset.imageIndex);
      const image = p.images[index];
      try {
        const sourceUrl = image.thumbSrc || (String(image.src).startsWith('blob:') ? image.src : window.LOVETT_ASSET('full', image.src));
        const source = await utils.urlToSource(sourceUrl);
        const cropped = await openCropper(source, { title:'썸네일 자르기', aspect:4/3, outputWidth:800, outputHeight:600, quality:.84, allowAspect:false });
        image.thumbSrc = URL.createObjectURL(cropped.blob);
        p.previewCovers ||= {};
        Object.keys(p.covers||{}).forEach(key => { if (p.covers[key] === image.src) p.previewCovers[key] = image.thumbSrc; });
        if (source.close) source.close(); app.refreshAll(); renderEditor(); setTab('works');
      } catch(error) { if(error.message!=='CROP_CANCEL') alert(error.message); }
    }));
    editor.querySelectorAll('[data-edit-full]').forEach(btn => btn.addEventListener('click', async () => {
      const index = Number(btn.closest('[data-image-index]').dataset.imageIndex);
      const image = p.images[index];
      try {
        const sourceUrl = fullImageUrl(image.cleanSrc ?? image.src);
        const source = await utils.urlToSource(sourceUrl);
        const cropped = await openCropper(source, { title:'상세 이미지 자르기', aspect:null, outputWidth:null, outputHeight:null, quality:.88, allowAspect:true });
        const oldSrc = image.src;
        image.cleanSrc = URL.createObjectURL(cropped.blob);
        image.src = image.cleanSrc;
        if (image.commercial && image.company) {
          const stamped = await addCopyrightWatermark(cropped.blob, image.company, .88);
          image.src = URL.createObjectURL(stamped.blob);
        }
        Object.keys(p.covers||{}).forEach(key => { if (p.covers[key] === oldSrc) p.covers[key] = image.src; });
        if (source.close) source.close(); app.refreshAll(); renderEditor(); setTab('works');
      } catch(error) { if(error.message!=='CROP_CANCEL') alert(error.message); }
    }));
    editor.querySelectorAll('[data-remove-image]').forEach(btn => btn.addEventListener('click', () => {
      if (!confirm('이 이미지를 삭제할까요? (사이트에 저장을 눌러야 실제로 반영됩니다)')) return;
      const index = Number(btn.closest('[data-image-index]').dataset.imageIndex); p.images.splice(index,1); app.refreshAll(); renderEditor(); setTab('works');
    }));
    editor.querySelector('#quickUploadToggle')?.addEventListener('change', event => setQuickUpload(event.target.checked));
    editor.querySelector('#projectImageInput')?.addEventListener('change', async event => {
      const files = [...(event.target.files||[])];
      const quick = quickUploadOn();
      const label = event.target.closest('.admin-upload')?.querySelector('.admin-upload-text');
      for (const [i, file] of files.entries()) {
        try {
          if (label) label.textContent = `처리 중… ${i + 1} / ${files.length}`;
          const image = quick ? await quickConvert(file) : await cropAndConvert(file);
          p.images.push({src:image.fullUrl,cleanSrc:image.cleanFullUrl,thumbSrc:image.thumbUrl,caption:file.name.replace(/\.[^.]+$/,''),commercial:image.commercial,company:image.company});
          if (!p.covers?.all) { p.covers ||= {}; p.previewCovers ||= {}; p.covers.all=image.fullUrl; p.previewCovers.all=image.thumbUrl; }
        } catch (error) { if (error.message !== 'CROP_CANCEL') alert(error.message); }
      }
      app.refreshAll(); renderEditor(); setTab('works');
    });
  }

  function activitySection() {
    const selected = app.events.find(e=>e.id===selectedEventId) || app.events[0]; if(selected) selectedEventId=selected.id;
    return `
      <div class="admin-section-title"><div><h3>ACTIVITY</h3><p>행사와 A4 인포 이미지를 관리합니다.</p></div><button class="admin-soft-btn" id="addEvent">+ 행사</button></div>
      <div class="admin-split"><div class="admin-list-wrap"><input class="admin-list-search" type="search" placeholder="행사 검색" data-list-search="#eventList"><div class="admin-list" id="eventList">${eventListHtml()}</div></div><div id="eventEditor">${selected?eventEditorHtml(selected):'<div class="admin-card">행사가 없습니다.</div>'}</div></div>`;
  }

  function eventListHtml(){ return app.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(e=>{const status=app.eventStatusFromDate(e.date);e.status=status;return `<button class="admin-list-item has-thumb ${e.id===selectedEventId?'active':''} ${e.visible===false?'is-hidden-item':''}" data-event-id="${e.id}">${listThumb(eventThumbUrl(e))}<span class="admin-list-text"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.date)} · ${status==='done'?'참가 완료':'참가 예정'}${e.visible===false?' · 숨김':''}</small><span class="admin-list-tools"><span class="admin-mini" data-move="up">↑</span><span class="admin-mini" data-move="down">↓</span></span></span></button>`}).join(''); }

  function eventEditorHtml(e){
    return `<div class="admin-card"><div class="admin-card-head"><h4>행사 정보</h4><button class="admin-danger-btn" id="deleteEvent">삭제</button></div><div class="admin-grid">
      <label class="admin-field full"><span>행사명</span><input data-efield="title" value="${escapeHtml(e.title)}"></label>
      <label class="admin-field full"><span>영문 이름 (파일 이름용)</span><input data-efield="slug" value="${escapeHtml(e.slug || '')}" placeholder="${escapeHtml(window.LOVETT_FILE_NAMES?.eventSlug(e) || '')}"><small>영문 소문자·숫자·하이픈(-)만 사용. 새로 올리는 이미지 이름: <b>${escapeHtml(window.LOVETT_FILE_NAMES?.eventExample(e) || '')}</b></small></label>
      <label class="admin-field"><span>날짜</span><input data-efield="date" value="${escapeHtml(e.date)}"></label>
      <div class="admin-field"><span>상태 · 자동</span><div class="admin-auto-status ${app.eventStatusFromDate(e.date)}">${app.eventStatusFromDate(e.date)==='done'?'참가 완료':'참가 예정'}<small>입력한 행사 날짜가 지나면 자동으로 참가 완료로 변경됩니다.</small></div></div>
      <label class="admin-field full"><span>부스명</span><input data-efield="booth" value="${escapeHtml(e.booth||'')}"></label>
      <label class="admin-field full"><span>설명</span><textarea data-efield="description">${escapeHtml(e.description||'')}</textarea></label>
      <label class="admin-field full"><span>통판 링크</span><input data-efield="mailOrderUrl" type="url" placeholder="https://..." value="${escapeHtml(e.mailOrderUrl||'')}"><small>입력하면 행사 인포 팝업 맨 아래에 통판 버튼이 표시됩니다.</small></label>
      <label class="admin-field"><span>공개</span><select data-efield="visible"><option value="true" ${e.visible!==false?'selected':''}>공개</option><option value="false" ${e.visible===false?'selected':''}>숨김</option></select></label>
    </div></div>
    <div class="admin-card"><div class="admin-card-head"><div><h4>행사 인포 이미지</h4><p class="admin-subtle">세로 A4 이미지는 비율을 자르지 않고 WebP로 변환합니다.</p></div></div><div class="admin-image-grid">${eventImagesHtml(e)}</div><label class="admin-upload" style="margin-top:9px">인포 이미지 추가 · 여러 장 선택하거나 여기로 끌어다 놓기<input id="eventImageInput" type="file" accept="image/*" multiple></label></div>`;
  }

  function eventImagesHtml(e){ return (e.images||[]).map((src,index)=>`<div class="admin-image-item aii aii-event" data-event-image-index="${index}"><div class="aii-media"><img loading="lazy" decoding="async" src="${String(src).startsWith('blob:')?src:window.LOVETT_ASSET('full', src)}" alt=""><span class="aii-num">${index+1}</span></div><div class="aii-footer"><button type="button" class="aii-delete" data-remove-event-image>이미지 삭제</button></div></div>`).join('') || '<div class="admin-subtle">등록된 인포 이미지가 없습니다.</div>'; }

  function bindActivity(){
    editor.querySelector('#addEvent')?.addEventListener('click',()=>{const id=`event-${Date.now()}`;const order=Math.max(0,...app.events.map(e=>e.sortOrder||0))+10;app.events.push({id,status:'upcoming',date:String(new Date().getFullYear()),title:'새 행사',booth:'',images:[],description:'',mailOrderUrl:'',visible:true,sortOrder:order});selectedEventId=id;app.refreshAll();renderEditor();setTab('activity');});
    editor.querySelectorAll('#eventList .admin-list-item').forEach(item=>item.addEventListener('click',event=>{const move=event.target.closest('[data-move]');if(move){event.stopPropagation();moveEvent(item.dataset.eventId,move.dataset.move);return;}selectedEventId=item.dataset.eventId;renderEditor();setTab('activity');}));
    const e=app.events.find(x=>x.id===selectedEventId); if(!e)return;
    editor.querySelectorAll('[data-efield]').forEach(input=>input.addEventListener('input',()=>{const field=input.dataset.efield;e[field]=field==='visible'?input.value==='true':input.value;if(field==='date'){e.status=app.eventStatusFromDate(e.date);app.refreshAll();renderEditor();setTab('activity');return;}app.refreshAll();}));
    editor.querySelector('#deleteEvent')?.addEventListener('click',()=>{if(!confirm('이 행사를 삭제할까요? (사이트에 저장을 눌러야 실제로 반영됩니다)'))return;const i=app.events.findIndex(x=>x.id===e.id);if(i>=0)app.events.splice(i,1);selectedEventId=app.events[0]?.id||null;app.refreshAll();renderEditor();setTab('activity');});
    editor.querySelectorAll('[data-remove-event-image]').forEach(btn=>btn.addEventListener('click',()=>{if(!confirm('이 인포 이미지를 삭제할까요?'))return;e.images.splice(Number(btn.closest('[data-event-image-index]').dataset.eventImageIndex),1);app.refreshAll();renderEditor();setTab('activity');}));
    editor.querySelector('#eventImageInput')?.addEventListener('change',async event=>{for(const file of [...(event.target.files||[])]){try{const source=await utils.fileToSource(file);const result=await utils.makeResizedWebP(source,{maxEdge:2800,quality:.88});e.images.push(URL.createObjectURL(result.blob));if(source.close)source.close();}catch(error){alert(error.message);}}app.refreshAll();renderEditor();setTab('activity');});
  }

  function moveEvent(id,dir){const sorted=app.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));const i=sorted.findIndex(e=>e.id===id),t=dir==='up'?i-1:i+1;if(i<0||t<0||t>=sorted.length)return;const a=sorted[i],b=sorted[t],tmp=a.sortOrder;a.sortOrder=b.sortOrder;b.sortOrder=tmp;app.refreshAll();renderEditor();setTab('activity');}

  function guideSection(){
    const now = new Date();
    const currentYear = now.getFullYear(), thisMonth = now.getMonth() + 1;
    const scheduleYears = [...new Set([...Object.keys(app.scheduleByYear || {}).map(Number), currentYear, currentYear + 1])].filter(y => y >= currentYear - 1).sort((a,b)=>a-b);
    if (!scheduleYears.includes(selectedScheduleYear)) selectedScheduleYear = currentYear;
    const yearSchedule = app.scheduleByYear[selectedScheduleYear] || {};
    const markOf = st => st==='available'?'○':st==='consult'?'△':'×';
    return `<div class="admin-section-title"><div><h3>GUIDE</h3><p>작업 일정, 공지, 사용 범위, 가격을 수정합니다.</p></div></div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>작업 일정</h4><p class="admin-subtle">달을 누를 때마다 <b>× 마감 → △ 문의 → ○ 가능</b> 순서로 바뀝니다.</p></div></div>
        <div class="ag-year-row">
          <div class="ag-year">${scheduleYears.map(y=>`<button type="button" class="ag-year-btn ${y===selectedScheduleYear?'is-on':''}" data-schedule-year="${y}">${y}</button>`).join('')}</div>
          <div class="ag-legend"><span class="available">○ 가능</span><span class="consult">△ 문의</span><span class="closed">× 마감</span></div>
        </div>
        <div class="ag-months">${Array.from({length:12},(_,i)=>{const m=i+1,st=yearSchedule[m]||'consult';const isNow=selectedScheduleYear===currentYear&&m===thisMonth;const past=selectedScheduleYear<currentYear||(selectedScheduleYear===currentYear&&m<thisMonth);return `<button type="button" class="ag-month ${st} ${isNow?'is-now':''} ${past?'is-past':''}" data-month="${m}" data-year="${selectedScheduleYear}" title="${m}월"><span class="ag-m">${String(m).padStart(2,'0')}</span><span class="ag-mark">${markOf(st)}</span></button>`}).join('')}</div>
        <p class="admin-subtle ag-note">지난 달은 흐리게, 이번 달은 테두리로 표시됩니다. 사이트에는 이번 달부터 12개월만 보여요.</p>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>공지</h4><p class="admin-subtle">GUIDE의 NOTICE에 번호와 함께 표시됩니다.</p></div></div>
        ${app.guide.notice.map((n,i)=>`<div class="admin-notice-row ag-notice"><b>${String(i+1).padStart(2,'0')}</b><textarea data-notice="${i}" rows="2">${escapeHtml(n)}</textarea><button type="button" class="ag-x" data-notice-delete="${i}" aria-label="${i+1}번 공지 삭제">삭제</button></div>`).join('')}
        <button type="button" class="aii-btn ag-add" id="addNotice">+ 공지 추가</button>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>작업물 사용 범위</h4><p class="admin-subtle">켜진 칸은 사이트 표에서 ○, 꺼진 칸은 ×로 보입니다.</p></div></div>
        <div class="ag-usage-head"><span>항목</span><span>보조 설명 (선택)</span><span>방송용</span><span>상업용</span><span></span></div>
        ${app.guide.usage.map((u,i)=>`<div class="ag-usage">
          <input type="text" data-usage-label="${i}" value="${escapeHtml(u.label)}" aria-label="항목">
          <input type="text" data-usage-note="${i}" value="${escapeHtml(u.note||'')}" placeholder="예: 5개 이하" aria-label="보조 설명">
          <label class="ag-toggle"><input type="checkbox" data-usage-stream="${i}" ${u.streaming?'checked':''}><span>방송</span></label>
          <label class="ag-toggle"><input type="checkbox" data-usage-commercial="${i}" ${u.commercial?'checked':''}><span>상업</span></label>
          <button type="button" class="ag-x" data-usage-delete="${i}" aria-label="삭제">삭제</button>
        </div>`).join('')}
        <button type="button" class="aii-btn ag-add" id="addUsage">+ 항목 추가</button>
      </div>

      <div class="admin-card">
        <div class="admin-card-head"><div><h4>가격</h4><p class="admin-subtle">분야를 눌러 펼친 뒤 금액과 설명을 고칩니다.</p></div></div>
        ${priceEditorHtml()}
      </div>`;
  }

  function priceEditorHtml(){
    return ['ld','sd','costume','background'].map((key,idx)=>{
      const p=app.pricing[key];
      let html=`<details class="ag-price" ${idx===0?'open':''}><summary><b>${escapeHtml(p.label)}</b><span>${escapeHtml(p.from)}</span></summary><div class="ag-price-body">
        <div class="admin-grid"><label class="admin-field"><span>분야명</span><input data-price-label="${key}" value="${escapeHtml(p.label)}"></label><label class="admin-field"><span>대표 가격 (목록에 보이는 문구)</span><input data-price-from="${key}" value="${escapeHtml(p.from)}"></label></div>`;
      if(p.table){
        const heads=(p.table.headers||['','','']).map((h,i)=>i===0?(h||'구분'):h);
        html+=`<div class="ag-table"><div class="admin-price-row ag-th">${heads.map(h=>`<span>${escapeHtml(h)}</span>`).join('')}</div>${p.table.rows.map((row,i)=>`<div class="admin-price-row"><input data-price-row="${key}:${i}:0" value="${escapeHtml(row[0])}" aria-label="구분"><input data-price-row="${key}:${i}:1" value="${escapeHtml(row[1])}" aria-label="${escapeHtml(heads[1]||'')}"><input data-price-row="${key}:${i}:2" value="${escapeHtml(row[2])}" aria-label="${escapeHtml(heads[2]||'')}"></div>`).join('')}</div>`;
        html+=`<label class="admin-field admin-price-extras"><span>추가 항목 · 한 줄에 하나</span><textarea data-price-extras="${key}">${escapeHtml((p.extras||[]).join('\n'))}</textarea></label>`;
      } else {
        html+=`<div class="ag-table"><div class="admin-price-row two ag-th"><span>항목</span><span>가격</span></div>${p.rows.map((row,i)=>`<div class="admin-price-row two"><input data-price-simple="${key}:${i}:0" value="${escapeHtml(row[0])}" aria-label="항목"><input data-price-simple="${key}:${i}:1" value="${escapeHtml(row[1])}" aria-label="가격"></div>`).join('')}</div>`;
        html+=`<label class="admin-field"><span>설명</span><textarea data-price-note="${key}">${escapeHtml(p.note||'')}</textarea></label>`;
      }
      return html+'</div></details>';
    }).join('');
  }

  function bindGuide(){
    editor.querySelectorAll('[data-schedule-year]').forEach(btn=>btn.addEventListener('click',()=>{selectedScheduleYear=Number(btn.dataset.scheduleYear);renderEditor();setTab('guide');}));
    editor.querySelector('#addNotice')?.addEventListener('click',()=>{app.guide.notice.push('');app.renderGuideSummary();renderEditor();setTab('guide');const all=editor.querySelectorAll('[data-notice]');all[all.length-1]?.focus();});
    editor.querySelectorAll('[data-notice-delete]').forEach(btn=>btn.addEventListener('click',()=>{if(!confirm('이 공지를 삭제할까요?'))return;app.guide.notice.splice(Number(btn.dataset.noticeDelete),1);app.renderGuideSummary();renderEditor();setTab('guide');}));
    editor.querySelector('#addUsage')?.addEventListener('click',()=>{app.guide.usage.push({label:'새 항목',streaming:true,commercial:true});app.renderGuideSummary();renderEditor();setTab('guide');});
    editor.querySelectorAll('[data-usage-delete]').forEach(btn=>btn.addEventListener('click',()=>{if(!confirm('이 항목을 삭제할까요?'))return;app.guide.usage.splice(Number(btn.dataset.usageDelete),1);app.renderGuideSummary();renderEditor();setTab('guide');}));
    editor.querySelectorAll('[data-price-label],[data-price-from]').forEach(el=>el.addEventListener('input',()=>{const d=el.closest('details');const k=el.dataset.priceLabel||el.dataset.priceFrom;if(d){d.querySelector('summary b').textContent=d.querySelector('[data-price-label]').value;d.querySelector('summary span').textContent=d.querySelector('[data-price-from]').value;}}));
    editor.querySelectorAll('[data-month]').forEach(btn=>btn.addEventListener('click',()=>{const month=Number(btn.dataset.month),year=Number(btn.dataset.year);const yearSchedule=app.scheduleByYear[year]||(app.scheduleByYear[year]=Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,'consult'])));const current=yearSchedule[month]||'consult';yearSchedule[month]=current==='closed'?'consult':current==='consult'?'available':'closed';app.renderSchedule();renderEditor();setTab('guide');}));
    editor.querySelectorAll('[data-notice]').forEach(el=>el.addEventListener('input',()=>{app.guide.notice[Number(el.dataset.notice)]=el.value;app.renderGuideSummary();}));
    editor.querySelectorAll('[data-usage-label]').forEach(el=>el.addEventListener('input',()=>{app.guide.usage[Number(el.dataset.usageLabel)].label=el.value;app.renderGuideSummary();}));
    editor.querySelectorAll('[data-usage-note]').forEach(el=>el.addEventListener('input',()=>{app.guide.usage[Number(el.dataset.usageNote)].note=el.value;app.renderGuideSummary();}));
    editor.querySelectorAll('[data-usage-stream]').forEach(el=>el.addEventListener('change',()=>{app.guide.usage[Number(el.dataset.usageStream)].streaming=el.checked;app.renderGuideSummary();}));
    editor.querySelectorAll('[data-usage-commercial]').forEach(el=>el.addEventListener('change',()=>{app.guide.usage[Number(el.dataset.usageCommercial)].commercial=el.checked;app.renderGuideSummary();}));
    editor.querySelectorAll('[data-price-label]').forEach(el=>el.addEventListener('input',()=>{app.pricing[el.dataset.priceLabel].label=el.value;app.renderPricing();}));
    editor.querySelectorAll('[data-price-from]').forEach(el=>el.addEventListener('input',()=>{app.pricing[el.dataset.priceFrom].from=el.value;app.renderPricing();}));
    editor.querySelectorAll('[data-price-row]').forEach(el=>el.addEventListener('input',()=>{const [k,r,c]=el.dataset.priceRow.split(':');app.pricing[k].table.rows[+r][+c]=el.value;app.renderPricing();}));
    editor.querySelectorAll('[data-price-extras]').forEach(el=>el.addEventListener('input',()=>{app.pricing[el.dataset.priceExtras].extras=el.value.split('\n').map(v=>v.trim()).filter(Boolean);app.renderPricing();}));
    editor.querySelectorAll('[data-price-simple]').forEach(el=>el.addEventListener('input',()=>{const [k,r,c]=el.dataset.priceSimple.split(':');app.pricing[k].rows[+r][+c]=el.value;app.renderPricing();}));
    editor.querySelectorAll('[data-price-note]').forEach(el=>el.addEventListener('input',()=>{app.pricing[el.dataset.priceNote].note=el.value;app.renderPricing();}));
  }


  function assistantSection(){
    const rules = app.assistantRules || [];
    const handlerLabels = {static:'일반 답변',quoteForm:'견적 폼 열기',specificMonth:'특정 월 조회',earliestSchedule:'가장 빠른 ○ 찾기',rush:'빠른 마감 1~2개월 조회',deadlineDate:'희망 마감일 조회',monthDuration:'희망 월 + 작업 기간',refund:'환불 단계',revision:'수정 단계',commercial:'상업용 분기',ldPrice:'LD 가격 계산',sdPrice:'SD 가격 계산',background:'배경 분류',clarifyBackground:'배경 추가 질문',clarifyProps:'소품 추가 질문'};
    return `<div class="admin-section-title"><div><h3>도우미 답변</h3><p>키워드·우선순위·답변을 직접 수정합니다. 사이트에 저장을 누르면 실제 사이트에 반영됩니다.</p></div><button class="admin-soft-btn" id="addAssistantRule">+ 규칙 추가</button></div>
      <div class="admin-card assistant-test-card"><div class="admin-card-head"><div><h4>답변 테스트</h4><p class="admin-subtle">실제 방문자와 같은 규칙으로 확인합니다.</p></div></div><div class="admin-test-row"><input id="assistantTestInput" placeholder="예: 9월 작업 가능할까요?"><button class="admin-soft-btn" id="assistantTestButton">테스트</button></div><div id="assistantTestResult" class="admin-test-result">질문을 입력하면 적용 규칙과 답변이 표시됩니다.</div></div>
      <div class="admin-rule-list">${rules.slice().sort((a,b)=>(b.priority||0)-(a.priority||0)).map(rule=>{
        const answerFields=Object.entries(rule.answers||{}).map(([key,value])=>`<label class="admin-field full"><span>답변 · ${escapeHtml(key)}</span><textarea data-rule-answer="${escapeHtml(rule.id)}:${escapeHtml(key)}">${escapeHtml(value)}</textarea></label>`).join('');
        return `<details class="admin-card admin-rule-card" data-rule-card="${escapeHtml(rule.id)}"><summary><div><b>${escapeHtml(rule.name)}</b><small>${escapeHtml(handlerLabels[rule.handler]||rule.handler)} · 우선순위 ${rule.priority||0}</small></div><span class="admin-rule-state ${rule.enabled!==false?'on':'off'}">${rule.enabled!==false?'ON':'OFF'}</span></summary><div class="admin-rule-body">
          <div class="admin-grid"><label class="admin-field"><span>규칙 이름</span><input data-rule-name="${escapeHtml(rule.id)}" value="${escapeHtml(rule.name)}"></label><label class="admin-field"><span>우선순위</span><input type="number" data-rule-priority="${escapeHtml(rule.id)}" value="${rule.priority||0}"></label><label class="admin-field"><span>동작</span><select data-rule-handler="${escapeHtml(rule.id)}">${Object.entries(handlerLabels).map(([key,label])=>`<option value="${key}" ${rule.handler===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="admin-check admin-rule-enabled"><input type="checkbox" data-rule-enabled="${escapeHtml(rule.id)}" ${rule.enabled!==false?'checked':''}> 규칙 사용</label></div>
          <label class="admin-field full"><span>키워드 · 쉼표로 구분</span><textarea data-rule-keywords="${escapeHtml(rule.id)}">${escapeHtml((rule.keywords||[]).join(', '))}</textarea></label>
          <div class="admin-grid"><label class="admin-field"><span>반드시 포함 · 쉼표로 구분</span><textarea data-rule-required="${escapeHtml(rule.id)}">${escapeHtml((rule.required||[]).join(', '))}</textarea></label><label class="admin-field"><span>제외 키워드 · 쉼표로 구분</span><textarea data-rule-exclude="${escapeHtml(rule.id)}">${escapeHtml((rule.exclude||[]).join(', '))}</textarea></label></div>
          ${answerFields}
          <div class="admin-rule-actions"><button class="admin-soft-btn" data-rule-duplicate="${escapeHtml(rule.id)}">복제</button><button class="admin-danger-btn" data-rule-delete="${escapeHtml(rule.id)}">삭제</button></div>
        </div></details>`;
      }).join('')}</div>`;
  }

  function bindAssistant(){
    const splitWords=value=>String(value||'').split(',').map(v=>v.trim()).filter(Boolean);
    const find=id=>(app.assistantRules||[]).find(rule=>rule.id===id);
    const rerender=()=>{renderEditor();setTab('assistant');};
    editor.querySelector('#addAssistantRule')?.addEventListener('click',()=>{const id=`custom-${Date.now()}`;app.assistantRules.push({id,name:'새 답변 규칙',enabled:true,priority:50,handler:'static',keywords:['새 키워드'],required:[],exclude:[],answers:{default:'새 답변을 입력해 주세요.'}});rerender();});
    editor.querySelectorAll('[data-rule-name]').forEach(el=>el.addEventListener('input',()=>{const r=find(el.dataset.ruleName);if(r)r.name=el.value;}));
    editor.querySelectorAll('[data-rule-priority]').forEach(el=>el.addEventListener('change',()=>{const r=find(el.dataset.rulePriority);if(r)r.priority=Number(el.value)||0;rerender();}));
    editor.querySelectorAll('[data-rule-handler]').forEach(el=>el.addEventListener('change',()=>{const r=find(el.dataset.ruleHandler);if(r)r.handler=el.value;}));
    editor.querySelectorAll('[data-rule-enabled]').forEach(el=>el.addEventListener('change',()=>{const r=find(el.dataset.ruleEnabled);if(r)r.enabled=el.checked;rerender();}));
    editor.querySelectorAll('[data-rule-keywords]').forEach(el=>el.addEventListener('input',()=>{const r=find(el.dataset.ruleKeywords);if(r)r.keywords=splitWords(el.value);}));
    editor.querySelectorAll('[data-rule-required]').forEach(el=>el.addEventListener('input',()=>{const r=find(el.dataset.ruleRequired);if(r)r.required=splitWords(el.value);}));
    editor.querySelectorAll('[data-rule-exclude]').forEach(el=>el.addEventListener('input',()=>{const r=find(el.dataset.ruleExclude);if(r)r.exclude=splitWords(el.value);}));
    editor.querySelectorAll('[data-rule-answer]').forEach(el=>el.addEventListener('input',()=>{const [id,key]=el.dataset.ruleAnswer.split(':');const r=find(id);if(r){r.answers=r.answers||{};r.answers[key]=el.value;}}));
    editor.querySelectorAll('[data-rule-duplicate]').forEach(btn=>btn.addEventListener('click',()=>{const r=find(btn.dataset.ruleDuplicate);if(!r)return;const copy=JSON.parse(JSON.stringify(r));copy.id=`${r.id}-copy-${Date.now()}`;copy.name=`${r.name} 복사본`;copy.priority=(r.priority||0)-1;app.assistantRules.push(copy);rerender();}));
    editor.querySelectorAll('[data-rule-delete]').forEach(btn=>btn.addEventListener('click',()=>{const r=find(btn.dataset.ruleDelete);if(!r||!confirm(`'${r.name}' 규칙을 현재 미리보기에서 삭제할까요?`))return;const i=app.assistantRules.indexOf(r);if(i>=0)app.assistantRules.splice(i,1);rerender();}));
    const test=()=>{const value=editor.querySelector('#assistantTestInput')?.value.trim();const out=editor.querySelector('#assistantTestResult');if(!value||!out)return;const create=window.LOVETT_CREATE_ASSISTANT_ENGINE;if(!create){out.textContent='도우미 엔진을 불러오지 못했습니다.';return;}const result=create(PORTFOLIO_DATA).ask(value);out.innerHTML=`<b>${escapeHtml(result.ruleName||'일치 규칙 없음')}</b><p>${escapeHtml(result.text)}</p>`;};
    editor.querySelector('#assistantTestButton')?.addEventListener('click',test);
    editor.querySelector('#assistantTestInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();test();}});
  }

  async function cropAndConvert(file) {
    const source = await utils.fileToSource(file);
    try {
      const full = await openCropper(source, { title:'상세 이미지 자르기', aspect:null, outputWidth:null, outputHeight:null, quality:.88, allowAspect:true });
      const thumb = await openCropper(source, { title:'썸네일 자르기', aspect:4/3, outputWidth:800, outputHeight:600, quality:.84, allowAspect:false });
      const meta = await openImageMeta();
      const cleanFullUrl = URL.createObjectURL(full.blob);
      let fullUrl = cleanFullUrl;
      if (meta.commercial && meta.company) {
        const stamped = await addCopyrightWatermark(full.blob, meta.company, .88);
        fullUrl = URL.createObjectURL(stamped.blob);
      }
      return { fullUrl, cleanFullUrl, thumbUrl:URL.createObjectURL(thumb.blob), ...meta };
    } finally {
      if (source.close) source.close();
    }
  }

  function fullImageUrl(value) {
    const src = String(value || '');
    return src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')
      ? src
      : window.LOVETT_ASSET('full', src);
  }

  async function addCopyrightWatermark(blob, company, quality=.88) {
    const source = await utils.fileToSource(new File([blob], 'copyright-source.webp', { type: blob.type || 'image/webp' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      const text = `Copyright assigned to ${String(company || '').trim()}.`;
      const pad = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * .018));
      let fontSize = Math.max(14, Math.min(46, Math.round(canvas.width * .018)));
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
      const setFont = () => { ctx.font = `600 ${fontSize}px Arial, sans-serif`; };
      setFont();
      while (fontSize > 12 && ctx.measureText(text).width > canvas.width - pad * 2) { fontSize -= 1; setFont(); }
      ctx.strokeStyle = 'rgba(0,0,0,.95)';
      ctx.lineWidth = Math.max(2, Math.round(fontSize * .16));
      ctx.strokeText(text, canvas.width - pad, canvas.height - pad);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, canvas.width - pad, canvas.height - pad);
      return await utils.makeCanvasWebP(canvas, { quality });
    } finally {
      if (source.close) source.close();
    }
  }

  async function refreshImageWatermark(project, image) {
    if (!image.cleanSrc) image.cleanSrc = image.src;
    const oldSrc = image.src;
    if (!image.commercial || !image.company) {
      image.src = image.cleanSrc;
    } else {
      const source = await utils.urlToSource(fullImageUrl(image.cleanSrc));
      try {
        const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
        canvas.getContext('2d').drawImage(source, 0, 0);
        const clean = await utils.makeCanvasWebP(canvas, { quality:.88 });
        const stamped = await addCopyrightWatermark(clean.blob, image.company, .88);
        image.src = URL.createObjectURL(stamped.blob);
      } finally { if (source.close) source.close(); }
    }
    Object.keys(project.covers||{}).forEach(key => { if (project.covers[key] === oldSrc) project.covers[key] = image.src; });
  }

  function openImageMeta(initial = {}) {
    return new Promise((resolve, reject) => {
      const modal = editor.querySelector('#adminCropModal');
      modal.hidden = false;
      modal.innerHTML = `<div class="admin-crop-box admin-meta-box"><div class="admin-card-head"><div><h4>이미지 정보</h4><p class="admin-subtle">기업/상업 작업으로 저작권을 양도한 이미지라면 체크하고 회사명을 입력해주세요.</p></div></div><label class="admin-commercial-check admin-commercial-large"><input id="metaCommercial" type="checkbox" ${initial.commercial?'checked':''}><span>상업적 작업 · 저작권 양도</span></label><label class="admin-field admin-meta-company ${initial.commercial?'':'is-hidden'}"><span>회사명</span><input id="metaCompany" value="${escapeHtml(initial.company||'')}" placeholder="예: COMPANY NAME"></label><div class="admin-meta-preview" ${initial.commercial&&initial.company?'':'hidden'}>Copyright assigned to <b>${escapeHtml(initial.company||'')}</b>.</div><div class="admin-crop-actions admin-meta-actions"><button class="admin-soft-btn" id="metaCancel">취소</button><button class="admin-primary-btn" id="metaApply">적용</button></div></div>`;
      const check = modal.querySelector('#metaCommercial');
      const companyWrap = modal.querySelector('.admin-meta-company');
      const company = modal.querySelector('#metaCompany');
      const preview = modal.querySelector('.admin-meta-preview');
      const update = () => {
        companyWrap.classList.toggle('is-hidden', !check.checked);
        const name = company.value.trim();
        preview.hidden = !(check.checked && name);
        if (check.checked && name) preview.innerHTML = `Copyright assigned to <b>${escapeHtml(name)}</b>.`;
      };
      check.addEventListener('change', update); company.addEventListener('input', update); update();
      modal.querySelector('#metaCancel').addEventListener('click', () => { modal.hidden = true; reject(new Error('CROP_CANCEL')); });
      modal.querySelector('#metaApply').addEventListener('click', () => {
        const name = company.value.trim();
        if (check.checked && !name) { company.focus(); company.setCustomValidity('회사명을 입력해주세요.'); company.reportValidity(); company.setCustomValidity(''); return; }
        modal.hidden = true; resolve({ commercial:check.checked, company:check.checked?name:'' });
      });
    });
  }

  function openCropper(source, { title='이미지 자르기', aspect=null, outputWidth=null, outputHeight=null, quality=.86, allowAspect=true } = {}) {
    return new Promise((resolve, reject) => {
      const modal = editor.querySelector('#adminCropModal');
      let selectedAspect = aspect || (source.width/source.height);
      let canvasWidth = 900;
      let canvasHeight = Math.max(300, Math.round(canvasWidth / selectedAspect));
      let zoom = 1, dx = 0, dy = 0, dragging = false, lastX = 0, lastY = 0;
      modal.hidden = false;
      const aspectOptions = allowAspect ? `<label class="admin-crop-aspect"><span>비율</span><select id="cropAspect"><option value="original">원본 비율</option><option value="1">1 : 1</option><option value="1.3333333333">4 : 3</option><option value="0.75">3 : 4</option><option value="1.7777777778">16 : 9</option></select></label>` : '';
      modal.innerHTML = `<div class="admin-crop-box"><div class="admin-card-head"><div><h4>${escapeHtml(title)}</h4><p class="admin-subtle">이미지를 드래그해 위치를 옮기고, 아래 슬라이더로 확대·축소할 수 있습니다.</p></div></div>${aspectOptions}<div class="admin-crop-stage"><canvas></canvas></div><div class="admin-crop-controls"><label><span>확대</span><input id="cropZoom" type="range" min="1" max="4" step="0.01" value="1"></label><button class="admin-soft-btn" id="cropReset">자동 맞춤</button><button class="admin-soft-btn" id="cropCancel">취소</button></div><div class="admin-crop-actions"><button class="admin-primary-btn" id="cropApply">적용</button></div></div>`;
      const canvas = modal.querySelector('canvas'), ctx = canvas.getContext('2d');
      const setCanvasSize = () => { canvasWidth=900; canvasHeight=Math.max(280,Math.min(1000,Math.round(canvasWidth/selectedAspect))); canvas.width=canvasWidth; canvas.height=canvasHeight; canvas.style.aspectRatio=`${canvasWidth} / ${canvasHeight}`; };
      const draw = () => { const base=Math.max(canvasWidth/source.width,canvasHeight/source.height),scale=base*zoom,w=source.width*scale,h=source.height*scale;const maxX=Math.max(0,(w-canvasWidth)/2),maxY=Math.max(0,(h-canvasHeight)/2);dx=Math.max(-maxX,Math.min(maxX,dx));dy=Math.max(-maxY,Math.min(maxY,dy));ctx.clearRect(0,0,canvasWidth,canvasHeight);ctx.drawImage(source,(canvasWidth-w)/2+dx,(canvasHeight-h)/2+dy,w,h); };
      setCanvasSize(); draw();
      const pos = e => { const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*(canvasWidth/r.width),y:(e.clientY-r.top)*(canvasHeight/r.height)}; };
      canvas.addEventListener('pointerdown',e=>{dragging=true;canvas.setPointerCapture(e.pointerId);const p=pos(e);lastX=p.x;lastY=p.y;});
      canvas.addEventListener('pointermove',e=>{if(!dragging)return;const p=pos(e);dx+=p.x-lastX;dy+=p.y-lastY;lastX=p.x;lastY=p.y;draw();});
      canvas.addEventListener('pointerup',()=>dragging=false); canvas.addEventListener('pointercancel',()=>dragging=false);
      modal.querySelector('#cropZoom').addEventListener('input',e=>{zoom=+e.target.value;draw();});
      modal.querySelector('#cropAspect')?.addEventListener('change',e=>{selectedAspect=e.target.value==='original'?source.width/source.height:Number(e.target.value);zoom=1;dx=dy=0;modal.querySelector('#cropZoom').value='1';setCanvasSize();draw();});
      modal.querySelector('#cropReset').addEventListener('click',()=>{zoom=1;dx=dy=0;modal.querySelector('#cropZoom').value='1';draw();});
      const cancel=()=>{modal.hidden=true;reject(new Error('CROP_CANCEL'));};
      modal.querySelector('#cropCancel').addEventListener('click',cancel);
      modal.querySelector('#cropApply').addEventListener('click',async()=>{try{draw();const base=Math.max(canvasWidth/source.width,canvasHeight/source.height),drawScale=base*zoom,drawW=source.width*drawScale,drawH=source.height*drawScale,drawX=(canvasWidth-drawW)/2+dx,drawY=(canvasHeight-drawH)/2+dy;const sx=Math.max(0,-drawX/drawScale),sy=Math.max(0,-drawY/drawScale),sw=Math.min(source.width-sx,canvasWidth/drawScale),sh=Math.min(source.height-sy,canvasHeight/drawScale);let outW,outH;if(outputWidth&&outputHeight){outW=outputWidth;outH=outputHeight;}else{const maxEdge=2800,ratio=Math.min(1,maxEdge/Math.max(sw,sh));outW=Math.max(1,Math.round(sw*ratio));outH=Math.max(1,Math.round(sh*ratio));}const exportCanvas=document.createElement('canvas');exportCanvas.width=outW;exportCanvas.height=outH;exportCanvas.getContext('2d').drawImage(source,sx,sy,sw,sh,0,0,outW,outH);const result=await utils.makeCanvasWebP(exportCanvas,{quality});modal.hidden=true;resolve(result);}catch(error){modal.hidden=true;reject(error);}});
    });
  }
})();
