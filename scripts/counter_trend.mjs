// 하루 3회(06:10·13:10·20:10 KST) — 기술주가 떨어진 날, 반대로 오르는
// 국내/국외 종목 5개씩 + 국내/국외 ETF 5개씩 을 카카오톡 2통으로 발송

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

// 국내 개별 종목 (비기술 대형주·방어주)
const KR_STOCKS = {
  '한국전력': '015760.KS',
  'KT&G': '033780.KS',
  '신한지주': '055550.KS',
  'KB금융': '105560.KS',
  '하나금융지주': '086790.KS',
  '삼성생명': '032830.KS',
  'POSCO홀딩스': '005490.KS',
  '한국가스공사': '036460.KS',
  'SK텔레콤': '017670.KS',
  'KT': '030200.KS',
};

// 국내 ETF (방어/원자재/채권/인버스)
const KR_ETF = {
  'KODEX 골드선물(H)': '132030.KS',
  'TIGER 구리실물': '445910.KS',
  'KODEX 인버스': '114800.KS',
  'KODEX 200선물인버스2X': '252670.KS',
  'KODEX 은행': '091170.KS',
  'TIGER 헬스케어': '143860.KS',
  'ARIRANG 고배당주': '161510.KS',
  'KOSEF 국고채10년': '148070.KS',
  'KODEX 종합채권': '273130.KS',
  'TIGER 200에너지화학': '117460.KS',
};

// 국외(미국) 개별 종목 (비기술 대형주·방어주)
const US_STOCKS = {
  '존슨앤존슨 (JNJ)': 'JNJ',
  '일라이릴리 (LLY)': 'LLY',
  '유나이티드헬스 (UNH)': 'UNH',
  '머크 (MRK)': 'MRK',
  '프록터앤갬블 (PG)': 'PG',
  '코카콜라 (KO)': 'KO',
  '펩시 (PEP)': 'PEP',
  '월마트 (WMT)': 'WMT',
  '맥도날드 (MCD)': 'MCD',
  '엑손모빌 (XOM)': 'XOM',
  'JP모건 (JPM)': 'JPM',
  '버라이즌 (VZ)': 'VZ',
};

// 국외(미국) ETF (섹터/원자재/채권/인버스)
const US_ETF = {
  '에너지 (XLE)': 'XLE',
  '헬스케어 (XLV)': 'XLV',
  '금융 (XLF)': 'XLF',
  '유틸리티 (XLU)': 'XLU',
  '필수소비재 (XLP)': 'XLP',
  '금 (GLD)': 'GLD',
  '금광주 (GDX)': 'GDX',
  '미국채 20년 (TLT)': 'TLT',
  '배당주 (SCHD)': 'SCHD',
  '인버스 S&P (SH)': 'SH',
  '소재 (XLB)': 'XLB',
  'S&P500 (VOO)': 'VOO',
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

  // 새 refresh_token이 발급되면 GITHUB_ENV로 내보내 워크플로가 Secret을 갱신
  if (data.refresh_token) {
    console.log('::notice::새 refresh_token 발급됨 — GitHub Secret 자동 갱신 시도');
    const envFile = process.env.GITHUB_ENV;
    if (envFile) {
      const { appendFileSync } = await import('fs');
      appendFileSync(envFile, `NEW_KAKAO_REFRESH_TOKEN=${data.refresh_token}\n`);
    }
  }

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

// 등락률 내림차순 상위 5개
const top5 = (arr) => [...arr].sort((a, b) => b.pct - a.pct).slice(0, 5);
const fmt = (arr) => arr.map(x => `${x.name}: ${x.pct > 0 ? '+' : ''}${x.pct.toFixed(2)}%`).join('\n');

async function generateMessages(techAvg, techText, krStocks, krEtf, usStocks, usEtf) {
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
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `당신은 친절한 주식 선생님입니다. ${today} 브리핑을 초등학생도 이해할 수 있는 쉬운 말로 작성해주세요.

📉 미국 기술주 평균 등락: ${techAvg.toFixed(2)}%
[기술주 상세]
${techText}

기술주가 떨어진 날, 반대로 잘 버틴/오른 것들을 정리해야 합니다. 아래는 각 그룹의 상위 5개입니다.

[국내 종목 상위 5]
${krStocks}
[국내 ETF 상위 5]
${krEtf}
[국외(미국) 종목 상위 5]
${usStocks}
[국외(미국) ETF 상위 5]
${usEtf}

두 개의 메시지를 작성하세요:
- msg1 (🇰🇷 국내): 위 "국내 종목 5개"와 "국내 ETF 5개"를 각각 나열하고, 왜 기술주와 다르게 움직였는지 쉬운 비유로 설명. (인버스 ETF는 "시장이 내리면 오르도록 만든 상품"이라고 안내)
- msg2 (🇺🇸 국외): 위 "국외 종목 5개"와 "국외 ETF 5개"를 같은 방식으로.

각 메시지 규칙:
- 맨 위에 기술주가 올랐는지 내렸는지 한 줄
- "종목 5개" / "ETF 5개" 소제목으로 구분, 각 줄에 등락률 표기
- +면 왜 올랐는지, 마이너스면 "그래도 덜 빠짐"으로 솔직하게
- 이모지 적극 활용, 투자 권유 금지, "참고용" 안내
- 각 메시지 800자 이내

반드시 아래 JSON만 반환 (다른 텍스트·코드블록 없이):
{"msg1":"...", "msg2":"..."}`,
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API 오류: ${JSON.stringify(data)}`);
  const text = data.content[0].text.trim();
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`예상치 못한 응답: ${text}`);
  return JSON.parse(m[0]);
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
  const krStocks = await fetchGroup(KR_STOCKS);
  const krEtf = await fetchGroup(KR_ETF);
  const usStocks = await fetchGroup(US_STOCKS);
  const usEtf = await fetchGroup(US_ETF);
  const techAvg = tech.length ? tech.reduce((s, x) => s + x.pct, 0) / tech.length : 0;

  const { msg1, msg2 } = await generateMessages(
    techAvg, fmt(tech),
    fmt(top5(krStocks)), fmt(top5(krEtf)),
    fmt(top5(usStocks)), fmt(top5(usEtf)),
  );

  await sendKakaoMessage(accessToken, msg1);
  console.log(`국내 메시지 전송 완료 (${msg1.length}자)`);
  await new Promise(r => setTimeout(r, 1000));
  await sendKakaoMessage(accessToken, msg2);
  console.log(`국외 메시지 전송 완료 (${msg2.length}자)`);
  console.log(`기술주 평균 ${techAvg.toFixed(2)}%`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
