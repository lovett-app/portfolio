// 작업 문의 폼: Web3Forms(무료)를 통해 입력 내용을 러빗 메일로 보냅니다.
// Access Key는 관리자 편집기 HOME 탭의 '문의 폼 Access Key'에 넣으면 됩니다.
(() => {
  const data = window.PORTFOLIO_DATA;
  const app = window.LOVETT_APP;
  const form = document.getElementById('contactForm');
  const status = document.getElementById('contactStatus');
  const section = document.getElementById('contact');
  if (!data || !form) return;

  const lang = () => (document.documentElement.lang || 'ko').slice(0, 2);
  const MSG = {
    ko: { sending: '보내는 중…', ok: '문의가 전송되었습니다. 메일로 답장드릴게요!', required: '이름, 이메일, 문의 내용을 입력해 주세요.', badEmail: '이메일 주소를 다시 확인해 주세요.', fail: '전송하지 못했습니다. 잠시 후 다시 시도하거나 메일로 보내 주세요.', noKey: '문의 폼이 아직 준비 중입니다. 아래 버튼을 누르면 메일 앱으로 보낼 수 있어요.', mail: '메일 앱으로 보내기' },
    ja: { sending: '送信中…', ok: '送信しました。メールでご返信します。', required: 'お名前・メールアドレス・内容を入力してください。', badEmail: 'メールアドレスをご確認ください。', fail: '送信できませんでした。時間をおいて再度お試しいただくか、メールでお送りください。', noKey: 'フォームは準備中です。下のボタンからメールで送信できます。', mail: 'メールで送る' },
    en: { sending: 'Sending…', ok: 'Sent! I will reply by email.', required: 'Please fill in your name, email and message.', badEmail: 'Please check your email address.', fail: 'Could not send. Please try again later or email me directly.', noKey: 'The form is not ready yet. You can send it with your mail app instead.', mail: 'Send with mail app' }
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
      v.deadline ? `희망 마감일: ${v.deadline}` : '', v.reference ? `참고 자료: ${v.reference}` : '', '', v.message
    ].filter(line => line !== null).join('\n');
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const v = collect();
    if (v.botcheck) return;
    if (!v.name || !v.email || !v.message) { setStatus(t('required'), 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { setStatus(t('badEmail'), 'error'); return; }

    const key = (data.settings.contactFormKey || '').trim();
    if (!key) { setStatus(t('noKey'), 'error'); showMailButton(v); return; }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(t('sending'));
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key: key,
          subject: `[포트폴리오 문의] ${v.kind} · ${v.name}`,
          from_name: 'LOVETT 포트폴리오',
          replyto: v.email,
          '이름': v.name,
          '이메일': v.email,
          '작업 종류': v.kind,
          '사용 범위': v.use,
          '희망 마감일': v.deadline || '미정',
          '참고 자료': v.reference || '없음',
          '문의 내용': v.message,
          botcheck: false
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.message || String(response.status));
      setStatus(t('ok'), 'ok');
      form.reset();
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
