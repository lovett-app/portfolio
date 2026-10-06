(() => {
  const normalize = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hasAny = (text, words = []) => words.some(word => normalize(text).includes(normalize(word)));
  const allRequired = (text, words = []) => !words.length || words.every(word => normalize(text).includes(normalize(word)));
  const hasExcluded = (text, words = []) => words.some(word => normalize(text).includes(normalize(word)));
  const replaceVars = (template = '', vars = {}) => String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  const won = value => Number(String(value).replace(/[^0-9]/g, '')) || 0;
  const money = value => `${Number(value).toLocaleString('ko-KR')}원`;

  function extractMonth(text) {
    const m = String(text).match(/(?:^|\D)(1[0-2]|0?[1-9])\s*월/);
    return m ? Number(m[1]) : null;
  }
  function extractYear(text) {
    const m = String(text).match(/(?:^|\D)(20\d{2})\s*년/);
    return m ? Number(m[1]) : null;
  }
  function resolveRequestedMonth(text, now) {
    const month = extractMonth(text);
    if (!month) return {month:null, year:null, explicitYear:false};
    const explicitYear = extractYear(text);
    // 연도를 쓰지 않은 월 질문은 이미 지난 달이면 다음 해 일정으로 해석한다.
    const year = explicitYear || (month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear());
    return {month, year, explicitYear:Boolean(explicitYear)};
  }
  function extractDateLabel(text) {
    const m = String(text).match(/(?:(1[0-2]|0?[1-9])\s*월\s*)?(3[01]|[12]?\d)\s*일/);
    if (!m) return '';
    return `${m[1] ? Number(m[1]) + '월 ' : ''}${Number(m[2])}일`;
  }
  function extractPeople(text) {
    const m = String(text).match(/(\d+)\s*(?:명|인)/);
    return m ? Math.max(1, Number(m[1])) : 1;
  }
  function stageOf(text) {
    const t = normalize(text);
    if (/(채색|완성|컬러)/.test(t)) return 'color';
    if (/(선화|라인)/.test(t)) return 'line';
    if (/(러프|스케치)/.test(t)) return 'rough';
    return 'default';
  }
  function statusMark(status) {
    return status === 'available' ? '○' : status === 'consult' ? '△' : '×';
  }
  function addMonths(year, month, offset = 0) {
    const d = new Date(year, month - 1 + offset, 1);
    return {year:d.getFullYear(), month:d.getMonth()+1};
  }
  function monthLabel(year, month, baseYear = year) {
    return year === baseYear ? `${month}월` : `${year}년 ${month}월`;
  }


  function createAssistantEngine(data, options = {}) {
    const nowProvider = options.nowProvider || (() => new Date());
    const rules = () => (data.assistantRules || []).filter(rule => rule.enabled !== false).slice().sort((a,b) => (b.priority || 0) - (a.priority || 0));

    function getRule(id) { return (data.assistantRules || []).find(rule => rule.id === id); }
    function matchRules(text) {
      return rules().filter(rule => hasAny(text, rule.keywords || []) && allRequired(text, rule.required || []) && !hasExcluded(text, rule.exclude || []));
    }
    const scheduleByYear = data.scheduleByYear || { [Number(data.settings.scheduleYear)]: data.schedule || {} };
    function yearSchedule(year) { return scheduleByYear?.[year] || null; }
    function scheduleStatus(year, month) { return yearSchedule(year)?.[month] || null; }
    function findNextAvailableFrom(year, month, maxMonths = 24) {
      for (let i = 0; i < maxMonths; i += 1) {
        const d = addMonths(year, month, i);
        if (scheduleStatus(d.year, d.month) === 'available') return d;
      }
      return null;
    }
    function consultsBefore(year, month, target, maxMonths = 24) {
      const result = [];
      for (let i = 0; i < maxMonths; i += 1) {
        const d = addMonths(year, month, i);
        if (target && d.year === target.year && d.month === target.month) break;
        if (scheduleStatus(d.year, d.month) === 'consult') result.push(d);
      }
      return result;
    }
    function nextAvailableText(month, year) {
      const nextStart = addMonths(year, month, 1);
      const next = findNextAvailableFrom(nextStart.year, nextStart.month);
      return next ? ` 확정적으로 가능한 가장 빠른 일정은 ${monthLabel(next.year, next.month, year)}입니다.` : '';
    }
    function unavailableYearText(year, month) {
      return `${year}년 ${month}월 일정은 아직 공개되지 않았습니다. 일정이 업데이트되면 GUIDE와 도우미에 함께 반영됩니다.`;
    }

    function priceLd(text) {
      const p = data.pricing.ld.table.rows;
      const style = hasAny(text, ['꾸덕']) ? 2 : hasAny(text, ['깔끔']) ? 1 : null;
      const partMap = {흉상:0, 반신:1, 전신:2};
      const part = Object.keys(partMap).find(key => normalize(text).includes(key));
      const people = extractPeople(text);
      if (style && part) {
        const base = won(p[partMap[part]][style]);
        let total = base * people;
        let extra = '';
        if (hasAny(text, ['상업용','상업 이용','상업적 이용','굿즈 판매'])) {
          total += 300000;
          if (people >= 5) total += 300000;
          extra = ' (상업 이용 추가금 포함)';
        }
        return `${style === 2 ? '꾸덕' : '깔끔'} ${part} ${people > 1 ? people + '명 ' : ''}기준 예상 금액은 ${money(total)}${extra}입니다. 배경·추가 옵션에 따라 달라질 수 있습니다.`;
      }
      return getRule('ld-price')?.answers?.default || '';
    }

    function priceSd(text) {
      const commercial = hasAny(text, ['상업용','상업 이용','상업적 이용','굿즈 판매']);
      const thick = hasAny(text, ['꾸덕']);
      const clean = hasAny(text, ['깔끔']);
      const people = extractPeople(text);
      if (thick || clean) {
        const base = commercial ? (thick ? 60000 : 40000) : (thick ? 40000 : 20000);
        return `${thick ? '꾸덕' : '깔끔'} SD ${commercial ? '상업용' : '방송용'} ${people > 1 ? people + '명 ' : ''}기준 예상 금액은 ${money(base * people)}입니다.${commercial ? ' SD는 LD의 +300,000원 상업 이용 규칙을 적용하지 않습니다.' : ''}`;
      }
      return getRule('sd-price')?.answers?.default || '';
    }

    function runHandler(rule, text) {
      const now = nowProvider();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const requested = resolveRequestedMonth(text, now);
      const month = requested.month;
      const requestedYear = requested.year;
      const answers = rule.answers || {};

      switch (rule.handler) {
        case 'quoteForm': return {type:'quoteForm', text:answers.default || ''};
        case 'specificMonth': {
          if (!month) return null;
          if (requested.explicitYear && requestedYear < now.getFullYear()) return {type:'answer', text:`${requestedYear}년 ${month}월은 이미 지난 일정입니다.`};
          if (!yearSchedule(requestedYear)) return {type:'answer', text:unavailableYearText(requestedYear, month)};
          const status = scheduleStatus(requestedYear, month) || 'consult';
          return {type:'answer', text:replaceVars(answers[status] || answers.default || '', {month:requestedYear === currentYear ? month : `${requestedYear}년 ${month}`, year:requestedYear, nextAvailable:status === 'closed' ? nextAvailableText(month, requestedYear) : '', mark:statusMark(status)})};
        }
        case 'earliestSchedule': {
          if (month) return null;
          const available = findNextAvailableFrom(currentYear, currentMonth);
          if (!available) return {type:'answer', text:'현재 공개된 일정 안에는 ○로 표시된 신규 작업 가능 월이 없습니다. 문의를 남겨주시면 확인 후 안내드리겠습니다.'};
          const consult = consultsBefore(currentYear, currentMonth, available);
          const vars = {
            consultText: consult.length ? `${consult.map(d=>monthLabel(d.year,d.month,currentYear)).join(', ')}은 △로 문의가 가능합니다. ` : '',
            availableText: `확정적으로 가능한 가장 빠른 일정은 ${monthLabel(available.year, available.month, currentYear)}입니다.`
          };
          return {type:'answer', text:replaceVars(answers.default || '{consultText}{availableText}', vars)};
        }
        case 'rush': {
          const near = [addMonths(currentYear,currentMonth,0), addMonths(currentYear,currentMonth,1)];
          const states = near.map(d => scheduleStatus(d.year,d.month)).filter(Boolean);
          const key = states.includes('available') ? 'available' : states.includes('consult') ? 'consult' : 'closed';
          return {type:'answer', text:answers[key] || answers.default || ''};
        }
        case 'deadlineDate': {
          const date = extractDateLabel(text);
          const targetMonth = month || currentMonth;
          const targetYear = month ? requestedYear : currentYear;
          if (month && requested.explicitYear && targetYear < now.getFullYear()) return {type:'answer', text:`${targetYear}년 ${targetMonth}월은 이미 지난 일정입니다.`};
          if (month && !yearSchedule(targetYear)) return {type:'answer', text:unavailableYearText(targetYear, targetMonth)};
          const status = scheduleStatus(targetYear, targetMonth) || 'consult';
          return {type:'answer', text:replaceVars(answers[status] || answers.default || '', {month:targetYear === currentYear ? targetMonth : `${targetYear}년 ${targetMonth}`, year:targetYear, date:date || `${targetMonth}월 희망 마감일`, nextAvailable:status === 'closed' ? nextAvailableText(targetMonth, targetYear) : ''})};
        }
        case 'monthDuration': {
          if (!month) return null;
          if (requested.explicitYear && requestedYear < now.getFullYear()) return {type:'answer', text:`${requestedYear}년 ${month}월은 이미 지난 일정입니다.`};
          if (!yearSchedule(requestedYear)) return {type:'answer', text:unavailableYearText(requestedYear, month)};
          const status = scheduleStatus(requestedYear, month) || 'consult';
          return {type:'answer', text:replaceVars(answers[status] || answers.default || '', {month:requestedYear === currentYear ? month : `${requestedYear}년 ${month}`, year:requestedYear, nextAvailable:status === 'closed' ? nextAvailableText(month, requestedYear) : ''})};
        }
        case 'refund':
        case 'revision': {
          const stage = stageOf(text);
          return {type:'answer', text:answers[stage] || answers.default || ''};
        }
        case 'commercial': {
          const key = hasAny(text, ['sd','에스디','데포르메']) ? 'sd' : hasAny(text, ['ld','엘디','반신','전신','흉상']) ? 'ld' : 'default';
          return {type:'answer', text:answers[key] || answers.default || ''};
        }
        case 'ldPrice': return {type:'answer', text:priceLd(text)};
        case 'sdPrice': return {type:'answer', text:priceSd(text)};
        case 'background': return {type:'answer', text:answers.default || ''};
        case 'clarifyBackground': return {type:'choices', text:answers.default || '', choices:[
          {label:'단순 꾸밈', value:'단순 배경 꾸밈 가격이 궁금해요'},
          {label:'바다 · 하늘', value:'바다나 하늘 배경 가격이 궁금해요'},
          {label:'실내 · 꽃밭', value:'방 안이나 꽃밭 같은 복잡한 배경 가격이 궁금해요'}
        ]};
        case 'clarifyProps': return {type:'choices', text:answers.default || '', choices:[
          {label:'SD', value:'SD 소품 추가는 얼마인가요?'},
          {label:'의상 디자인', value:'의상 디자인 프랍 추가는 얼마인가요?'},
          {label:'배경', value:'배경에 특별 프랍을 추가하면 얼마인가요?'}
        ]};
        case 'static':
        default: return {type:'answer', text:answers.default || ''};
      }
    }

    function ask(input) {
      const text = String(input || '').trim();
      if (!text) return {type:'answer', text:'질문을 입력해 주세요.'};

      // 구체적인 가격 질문은 일반 '견적' 규칙보다 먼저 계산한다.
      const priceIntent = hasAny(text, ['견적','가격','얼마','비용','단가']);
      if (priceIntent && hasAny(text, ['sd','에스디','데포르메','미니 캐릭터'])) {
        const rule = getRule('sd-price');
        if (rule?.enabled !== false) return {...runHandler(rule, text), ruleId:rule.id, ruleName:rule.name};
      }
      if (priceIntent && hasAny(text, ['ld','엘디','흉상','반신','전신'])) {
        const rule = getRule('ld-price');
        if (rule?.enabled !== false) return {...runHandler(rule, text), ruleId:rule.id, ruleName:rule.name};
      }

      const candidates = matchRules(text);
      for (const rule of candidates) {
        const result = runHandler(rule, text);
        if (result && result.text) return {...result, ruleId:rule.id, ruleName:rule.name};
      }
      return {type:'fallback', text:'자동 안내로 정확히 답변드리기 어려운 질문입니다. 견적 문의 폼에 내용을 남겨주시면 확인 후 안내드리겠습니다.', ruleId:null};
    }

    return {ask, matchRules, extractMonth, extractYear, resolveRequestedMonth, extractPeople, getRule};
  }

  window.LOVETT_CREATE_ASSISTANT_ENGINE = createAssistantEngine;
})();
