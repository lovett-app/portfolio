(() => {
  const data = window.PORTFOLIO_DATA || (typeof PORTFOLIO_DATA !== 'undefined' ? PORTFOLIO_DATA : null);
  const createEngine = window.LOVETT_CREATE_ASSISTANT_ENGINE;
  if (!data || !createEngine) return;

  const engine = createEngine(data);
  window.LOVETT_ASSISTANT = engine;

  const modal = document.getElementById('quoteModal');
  const messages = document.getElementById('assistantMessages');
  const quick = document.getElementById('assistantQuick');
  const quickPrev = document.getElementById('assistantQuickPrev');
  const quickNext = document.getElementById('assistantQuickNext');
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantInput');
  if (!modal || !messages || !quick || !form || !input) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const quickQuestions = [
    '언제부터 작업 가능해요?',
    '9월 작업 가능할까요?',
    '빠른 마감 가능할까요?',
    '작업 기간은 얼마나 걸리나요?',
    '꾸덕 반신 2명 얼마예요?',
    'SD 상업용 얼마예요?'
  ];

  function addBubble(role, text, meta = '') {
    const row = document.createElement('div');
    row.className = `assistant-message ${role}`;
    row.innerHTML = `<div class="assistant-bubble">${esc(text).replace(/\n/g,'<br>')}${meta ? `<small>${esc(meta)}</small>` : ''}</div>`;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    return row;
  }


  function scrollQuick(direction) {
    if (!quick) return;
    const amount = Math.max(220, Math.floor(quick.clientWidth * 0.72));
    quick.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  function updateQuickNav() {
    if (!quick || !quickPrev || !quickNext) return;
    const max = Math.max(0, quick.scrollWidth - quick.clientWidth);
    quickPrev.disabled = quick.scrollLeft <= 3;
    quickNext.disabled = quick.scrollLeft >= max - 3;
    const hasOverflow = max > 4;
    quickPrev.classList.toggle('is-hidden', !hasOverflow);
    quickNext.classList.toggle('is-hidden', !hasOverflow);
  }

  function setQuick(items = quickQuestions.map(value => ({label:value, value}))) {
    quick.innerHTML = items.map(item => `<button type="button" data-assistant-quick="${esc(item.value)}">${esc(item.label)}</button>`).join('');
    quick.querySelectorAll('[data-assistant-quick]').forEach(btn => btn.addEventListener('click', () => submitQuestion(btn.dataset.assistantQuick)));
    quick.scrollLeft = 0;
    requestAnimationFrame(updateQuickNav);
  }

  function quoteFormHtml() {
    return `
      <form class="assistant-quote-form" id="assistantQuoteForm">
        <div class="assistant-form-grid">
          <label>작업 종류<select name="kind"><option>LD</option><option>SD</option><option>COSTUME</option><option>BACKGROUND</option><option>EDIT</option></select></label>
          <label>사용 범위<select name="use"><option value="stream">방송용</option><option value="commercial">상업용</option></select></label>
          <label>채색<select name="style"><option value="clean">깔끔</option><option value="thick">꾸덕</option><option value="other">해당 없음</option></select></label>
          <label>인원<input name="people" type="number" min="1" value="1"></label>
          <label>범위<select name="crop"><option value="bust">흉상</option><option value="half">반신</option><option value="full">전신</option><option value="none">해당 없음</option></select></label>
          <label>희망 마감<input name="deadline" type="date"></label>
          <label class="wide">배경/추가 옵션<input name="extras" placeholder="예: 실내 배경, 표정 2종"></label>
          <label class="wide">기타 요청<textarea name="notes" placeholder="필요한 내용을 자유롭게 적어주세요."></textarea></label>
        </div>
        <button type="submit">예상 견적 확인</button>
      </form>`;
  }

  function estimateQuote(fd) {
    const kind = fd.get('kind');
    const use = fd.get('use');
    const style = fd.get('style');
    const people = Math.max(1, Number(fd.get('people')) || 1);
    const crop = fd.get('crop');
    const extras = String(fd.get('extras') || '');
    const deadline = String(fd.get('deadline') || '');
    let result = '';

    if (kind === 'LD') {
      const map = {clean:{bust:75000,half:120000,full:170000}, thick:{bust:150000,half:220000,full:270000}};
      const base = map[style]?.[crop];
      if (base) {
        let total = base * people;
        if (use === 'commercial') {
          total += 300000;
          if (people >= 5) total += 300000;
        }
        result = `기본 예상 금액은 ${total.toLocaleString('ko-KR')}원입니다.`;
      }
    } else if (kind === 'SD') {
      const base = use === 'commercial' ? (style === 'thick' ? 60000 : 40000) : (style === 'thick' ? 40000 : 20000);
      result = `기본 예상 금액은 ${(base * people).toLocaleString('ko-KR')}원입니다.`;
    } else if (kind === 'COSTUME') {
      result = '의상 디자인은 구성에 따라 300,000원부터 시작합니다.';
    } else if (kind === 'BACKGROUND') {
      result = '배경 디자인은 구성과 카메라 장면 수를 확인한 뒤 견적합니다.';
    } else if (kind === 'EDIT') {
      result = '편집 디자인은 내용을 확인한 뒤 개별 견적을 안내드립니다.';
    }

    const notes = [];
    if (extras) notes.push('배경·추가 옵션은 별도 확인이 필요합니다.');
    if (deadline) {
      const d = new Date(`${deadline}T00:00:00`);
      const month = d.getMonth() + 1;
      const status = data.schedule[month] || 'closed';
      notes.push(status === 'available' ? `${month}월은 현재 ○ 일정입니다.` : status === 'consult' ? `${month}월은 △로 일정 문의가 필요합니다.` : `${month}월은 현재 × 일정입니다.`);
    }
    notes.push('최종 금액과 일정은 자료 확인 후 확정됩니다.');
    return `${result || '선택한 조건은 개별 확인이 필요합니다.'} ${notes.join(' ')}`;
  }

  function showQuoteForm() {
    const row = document.createElement('div');
    row.className = 'assistant-message bot';
    row.innerHTML = `<div class="assistant-bubble assistant-form-bubble"><b>예상 견적 입력</b>${quoteFormHtml()}</div>`;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
    const quoteForm = row.querySelector('#assistantQuoteForm');
    quoteForm?.addEventListener('submit', event => {
      event.preventDefault();
      const fd = new FormData(quoteForm);
      const result = estimateQuote(fd);
      addBubble('bot', result, '예상 견적');
      if (window.LOVETT_CONTACT) {
        const labelOf = name => quoteForm.querySelector(`[name="${name}"]`)?.selectedOptions?.[0]?.text || fd.get(name) || '';
        const summary = [
          `작업 종류: ${fd.get('kind')}`, `사용 범위: ${labelOf('use')}`, `채색: ${labelOf('style')}`,
          `인원: ${fd.get('people')}명`, `범위: ${labelOf('crop')}`,
          fd.get('extras') ? `배경/추가 옵션: ${fd.get('extras')}` : '',
          fd.get('notes') ? `기타 요청: ${fd.get('notes')}` : ''
        ].filter(Boolean).concat(['', `[자동 예상 견적] ${result}`]).join('\n');
        const row = document.createElement('div');
        row.className = 'assistant-message bot';
        row.innerHTML = '<div class="assistant-bubble"><button type="button" class="assistant-contact-btn">이 조건으로 문의 보내기 →</button></div>';
        row.querySelector('button').addEventListener('click', () => window.LOVETT_CONTACT.prefill({
          kind: fd.get('kind'), use: fd.get('use'), deadline: fd.get('deadline'), message: summary
        }));
        messages.appendChild(row);
        messages.scrollTop = messages.scrollHeight;
      }
    });
  }

  function renderResult(result) {
    addBubble('bot', result.text, result.ruleName || '자동 안내');
    if (result.type === 'quoteForm') showQuoteForm();
    if (result.type === 'choices') setQuick(result.choices);
    else setQuick();
  }

  function submitQuestion(text) {
    const value = String(text || '').trim();
    if (!value) return;
    addBubble('user', value);
    input.value = '';
    renderResult(engine.ask(value));
  }

  quickPrev?.addEventListener('click', () => scrollQuick(-1));
  quickNext?.addEventListener('click', () => scrollQuick(1));
  quick?.addEventListener('scroll', updateQuickNav, { passive:true });
  window.addEventListener('resize', updateQuickNav);
  quick?.addEventListener('wheel', event => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && quick.scrollWidth > quick.clientWidth) {
      event.preventDefault();
      quick.scrollLeft += event.deltaY;
    }
  }, { passive:false });

  form.addEventListener('submit', event => {
    event.preventDefault();
    submitQuestion(input.value);
  });

  modal.addEventListener('close', () => document.body.style.overflow = '');
  modal.addEventListener('cancel', () => document.body.style.overflow = '');

  addBubble('bot', '견적이나 작업 일정, 사용 범위 등을 질문해 주세요. 일정은 GUIDE와 같은 데이터를 기준으로 안내합니다.');
  setQuick();
})();
