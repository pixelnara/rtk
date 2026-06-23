// 하루 3회(06:10·13:10·20:10 KST) — 기술주가 떨어진 날,
// 반대로 오르는 ① 섹터/카테고리 와 ② 개별 종목 을 카카오톡 발송

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;

// 기술주 바스켓 (방향 판단용)
const TECH = {
  'SOXL (반도체3배)': 'SOXL',
  'SMH (반도체)': 'SMH',
  '엔비디아': 'NVDA',
  'AMD': 'AMD',
  'QQQM (나스닥100)': 'QQQM',
};

// ① 섹터/카테고리 (ETF·원자재·채권)
const SECTORS = {
  '에너지 (XLE)': 'XLE',
  '헬스케어 (XLV)': 'XLV',
  '금융 (XLF)': 'XLF',
  '유틸리티 (XLU)': 'XLU',
  '필수소비재 (XLP)': 'XLP',
  '산업재 (XLI)': 'XLI',
  '소재 (XLB)': 'XLB',
  '부동산 (XLRE)': 'XLRE',
  '금 (GLD)': 'GLD',
  '금광주 (GDX)': 'GDX',
  '배당주 (SCHD)': 'SCHD',
  '미국채 20년 (TLT)': 'TLT',
  'S&P500 (VOO)': 'VOO',
};

// ② 개별 종목 (기술주와 다르게 움직이는 비기술 대형주)
const STOCKS = {
  '존슨앤존슨 (JNJ)': 'JNJ',
  '일라이릴리 (LLY)': 'LLY',
  '유나이티드헬스 (UNH)': 'UNH',
  '머크 (MRK)': 'MRK',
  '프록터앤갬블 (PG)': 'PG',
  '코카콜라 (KO)': 'KO',
  '펩시 (PEP)': 'PEP',
  '월마트 (WMT)': 'WMT',
  '코스트코 (COST)': 'COST',
  '맥도날드 (MCD)': 'MCD',
  '엑손모빌 (XOM)': 'XOM',
  '셰브론 (CVX)': 'CVX',
  'JP모건 (JPM)': 'JPM',
  '버크셔 (BRK-B)': 'BRK-B',
  '비자 (V)': 'V',
  '넥스트에라 (NEE)': 'NEE',
  '뉴몬트 금광 (NEM)': 'NEM',
  '버라이즌 (VZ)': 'VZ',
};

async function refreshKakaoToken() {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: KAKAO_REST_API_KEY,
    refresh_token: KAKAO_REFRESH_TOKEN,
  });
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 토큰 갱신 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fetchChange(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  const closes = data.chart.result[0].indicators.quote[0].close;
  const prev = closes[closes.length - 2];
  const curr = closes[closes.length - 1];
  if (!prev || !curr) return null;
  return { price: curr, pct: ((curr - prev) / prev) * 100 };
}

async function fetchGroup(group) {
  const out = [];
  for (const [name, symbol] of Object.entries(group)) {
    try {
      const r = await fetchChange(symbol);
      if (r) out.push({ name, ...r });
    } catch (e) {
      // 개별 종목 실패 시 스킵
    }
  }
  return out;
}

const fmt = (arr) => arr.map(x => `${x.name}: ${x.pct > 0 ? '+' : ''}${x.pct.toFixed(2)}%`).join('\n');

async function generateMessage(techAvg, techText, sectorRisers, stockRisers) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `당신은 친절한 주식 선생님입니다. ${today} 브리핑을 초등학생도 이해할 수 있는 쉬운 말로 작성해주세요.

📉 기술주 평균 등락: ${techAvg.toFixed(2)}%
[기술주 상세]
${techText}

[① 섹터/카테고리 중 오른 것]
${sectorRisers || '(오늘은 오른 섹터가 거의 없음)'}

[② 개별 종목 중 오른 것]
${stockRisers || '(오늘은 오른 개별 종목이 거의 없음)'}

작성 규칙:
- 제목: 오늘 기술주가 올랐는지 내렸는지 한 줄로
- **두 부분으로 나눠서 작성**:
  1) 🏷️ 반대로 오른 섹터/카테고리 — 무엇이 왜 올랐는지 쉬운 비유로
  2) 📈 반대로 오른 개별 종목 — 회사 이름과 함께, 왜 기술주와 다르게 움직였는지 쉽게
- 기술주가 떨어졌는데 이것들이 오른 "이유"를 강조 (예: 금은 불안할 때 찾는 안전자산, 헬스케어는 경기와 무관하게 필요 등)
- 기술주가 올랐다면, 그래도 함께 주목할 섹터·종목을 짚어주기
- 이모지 적극 활용
- 투자 권유나 단정은 피하고 "참고용"임을 부드럽게 안내
- 전체 900자 이내, 카카오톡 메시지 한 통 분량

메시지 본문만 출력 (JSON·코드블록 없이 바로 텍스트로).`,
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API 오류: ${JSON.stringify(data)}`);
  return data.content[0].text.trim();
}

async function sendKakaoMessage(accessToken, message) {
  const template = JSON.stringify({
    object_type: 'text',
    text: message,
    link: { web_url: '', mobile_web_url: '' },
  });
  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `template_object=${encodeURIComponent(template)}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 발송 실패: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  if (!ANTHROPIC_API_KEY || !KAKAO_REST_API_KEY || !KAKAO_REFRESH_TOKEN) {
    throw new Error('필수 환경변수 누락: ANTHROPIC_API_KEY, KAKAO_REST_API_KEY, KAKAO_REFRESH_TOKEN');
  }

  const accessToken = await refreshKakaoToken();

  const tech = await fetchGroup(TECH);
  const sectors = await fetchGroup(SECTORS);
  const stocks = await fetchGroup(STOCKS);
  const techAvg = tech.length ? tech.reduce((s, x) => s + x.pct, 0) / tech.length : 0;

  const sectorRisers = sectors.filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct);
  const stockRisers = stocks.filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct);

  const message = await generateMessage(techAvg, fmt(tech), fmt(sectorRisers), fmt(stockRisers));

  await sendKakaoMessage(accessToken, message);
  console.log(`반대매매 브리핑 전송 완료 (${message.length}자, 기술주 평균 ${techAvg.toFixed(2)}%, 오른 섹터 ${sectorRisers.length}개, 오른 종목 ${stockRisers.length}개)`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
