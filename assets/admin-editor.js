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
  let selectedScheduleYear = Number(app.settings.scheduleYear) || new Date().getFullYear();
  let homeHeroBlobUrl = null;
  const collapsedCards = new Set();

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
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
  loginForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (passwordInput.value !== app.settings.adminPreviewPassword) {
      loginError.textContent = '비밀번호가 맞지 않습니다.';
      return;
    }
    loginModal.close();
    openEditor();
  });

  function openEditor() {
    editor.hidden = false;
    document.body.classList.add('admin-editor-open');
    renderEditor();
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
    activeTab = tab;
    editor.querySelectorAll('.admin-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    editor.querySelectorAll('.admin-section').forEach(section => section.classList.toggle('active', section.dataset.section === tab));
  }

  function renderEditor() {
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
    setTab(activeTab);
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

  function homeSection() {
    const ko = app.translations.ko;
    return `
      <div class="admin-section-title"><div><h3>HOME</h3><p>메인 문구와 연락처, 대표 이미지를 미리 수정합니다.</p></div></div>
      <div class="admin-grid">
        <label class="admin-field"><span>첫 줄</span><input id="editHero1" value="${escapeHtml(ko.heroLine1)}"></label>
        <label class="admin-field"><span>강조 이름</span><input id="editHero2" value="${escapeHtml(ko.heroLine2)}"></label>
        <label class="admin-field"><span>마지막 줄</span><input id="editHero3" value="${escapeHtml(ko.heroLine3)}"></label>
        <label class="admin-field"><span>이메일</span><input id="editEmail" value="${escapeHtml(app.settings.email)}"></label>
        <label class="admin-field full"><span>소개 문구</span><textarea id="editHeroDescription">${escapeHtml(ko.heroDescription)}</textarea></label>
        <label class="admin-field full"><span>X 주소</span><input id="editXUrl" value="${escapeHtml(app.settings.xUrl)}"></label>
        <label class="admin-field full"><span>문의 폼 Access Key (Web3Forms)</span><input id="editContactKey" value="${escapeHtml(app.settings.contactFormKey || '')}" placeholder="web3forms.com에서 받은 키를 붙여넣기"></label>
      </div>
      <div class="admin-card">
        <div class="admin-card-head"><div><h4>HOME 대표 이미지</h4><p class="admin-subtle">업로드 후 확대·축소·위치 이동으로 HOME 영역에 맞춰 자를 수 있습니다.</p></div></div>
        <label class="admin-upload">이미지 선택<input id="editHeroImage" type="file" accept="image/*"></label>
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
      app.settings.contactFormKey = editor.querySelector('#editContactKey').value.trim();
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => a.href = `mailto:${app.settings.email}`);
      document.querySelectorAll('a[href*="x.com/"]').forEach(a => a.href = app.settings.xUrl);
    };
    ['#editHero1','#editHero2','#editHero3','#editHeroDescription','#editEmail','#editXUrl','#editContactKey'].forEach(sel => editor.querySelector(sel)?.addEventListener('input', update));
    editor.querySelector('#editHeroImage')?.addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const source = await utils.fileToSource(file);
        const cropped = await openCropper(source, { title:'HOME 대표 이미지', aspect:1.45, outputWidth:1740, outputHeight:1200, quality:.88, allowAspect:false });
        if (homeHeroBlobUrl) URL.revokeObjectURL(homeHeroBlobUrl);
        homeHeroBlobUrl = URL.createObjectURL(cropped.blob);
        app.setHeroImage(homeHeroBlobUrl);
        if (source.close) source.close();
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
        <div class="admin-list" id="projectList">${projectListHtml()}</div>
        <div id="projectEditor">${selected ? projectEditorHtml(selected) : '<div class="admin-card">프로젝트가 없습니다.</div>'}</div>
      </div>`;
  }

  function projectListHtml() {
    return app.projects.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(p => `
      <button class="admin-list-item ${p.id===selectedProjectId?'active':''}" data-project-id="${escapeHtml(p.id)}">
        <b>${escapeHtml(typeof p.title === 'object' ? p.title.ko : p.title)}</b><small>${escapeHtml(p.year)} · ${(p.categories||[]).join(' / ').toUpperCase()}</small>
        <span class="admin-list-tools"><span class="admin-mini" data-move="up">↑</span><span class="admin-mini" data-move="down">↓</span></span>
      </button>`).join('');
  }

  function projectEditorHtml(p) {
    const cats = ['ld','cover','sd','costume','edit','background'];
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
          <label class="admin-field"><span>공개</span><select data-pfield="visible"><option value="true" ${p.visible!==false?'selected':''}>공개</option><option value="false" ${p.visible===false?'selected':''}>숨김</option></select></label>
          <label class="admin-field full"><span>설명</span><textarea data-pfield="description">${escapeHtml(desc)}</textarea></label>
          <label class="admin-field full"><span>추가 태그 · 쉼표 구분</span><input data-pfield="extraTags" value="${escapeHtml((p.extraTags||[]).join(', '))}"></label>
        </div>
        <span class="admin-label">분야</span><div class="admin-checks">${cats.map(cat=>`<label class="admin-check"><input type="checkbox" data-category="${cat}" ${(p.categories||[]).includes(cat)?'checked':''}>${cat.toUpperCase()}</label>`).join('')}</div>
      </div>
      <div class="admin-card">
        <div class="admin-card-head"><div><h4>이미지</h4><p class="admin-subtle">추가할 때 상세 이미지와 4:3 썸네일을 각각 확대·축소·이동해 자를 수 있습니다.</p></div></div>
        <div class="admin-image-grid" id="projectImages">${projectImagesHtml(p)}</div>
        <label class="admin-upload" style="margin-top:9px">이미지 추가<input id="projectImageInput" type="file" accept="image/*" multiple></label>
      </div>`;
  }

  function projectImagesHtml(p) {
    return (p.images||[]).map((img,index) => {
      const src = img.thumbSrc || (String(img.src).startsWith('blob:') ? img.src : window.LOVETT_ASSET('thumbs', img.src));
      return `<div class="admin-image-item" data-image-index="${index}"><img src="${src}" alt=""><div class="admin-image-info"><input class="admin-field-caption" value="${escapeHtml(typeof img.caption==='object'?img.caption.ko:img.caption||'')}" placeholder="캡션"><div class="admin-image-license"><label class="admin-commercial-check"><input type="checkbox" data-image-commercial ${img.commercial?'checked':''}><span>상업적 작업 · 저작권 양도</span></label><label class="admin-company-field ${img.commercial?'':'is-hidden'}"><span>회사명</span><input data-image-company value="${escapeHtml(img.company||'')}" placeholder="예: COMPANY NAME"></label>${img.commercial&&img.company?`<small class="admin-copyright-preview">Copyright assigned to ${escapeHtml(img.company)}.</small>`:''}</div><div class="admin-image-actions"><button class="primary" data-edit-thumb>썸네일 자르기</button><button data-edit-full>상세 자르기</button><button data-cover="all">ALL 대표</button>${(p.categories||[]).map(cat=>`<button data-cover="${cat}">${cat.toUpperCase()} 대표</button>`).join('')}<button data-remove-image>삭제</button></div></div></div>`;
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
      app.refreshAll(); toast(`${cat.toUpperCase()} 대표 이미지를 바꿨습니다.`);
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
      const index = Number(btn.closest('[data-image-index]').dataset.imageIndex); p.images.splice(index,1); app.refreshAll(); renderEditor(); setTab('works');
    }));
    editor.querySelector('#projectImageInput')?.addEventListener('change', async event => {
      for (const file of [...(event.target.files||[])]) {
        try {
          const image = await cropAndConvert(file);
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
      <div class="admin-split"><div class="admin-list" id="eventList">${eventListHtml()}</div><div id="eventEditor">${selected?eventEditorHtml(selected):'<div class="admin-card">행사가 없습니다.</div>'}</div></div>`;
  }

  function eventListHtml(){ return app.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)).map(e=>{const status=app.eventStatusFromDate(e.date);e.status=status;return `<button class="admin-list-item ${e.id===selectedEventId?'active':''}" data-event-id="${e.id}"><b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.date)} · ${status==='done'?'참가 완료':'참가 예정'}</small><span class="admin-list-tools"><span class="admin-mini" data-move="up">↑</span><span class="admin-mini" data-move="down">↓</span></span></button>`}).join(''); }

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
    <div class="admin-card"><div class="admin-card-head"><div><h4>행사 인포 이미지</h4><p class="admin-subtle">세로 A4 이미지는 비율을 자르지 않고 WebP로 변환합니다.</p></div></div><div class="admin-image-grid">${eventImagesHtml(e)}</div><label class="admin-upload" style="margin-top:9px">인포 이미지 추가<input id="eventImageInput" type="file" accept="image/*" multiple></label></div>`;
  }

  function eventImagesHtml(e){ return (e.images||[]).map((src,index)=>`<div class="admin-image-item" data-event-image-index="${index}"><img src="${String(src).startsWith('blob:')?src:window.LOVETT_ASSET('full', src)}" style="aspect-ratio:1/1.414;object-fit:contain"><div class="admin-image-info"><div class="admin-image-actions"><button data-remove-event-image>삭제</button></div></div></div>`).join('') || '<div class="admin-subtle">등록된 인포 이미지가 없습니다.</div>'; }

  function bindActivity(){
    editor.querySelector('#addEvent')?.addEventListener('click',()=>{const id=`event-${Date.now()}`;const order=Math.max(0,...app.events.map(e=>e.sortOrder||0))+10;app.events.push({id,status:'upcoming',date:String(new Date().getFullYear()),title:'새 행사',booth:'',images:[],description:'',mailOrderUrl:'',visible:true,sortOrder:order});selectedEventId=id;app.refreshAll();renderEditor();setTab('activity');});
    editor.querySelectorAll('#eventList .admin-list-item').forEach(item=>item.addEventListener('click',event=>{const move=event.target.closest('[data-move]');if(move){event.stopPropagation();moveEvent(item.dataset.eventId,move.dataset.move);return;}selectedEventId=item.dataset.eventId;renderEditor();setTab('activity');}));
    const e=app.events.find(x=>x.id===selectedEventId); if(!e)return;
    editor.querySelectorAll('[data-efield]').forEach(input=>input.addEventListener('input',()=>{const field=input.dataset.efield;e[field]=field==='visible'?input.value==='true':input.value;if(field==='date'){e.status=app.eventStatusFromDate(e.date);app.refreshAll();renderEditor();setTab('activity');return;}app.refreshAll();}));
    editor.querySelector('#deleteEvent')?.addEventListener('click',()=>{if(!confirm('이 행사를 삭제할까요? (사이트에 저장을 눌러야 실제로 반영됩니다)'))return;const i=app.events.findIndex(x=>x.id===e.id);if(i>=0)app.events.splice(i,1);selectedEventId=app.events[0]?.id||null;app.refreshAll();renderEditor();setTab('activity');});
    editor.querySelectorAll('[data-remove-event-image]').forEach(btn=>btn.addEventListener('click',()=>{e.images.splice(Number(btn.closest('[data-event-image-index]').dataset.eventImageIndex),1);app.refreshAll();renderEditor();setTab('activity');}));
    editor.querySelector('#eventImageInput')?.addEventListener('change',async event=>{for(const file of [...(event.target.files||[])]){try{const source=await utils.fileToSource(file);const result=await utils.makeResizedWebP(source,{maxEdge:2800,quality:.88});e.images.push(URL.createObjectURL(result.blob));if(source.close)source.close();}catch(error){alert(error.message);}}app.refreshAll();renderEditor();setTab('activity');});
  }

  function moveEvent(id,dir){const sorted=app.events.slice().sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));const i=sorted.findIndex(e=>e.id===id),t=dir==='up'?i-1:i+1;if(i<0||t<0||t>=sorted.length)return;const a=sorted[i],b=sorted[t],tmp=a.sortOrder;a.sortOrder=b.sortOrder;b.sortOrder=tmp;app.refreshAll();renderEditor();setTab('activity');}

  function guideSection(){
    const scheduleYears = Object.keys(app.scheduleByYear || {}).map(Number).sort((a,b)=>a-b);
    const currentYear = new Date().getFullYear();
    if (!scheduleYears.includes(currentYear)) scheduleYears.push(currentYear);
    if (!scheduleYears.includes(currentYear + 1)) scheduleYears.push(currentYear + 1);
    scheduleYears.sort((a,b)=>a-b);
    if (!scheduleYears.includes(selectedScheduleYear)) selectedScheduleYear = scheduleYears[0] || currentYear;
    const selectedSchedule = app.scheduleByYear[selectedScheduleYear] || (app.scheduleByYear[selectedScheduleYear] = Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,'consult'])));
    return `<div class="admin-section-title"><div><h3>GUIDE</h3><p>일정·공지·사용범위·가격을 바로 미리 수정합니다.</p></div></div>
      <div class="admin-card"><div class="admin-card-head"><div><h4>작업 일정</h4><p class="admin-subtle">사이트에는 이번 달부터 앞으로 12개월만 표시됩니다.</p></div><label class="admin-field" style="margin:0;width:150px"><span>편집할 연도</span><select id="scheduleYearEdit">${scheduleYears.map(y=>`<option value="${y}" ${y===selectedScheduleYear?'selected':''}>${y}</option>`).join('')}</select></label></div><div class="admin-months">${Array.from({length:12},(_,i)=>{const m=i+1,s=selectedSchedule[m]||'consult',mark=s==='available'?'○':s==='consult'?'△':'×';return `<button class="admin-month ${s}" data-month="${m}"><b>${String(m).padStart(2,'0')}</b><span>${mark}</span></button>`}).join('')}</div></div>
      <div class="admin-card"><div class="admin-card-head"><h4>공지</h4></div>${app.guide.notice.map((n,i)=>`<div class="admin-notice-row"><b>${String(i+1).padStart(2,'0')}</b><textarea data-notice="${i}">${escapeHtml(n)}</textarea></div>`).join('')}</div>
      <div class="admin-card"><div class="admin-card-head"><h4>작업물 사용 범위</h4></div>${app.guide.usage.map((u,i)=>`<div class="admin-usage-row"><input type="text" data-usage-label="${i}" value="${escapeHtml(u.label)}"><label>방송<input type="checkbox" data-usage-stream="${i}" ${u.streaming?'checked':''}></label><label>상업<input type="checkbox" data-usage-commercial="${i}" ${u.commercial?'checked':''}></label></div><label class="admin-field"><span>보조 설명</span><input data-usage-note="${i}" value="${escapeHtml(u.note||'')}"></label>`).join('')}</div>
      <div class="admin-card"><div class="admin-card-head"><h4>가격</h4><p class="admin-subtle">기존 항목의 명칭과 금액을 수정합니다.</p></div>${priceEditorHtml()}</div>`;
  }

  function priceEditorHtml(){
    return ['ld','sd','costume','background'].map(key=>{const p=app.pricing[key];let html=`<div class="admin-price-section"><div class="admin-grid"><label class="admin-field"><span>분야명</span><input data-price-label="${key}" value="${escapeHtml(p.label)}"></label><label class="admin-field"><span>요약 가격</span><input data-price-from="${key}" value="${escapeHtml(p.from)}"></label></div>`;
      if(p.table){html+=p.table.rows.map((row,i)=>`<div class="admin-price-row"><input data-price-row="${key}:${i}:0" value="${escapeHtml(row[0])}"><input data-price-row="${key}:${i}:1" value="${escapeHtml(row[1])}"><input data-price-row="${key}:${i}:2" value="${escapeHtml(row[2])}"></div>`).join('');html+=`<label class="admin-field admin-price-extras"><span>추가 항목 · 한 줄에 하나</span><textarea data-price-extras="${key}">${escapeHtml((p.extras||[]).join('\n'))}</textarea></label>`;}else{html+=p.rows.map((row,i)=>`<div class="admin-price-row two"><input data-price-simple="${key}:${i}:0" value="${escapeHtml(row[0])}"><input data-price-simple="${key}:${i}:1" value="${escapeHtml(row[1])}"></div>`).join('');html+=`<label class="admin-field"><span>설명</span><textarea data-price-note="${key}">${escapeHtml(p.note||'')}</textarea></label>`;}return html+'</div>';}).join('');
  }

  function bindGuide(){
    editor.querySelector('#scheduleYearEdit')?.addEventListener('change',e=>{selectedScheduleYear=Number(e.target.value);renderEditor();setTab('guide');});
    editor.querySelectorAll('[data-month]').forEach(btn=>btn.addEventListener('click',()=>{const month=Number(btn.dataset.month);const yearSchedule=app.scheduleByYear[selectedScheduleYear] || (app.scheduleByYear[selectedScheduleYear]={});const current=yearSchedule[month]||'consult';yearSchedule[month]=current==='closed'?'consult':current==='consult'?'available':'closed';app.renderSchedule();renderEditor();setTab('guide');}));
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
