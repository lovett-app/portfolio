// 작업 문의 폼: FormSubmit(무료)을 통해 입력 내용과 첨부 이미지를 러빗 메일로 보냅니다.
// 처음 한 번은 FormSubmit이 보내는 확인 메일의 Activate 버튼을 눌러야 메일이 오기 시작합니다.
(() => {
  const data = window.PORTFOLIO_DATA;
  const app = window.LOVETT_APP;
  const form = document.getElementById('contactForm');
  const status = document.getElementById('contactStatus');
  const section = document.getElementById('contact');
  if (!data || !form) return;

  const MAX_FILES = 5;
  const MAX_TOTAL = 9.5 * 1024 * 1024;   // FormSubmit 한도 10MB보다 조금 여유 있게
  const SHRINK_OVER = 2 * 1024 * 1024;   // 2MB가 넘는 그림은 자동으로 줄여서 보냄
  let files = [];                        // { file, url }

  const lang = () => (document.documentElement.lang || 'ko').slice(0, 2);
  const MSG = {
    ko: { sending: '보내는 중…', ok: '문의가 전송되었습니다. 메일로 답장드릴게요!', required: '이름, 이메일, 문의 내용을 입력해 주세요.', badEmail: '이메일 주소를 다시 확인해 주세요.', fail: '전송하지 못했습니다. 잠시 후 다시 시도하거나 메일로 보내 주세요.', mail: '메일 앱으로 보내기', tooMany: `이미지는 ${MAX_FILES}장까지 첨부할 수 있어요.`, tooBig: '첨부 이미지가 너무 커요. 장수를 줄여 주세요. (합계 10MB까지)', notImage: '이미지 파일만 첨부할 수 있어요.', preparing: '이미지 준비 중…', remove: '삭제' },
    ja: { sending: '送信中…', ok: '送信しました。メールでご返信します。', required: 'お名前・メールアドレス・内容を入力してください。', badEmail: 'メールアドレスをご確認ください。', fail: '送信できませんでした。時間をおいて再度お試しいただくか、メールでお送りください。', mail: 'メールで送る', tooMany: `画像は${MAX_FILES}枚まで添付できます。`, tooBig: '添付画像が大きすぎます。枚数を減らしてください。（合計10MBまで）', notImage: '画像ファイルのみ添付できます。', preparing: '画像を準備中…', remove: '削除' },
    en: { sending: 'Sending…', ok: 'Sent! I will reply by email.', required: 'Please fill in your name, email and message.', badEmail: 'Please check your email address.', fail: 'Could not send. Please try again later or email me directly.', mail: 'Send with mail app', tooMany: `You can attach up to ${MAX_FILES} images.`, tooBig: 'Attachments are too large. Please attach fewer images (10MB total).', notImage: 'Only image files can be attached.', preparing: 'Preparing images…', remove: 'Remove' }
  };
  const t = key => (MSG[lang()] || MSG.ko)[key];

  function setStatus(text, type = '') {
    status.textContent = text;
    status.dataset.type = type;
  }

  function collect() {
    const fd = new FormData(form);
    return {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      kind: String(fd.get('kind') || ''),
      use: String(fd.get('use') || ''),
      deadline: String(fd.get('deadline') || ''),
      reference: String(fd.get('reference') || '').trim(),
      message: String(fd.get('message') || '').trim(),
      botcheck: fd.get('botcheck') ? true : false
    };
  }

  function mailtoFallback(v) {
    const body = [
      `이름: ${v.name}`, `이메일: ${v.email}`, `작업 종류: ${v.kind}`, `사용 범위: ${v.use}`,
      v.deadline ? `희망 마감일: ${v.deadline}` : '', v.reference ? `참고 자료: ${v.reference}` : '', '', v.message,
      files.length ? `\n(참고 이미지 ${files.length}장은 이 메일에 직접 첨부해 주세요.)` : ''
    ].join('\n');
    const subject = `[포트폴리오 문의] ${v.kind} · ${v.name}`;
    return `mailto:${data.settings.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function showMailButton(v) {
    let link = form.querySelector('.contact-mail-fallback');
    if (!link) {
      link = document.createElement('a');
      link.className = 'text-link contact-mail-fallback';
      form.querySelector('.contact-actions').prepend(link);
    }
    link.textContent = `${t('mail')} →`;
    link.href = mailtoFallback(v);
  }

  // ---------- 참고 이미지 첨부 ----------
  const drop = form.querySelector('.contact-files');
  const fileInput = form.querySelector('#contactFileInput');
  const list = form.querySelector('.contact-file-list');
  const sizeLabel = form.querySelector('.contact-file-size');
  const totalSize = () => files.reduce((sum, f) => sum + f.file.size, 0);
  const mb = n => `${(n / 1024 / 1024).toFixed(1)}MB`;

  function renderFiles() {
    list.innerHTML = files.map((f, i) => `<li><img src="${f.url}" alt=""><span>${f.file.name.replace(/[<>&"]/g, '')}</span><button type="button" data-remove-file="${i}" aria-label="${t('remove')}">×</button></li>`).join('');
    list.hidden = !files.length;
    if (sizeLabel) sizeLabel.textContent = files.length ? `${files.length} / ${MAX_FILES} · ${mb(totalSize())} / 10MB` : '';
  }

  // 큰 그림은 긴 변 2400px JPEG로 줄여서 첨부 용량을 아낍니다.
  async function shrink(file) {
    if (file.size <= SHRINK_OVER || !/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type)) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', .88));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (_) { return file; }
  }

  async function addFiles(fileList) {
    const incoming = [...fileList];
    if (!incoming.length) return;
    if (incoming.some(f => !f.type.startsWith('image/'))) setStatus(t('notImage'), 'error');
    const images = incoming.filter(f => f.type.startsWith('image/'));
    if (files.length + images.length > MAX_FILES) setStatus(t('tooMany'), 'error');
    const room = images.slice(0, Math.max(0, MAX_FILES - files.length));
    if (!room.length) return;
    setStatus(t('preparing'));
    for (const original of room) {
      const file = await shrink(original);
      if (totalSize() + file.size > MAX_TOTAL) { setStatus(t('tooBig'), 'error'); break; }
      files.push({ file, url: URL.createObjectURL(file) });
    }
    if (status.textContent === t('preparing')) setStatus('');
    renderFiles();
  }

  fileInput?.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  list?.addEventListener('click', event => {
    const btn = event.target.closest('[data-remove-file]');
    if (!btn) return;
    const [removed] = files.splice(Number(btn.dataset.removeFile), 1);
    if (removed) URL.revokeObjectURL(removed.url);
    renderFiles();
  });
  if (drop) {
    ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('is-dragover'); }));
    ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, () => drop.classList.remove('is-dragover')));
    drop.addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer?.files || []); });
  }
  form.addEventListener('paste', e => {
    const pasted = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (pasted.length) { e.preventDefault(); addFiles(pasted); }
  });

  // ---------- 보내기 ----------
  // 파일을 같이 보내려고 숨긴 창(iframe)에 일반 양식처럼 전송합니다. 사이트 화면은 그대로 유지돼요.
  function sendViaFormSubmit(v) {
    return new Promise((resolve, reject) => {
      const target = (data.settings.formsubmitId || data.settings.email || '').trim();
      if (!target) { reject(new Error('no target')); return; }
      const frameName = `contact-frame-${Date.now()}`;
      const iframe = document.createElement('iframe');
      iframe.name = frameName; iframe.hidden = true; iframe.setAttribute('aria-hidden', 'true');
      const out = document.createElement('form');
      out.method = 'POST'; out.enctype = 'multipart/form-data'; out.target = frameName; out.hidden = true;
      out.action = `https://formsubmit.co/${target.replace(/[^\w.@+-]/g, '')}`;
      const fields = {
        _subject: `[포트폴리오 문의] ${v.kind} · ${v.name}${files.length ? ` (이미지 ${files.length}장)` : ''}`,
        _replyto: v.email,
        _template: 'table',
        _captcha: 'false',
        _honey: '',
        '이름': v.name,
        '이메일': v.email,
        '작업 종류': v.kind,
        '사용 범위': v.use,
        '희망 마감일': v.deadline || '미정',
        '참고 링크': v.reference || '없음',
        '첨부 이미지': files.length ? `${files.length}장 (메일 첨부파일 확인)` : '없음',
        '문의 내용': v.message
      };
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = value;
        out.appendChild(input);
      });
      files.forEach((f, i) => {
        const input = document.createElement('input');
        input.type = 'file'; input.name = i === 0 ? 'attachment' : `attachment${i + 1}`;
        const dt = new DataTransfer(); dt.items.add(f.file); input.files = dt.files;
        out.appendChild(input);
      });
      let done = false;
      const cleanup = () => setTimeout(() => { iframe.remove(); out.remove(); }, 1000);
      const timer = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new Error('timeout')); } }, 60000);
      iframe.addEventListener('load', () => {
        if (done) return;
        done = true; clearTimeout(timer); cleanup(); resolve();
      });
      document.body.append(iframe, out);
      out.submit();
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const v = collect();
    if (v.botcheck) return;
    if (!v.name || !v.email || !v.message) { setStatus(t('required'), 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { setStatus(t('badEmail'), 'error'); return; }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(t('sending'));
    try {
      await sendViaFormSubmit(v);
      setStatus(t('ok'), 'ok');
      form.reset();
      files.forEach(f => URL.revokeObjectURL(f.url)); files = []; renderFiles();
      form.querySelector('.contact-mail-fallback')?.remove();
    } catch (error) {
      console.warn('contact form', error);
      setStatus(t('fail'), 'error');
      showMailButton(v);
    } finally {
      button.disabled = false;
    }
  });

  function goToContact() {
    const quoteModal = document.getElementById('quoteModal');
    if (quoteModal?.open) { quoteModal.close(); document.body.style.overflow = ''; }
    app?.showPage('guide');
    requestAnimationFrame(() => {
      section?.classList.add('visible');
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('[data-go-contact]');
    if (!link) return;
    event.preventDefault();
    goToContact();
  });

  if (location.hash === '#contact') window.addEventListener('load', () => setTimeout(goToContact, 150));

  // 견적 도우미에서 계산한 내용을 문의 양식에 미리 채워 넣습니다.
  function prefill({ kind, use, deadline, message } = {}) {
    if (kind) { const opt = [...form.kind.options].find(o => o.value === kind || o.text === kind); if (opt) form.kind.value = opt.value; }
    if (use) form.use.value = use === 'commercial' ? '상업용' : use === 'stream' ? '방송용' : use;
    if (deadline) form.deadline.value = deadline;
    if (message) {
      const current = form.message.value.trim();
      if (!current) form.message.value = message;
      else if (!current.includes(message)) form.message.value = `${current}\n\n${message}`;
    }
    goToContact();
    setTimeout(() => form.name.focus({ preventScroll: true }), 500);
  }

  window.LOVETT_CONTACT = { prefill, goToContact };
})();
