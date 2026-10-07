// 관리자 편집기의 '사이트에 저장' 기능
// 바뀐 내용(data.js)과 새 이미지를 GitHub 저장소에 한 번에 커밋합니다.
// GitHub Pages가 1~2분 안에 사이트를 자동으로 다시 만들어 줍니다.
// 연결 키(토큰)는 이 브라우저에만 저장되고, 사이트 파일에는 절대 들어가지 않습니다.
(() => {
  const app = window.LOVETT_APP;
  const data = window.PORTFOLIO_DATA;
  if (!app || !data) return;

  const API = 'https://api.github.com';
  const LS_KEY = 'lovett-github-publish';
  const isBlob = v => typeof v === 'string' && v.startsWith('blob:');
  const asset = (kind, name) => window.LOVETT_ASSET ? window.LOVETT_ASSET(kind, name) : `assets/images/${kind}/${name}.webp`;

  // 저장에 실패해도 다음 시도 때 다시 올릴 수 있게 보관하는 파일들 (경로 → Blob)
  const pendingUploads = new Map();
  let busy = false;
  let editorOpened = false;
  let lastSavedSnapshot = null;

  // ---------- 설정 (이 브라우저에만 저장) ----------
  function readStored() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeStored(value) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function guessFromLocation() {
    const host = location.hostname || '';
    if (host.endsWith('.github.io')) {
      const owner = host.replace(/\.github\.io$/, '');
      const firstPath = location.pathname.split('/').filter(Boolean)[0];
      return { owner, repo: firstPath && !firstPath.includes('.') ? firstPath : `${owner}.github.io` };
    }
    return {};
  }
  function getConfig() {
    const stored = readStored();
    const fromData = data.settings.github || {};
    const guess = guessFromLocation();
    return {
      owner: stored.owner || fromData.owner || guess.owner || '',
      repo: stored.repo || fromData.repo || guess.repo || '',
      branch: stored.branch || fromData.branch || 'main',
      token: stored.token || ''
    };
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function openSettings(required = false) {
    return new Promise(resolve => {
      const cfg = getConfig();
      const dialog = document.createElement('dialog');
      dialog.className = 'admin-login-modal publish-settings-modal';
      dialog.innerHTML = `
        <form class="admin-login-box publish-settings-box" method="dialog">
          <button class="admin-login-close" type="button" aria-label="닫기">×</button>
          <p class="eyebrow">SAVE CONNECTION</p>
          <h2>저장 연결 설정</h2>
          <p>${required ? '처음 한 번만 입력하면 됩니다. ' : ''}입력한 값은 <b>이 브라우저에만</b> 기억됩니다. 다른 기기에서 저장하려면 그 기기에서도 한 번 입력해 주세요.</p>
          <label>GitHub 아이디<input name="owner" value="${escapeHtml(cfg.owner)}" placeholder="예: lovett35" autocomplete="off" required></label>
          <label>저장소 이름<input name="repo" value="${escapeHtml(cfg.repo)}" placeholder="예: portfolio" autocomplete="off" required></label>
          <label>브랜치<input name="branch" value="${escapeHtml(cfg.branch)}" autocomplete="off" required></label>
          <label>연결 키 (Fine-grained token)<input name="token" type="password" value="${escapeHtml(cfg.token)}" placeholder="github_pat_로 시작하는 키" autocomplete="off" required></label>
          <p class="publish-settings-help">키 만들기: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">GitHub 토큰 만들기 ↗</a><br>Repository access → <b>Only select repositories</b>에서 이 저장소만 선택, Permissions → <b>Contents: Read and write</b>.</p>
          <p class="admin-login-error publish-settings-result" aria-live="polite"></p>
          <div class="publish-settings-actions">
            <button type="button" class="admin-soft-btn" data-act="forget">이 기기에서 키 지우기</button>
            <button type="button" class="admin-soft-btn" data-act="test">연결 확인</button>
            <button type="submit" class="primary-button">저장</button>
          </div>
        </form>`;
      document.body.appendChild(dialog);
      const form = dialog.querySelector('form');
      const result = dialog.querySelector('.publish-settings-result');
      const read = () => ({
        owner: form.owner.value.trim(),
        repo: form.repo.value.trim().replace(/\.git$/, ''),
        branch: form.branch.value.trim() || 'main',
        token: form.token.value.trim()
      });
      let settled = false;
      const finish = value => {
        if (settled) return; settled = true;
        dialog.close(); dialog.remove(); resolve(value);
      };
      dialog.querySelector('.admin-login-close').addEventListener('click', () => finish(null));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
      dialog.querySelector('[data-act="forget"]').addEventListener('click', () => {
        const stored = readStored(); delete stored.token; writeStored(stored);
        form.token.value = '';
        result.textContent = '이 브라우저에서 연결 키를 지웠습니다.';
      });
      dialog.querySelector('[data-act="test"]').addEventListener('click', async () => {
        result.textContent = '확인 중…';
        try {
          const repo = await checkRepo(read());
          result.textContent = `연결 성공: ${repo.full_name} (저장 가능)`;
        } catch (error) { result.textContent = error.message; }
      });
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = read();
        if (!value.owner || !value.repo || !value.token) { result.textContent = '모든 칸을 입력해 주세요.'; return; }
        if (!writeStored(value)) result.textContent = '이 브라우저에 기억하지 못했습니다. 이번 저장에만 사용합니다.';
        finish(value);
      });
      dialog.showModal();
    });
  }

  // ---------- GitHub API ----------
  async function gh(cfg, path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${cfg.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body ? { 'Content-Type': 'application/json' } : {})
        }
      });
    } catch (_) {
      throw new Error('GitHub에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch (_) {}
      if (response.status === 401) throw new Error('연결 키가 틀렸거나 만료됐습니다. 설정에서 새 키를 넣어 주세요.');
      if (response.status === 404) throw new Error('저장소를 찾지 못했습니다. GitHub 아이디·저장소 이름·브랜치를 확인하고, 키에 이 저장소 권한이 있는지 확인해 주세요.');
      if (response.status === 403) throw new Error('저장 권한이 없습니다. 키의 Permissions에서 Contents를 Read and write로 설정해 주세요.');
      throw new Error(`GitHub 오류 (${response.status}) ${detail}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function checkRepo(cfg) {
    const repo = await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
    if (repo.permissions && !repo.permissions.push) throw new Error('이 키로는 읽기만 가능합니다. Contents 권한을 Read and write로 바꿔 주세요.');
    await gh(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
    return repo;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('이미지 변환에 실패했습니다.'));
      reader.readAsDataURL(blob);
    });
  }

  function base64ToText(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  // ---------- 이미지 준비 ----------
  async function fetchBlob(url) {
    let response;
    try { response = await fetch(url); } catch (_) { response = null; }
    if (!response || !response.ok) throw new Error(`이미지를 읽지 못했습니다: ${url}`);
    return response.blob();
  }

  async function makeThumb(blob) {
    const source = await window.LOVETT_IMAGE_UTILS.fileToSource(new File([blob], 'thumb.webp', { type: blob.type || 'image/webp' }));
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const scale = Math.max(800 / source.width, 600 / source.height);
    const w = source.width * scale, h = source.height * scale;
    canvas.getContext('2d').drawImage(source, (800 - w) / 2, (600 - h) / 2, w, h);
    if (source.close) source.close();
    return (await window.LOVETT_IMAGE_UTILS.makeCanvasWebP(canvas, { quality: .84 })).blob;
  }

  // ---------- 파일 이름 규칙 ----------
  // WORKS   : 연도-분야-영문이름-번호.webp   예) 2026-ld-cherry-mat-01.webp
  // ACTIVITY: event-연도-영문이름-번호.webp  예) event-2026-holosma-01.webp
  // HOME    : home-hero-날짜.webp            예) home-hero-20261007.webp
  // 썸네일은 thumbs 폴더에 같은 이름, 저작권 문구 없는 원본은 이름 뒤에 -clean이 붙습니다.
  const slugify = value => String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40);
  function projectSlug(p) {
    return slugify(p.slug) || (/^project-\d+$/.test(p.id) ? '' : slugify(p.id)) || 'work';
  }
  function eventSlug(e) {
    return slugify(e.slug) || (/^event-\d+$/.test(e.id) ? '' : slugify(e.id)) || 'event';
  }
  const pad2 = n => String(n).padStart(2, '0');
  const yearOf = (text, fallback = new Date().getFullYear()) => (String(text || '').match(/(19|20)\d{2}/) || [String(fallback)])[0];
  function projectPrefix(p) {
    const cat = slugify((p.categories || [])[0]) || 'etc';
    return `${yearOf(p.year)}-${cat}-${projectSlug(p)}`;
  }
  function eventPrefix(e) { return `event-${yearOf(e.date)}-${eventSlug(e)}`; }

  function usedNames() {
    const used = new Set(initialNames);
    const add = v => { if (typeof v === 'string' && !isBlob(v)) used.add(v); };
    app.projects.forEach(p => (p.images || []).forEach(img => { add(img.src); add(img.cleanSrc); }));
    app.events.forEach(e => (e.images || []).forEach(add));
    add(data.settings.heroImage);
    pendingUploads.forEach((_, path) => used.add(path.replace(/^.*\//, '').replace(/\.webp$/, '')));
    return used;
  }
  function nextName(prefix, used) {
    for (let n = 1; ; n++) {
      const name = `${prefix}-${pad2(n)}`;
      if (!used.has(name)) { used.add(name); return name; }
    }
  }
  function heroName(used) {
    const d = new Date();
    const base = `home-hero-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    if (!used.has(base)) { used.add(base); return base; }
    return nextName(base, used);
  }

  // 처음 불러왔을 때 있던 이름은 다시 쓰지 않습니다 (다시 자른 이미지가 예전 파일을 덮어쓰지 않도록).
  const initialNames = new Set();
  app.projects.forEach(p => (p.images || []).forEach(img => { initialNames.add(img.src); if (img.cleanSrc) initialNames.add(img.cleanSrc); }));
  app.events.forEach(e => (e.images || []).forEach(v => initialNames.add(v)));
  if (data.settings.heroImage) initialNames.add(data.settings.heroImage);

  window.LOVETT_FILE_NAMES = {
    projectSlug, eventSlug,
    projectExample: p => `${nextName(projectPrefix(p), usedNames())}.webp`,
    eventExample: e => `${nextName(eventPrefix(e), usedNames())}.webp`
  };

  function stage(path, blob) {
    pendingUploads.set(path, blob);
    window.LOVETT_LOCAL_ASSETS = window.LOVETT_LOCAL_ASSETS || {};
    window.LOVETT_LOCAL_ASSETS[path] = URL.createObjectURL(blob);
  }

  // 화면에서만 쓰던 임시 이미지 주소(blob:)를 실제 파일 이름으로 바꿉니다.
  async function materializeImages(progress) {
    const used = usedNames();
    for (const p of app.projects) {
      const coverMap = {};
      for (const img of p.images || []) {
        if (![img.src, img.thumbSrc, img.cleanSrc].some(isBlob)) continue;
        progress(`이미지 준비 중… (${p.title || p.id})`);
        const id = nextName(projectPrefix(p), used);
        const fullBlob = await fetchBlob(isBlob(img.src) ? img.src : asset('full', img.src));
        let thumbBlob;
        if (isBlob(img.thumbSrc)) thumbBlob = await fetchBlob(img.thumbSrc);
        else if (!isBlob(img.src)) thumbBlob = await fetchBlob(asset('thumbs', img.src));
        else thumbBlob = await makeThumb(fullBlob);
        let cleanId;
        if (img.cleanSrc && img.cleanSrc !== img.src) {
          if (isBlob(img.cleanSrc)) {
            cleanId = `${id}-clean`;
            stage(`assets/images/full/${cleanId}.webp`, await fetchBlob(img.cleanSrc));
          } else cleanId = img.cleanSrc;
        }
        stage(`assets/images/full/${id}.webp`, fullBlob);
        stage(`assets/images/thumbs/${id}.webp`, thumbBlob);
        coverMap[img.src] = id;
        img.src = id;
        delete img.thumbSrc;
        if (cleanId) img.cleanSrc = cleanId; else delete img.cleanSrc;
      }
      if (p.covers) {
        Object.keys(p.covers).forEach(key => {
          const value = p.covers[key];
          if (coverMap[value]) p.covers[key] = coverMap[value];
          else if (isBlob(value)) delete p.covers[key];
        });
      }
      delete p.previewCovers;
    }

    for (const e of app.events) {
      if (!Array.isArray(e.images)) continue;
      for (let i = 0; i < e.images.length; i++) {
        if (!isBlob(e.images[i])) continue;
        progress(`행사 이미지 준비 중… (${e.title || e.id})`);
        const id = nextName(eventPrefix(e), used);
        stage(`assets/images/full/${id}.webp`, await fetchBlob(e.images[i]));
        e.images[i] = id;
      }
    }

    if (isBlob(data.settings.heroImage)) {
      progress('HOME 대표 이미지 준비 중…');
      const id = heroName(used);
      stage(`assets/images/full/${id}.webp`, await fetchBlob(data.settings.heroImage));
      data.settings.heroImage = id;
    }
  }

  function serialize() {
    return JSON.stringify(data, (key, value) => {
      if (key === 'previewCovers' || key === 'thumbSrc') return undefined;
      return value;
    }, 2);
  }

  // 저장 안 한 수정이 있는지 비교할 때는 자동 계산되는 값(행사 상태)은 빼고 봅니다.
  function snapshot() {
    return JSON.stringify(data, (key, value) => (key === 'previewCovers' || key === 'status') ? undefined : value);
  }

  function buildDataJs() {
    const json = serialize();
    if (json.includes('"blob:')) throw new Error('아직 처리되지 않은 임시 이미지가 있습니다. 다시 시도해 주세요.');
    return `// 이 파일은 관리자 편집기의 '사이트에 저장' 버튼으로 자동 생성됩니다.\n// 직접 고쳐도 되지만, 다음 저장 때 편집기 내용으로 덮어써집니다.\nconst PORTFOLIO_DATA = ${json};\n\nif (typeof window !== "undefined") window.PORTFOLIO_DATA = PORTFOLIO_DATA;\n`;
  }

  function setStatus(html) {
    const el = document.getElementById('adminSaveStatus');
    if (el) el.innerHTML = html;
  }

  // ---------- 저장 ----------
  async function publish({ toast = () => {}, rerender = () => {} } = {}) {
    if (busy) return;
    if (location.protocol === 'file:') {
      alert('지금은 컴퓨터에 있는 파일을 직접 연 상태라 저장할 수 없습니다.\n인터넷에 올라간 사이트 주소(lovett.my)에서 편집기를 열어 주세요.');
      return;
    }
    let cfg = getConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      cfg = await openSettings(true);
      if (!cfg) return;
    }
    busy = true;
    const button = document.getElementById('adminPublish');
    if (button) { button.disabled = true; button.textContent = '저장 중…'; }
    const progress = text => setStatus(`<b>저장 중</b> · ${escapeHtml(text)}`);
    try {
      progress('GitHub 연결 확인 중…');
      const repoPath = `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
      const ref = await gh(cfg, `${repoPath}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
      const parentSha = ref.object.sha;
      const parentCommit = await gh(cfg, `${repoPath}/git/commits/${parentSha}`);

      await materializeImages(progress);
      // GitHub 아이디·저장소 이름은 사이트 파일에 남기지 않습니다 (이 브라우저에만 기억).
      delete data.settings.github;
      delete data.settings.adminPreviewPassword;

      const tree = [];
      let done = 0;
      for (const [path, blob] of pendingUploads) {
        done++;
        progress(`이미지 업로드 중… (${done}/${pendingUploads.size})`);
        const created = await gh(cfg, `${repoPath}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: await blobToBase64(blob), encoding: 'base64' }) });
        tree.push({ path, mode: '100644', type: 'blob', sha: created.sha });
      }

      progress('글·설정 저장 중…');
      const stamp = Date.now().toString(36);
      tree.push({ path: 'assets/data.js', mode: '100644', type: 'blob', content: buildDataJs() });

      // 방문자 브라우저가 예전 data.js를 계속 보여주지 않도록 index.html의 버전 표시를 바꿉니다.
      try {
        const indexFile = await gh(cfg, `${repoPath}/contents/index.html?ref=${encodeURIComponent(cfg.branch)}`);
        const html = base64ToText(indexFile.content);
        const next = html.replace(/assets\/data\.js(\?v=[^"']*)?(["'])/, `assets/data.js?v=${stamp}$2`);
        if (next !== html) tree.push({ path: 'index.html', mode: '100644', type: 'blob', content: next });
      } catch (_) { /* index.html 버전 표시는 실패해도 저장에는 지장이 없습니다. */ }

      const newTree = await gh(cfg, `${repoPath}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }) });
      const d = new Date();
      const commit = await gh(cfg, `${repoPath}/git/commits`, { method: 'POST', body: JSON.stringify({
        message: `편집기에서 저장 (${d.toLocaleString('ko-KR')})`,
        tree: newTree.sha,
        parents: [parentSha]
      }) });
      await gh(cfg, `${repoPath}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });

      pendingUploads.clear();
      lastSavedSnapshot = snapshot();
      rerender();
      const time = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setStatus(`<b>${time} 저장 완료</b> · 1~2분 뒤 실제 사이트에 반영됩니다. <a href="${commit.html_url || `https://github.com/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`}" target="_blank" rel="noreferrer">기록 보기 ↗</a>`);
      toast('저장했습니다! 1~2분 뒤 사이트에 반영됩니다.');
    } catch (error) {
      rerender();
      setStatus(`<b>저장 실패</b> · ${escapeHtml(error.message)}`);
      alert(`저장하지 못했습니다.\n\n${error.message}\n\n수정한 내용은 아직 이 화면에 남아 있으니, 문제를 해결한 뒤 다시 저장을 눌러 주세요.`);
    } finally {
      busy = false;
      const btn = document.getElementById('adminPublish');
      if (btn) { btn.disabled = false; btn.textContent = '사이트에 저장'; }
    }
  }

  // 저장하지 않은 수정이 있는데 창을 닫으려 하면 한 번 물어봅니다.
  lastSavedSnapshot = snapshot();
  const editorEl = document.getElementById('adminEditor');
  if (editorEl) new MutationObserver(() => { if (!editorEl.hidden) editorOpened = true; }).observe(editorEl, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('beforeunload', event => {
    if (!editorOpened) return;
    if (pendingUploads.size || snapshot() !== lastSavedSnapshot) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  window.LOVETT_PUBLISH = { publish, openSettings };
})();
