// 매일 09:52 KST 반도체·AI 관련주 동향 카카오톡 자동 발송

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;

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

  // 새 refresh_token이 발급되면 환경변수로 내보내 GitHub Secret 업데이트에 사용
  if (data.refresh_token) {
    console.log(`::notice::새 refresh_token 발급됨 — GitHub Secret 업데이트 필요`);
    process.env.NEW_KAKAO_REFRESH_TOKEN = data.refresh_token;
    // GitHub Actions 환경파일에 쓰기
    const envFile = process.env.GITHUB_ENV;
    if (envFile) {
      const { appendFileSync } = await import('fs');
      appendFileSync(envFile, `NEW_KAKAO_REFRESH_TOKEN=${data.refresh_token}\n`);
    }
  }

  return data.access_token;
}

async function fetchStockData() {
  const symbols = {
    '삼성전자': '005930.KS',
    'SK하이닉스': '000660.KS',
    '현대차': '005380.KS',
    '엔비디아': 'NVDA',
    'AMD': 'AMD',
    'TSMC': 'TSM',
  };

  const results = [];
  for (const [name, symbol] of Object.entries(symbols)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();
      const closes = data.chart.result[0].indicators.quote[0].close;
      const prev = closes[closes.length - 2];
      const curr = closes[closes.length - 1];
      if (prev && curr) {
        const pct = ((curr - prev) / prev * 100).toFixed(2);
        const currency = symbol.endsWith('.KS') ? '원' : 'USD';
        results.push(`${name}: ${curr.toLocaleString()}${currency} (${pct > 0 ? '+' : ''}${pct}%)`);
      }
    } catch (e) {
      // 개별 종목 실패 시 스킵
    }
  }
  return results.join('\n');
}

async function generateMessages() {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  const stockData = await fetchStockData();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `당신은 주식 선생님입니다. ${today} 아침 브리핑을 초등학생도 이해할 수 있는 쉬운 말로 작성해주세요.

오늘의 실제 주가 데이터:
${stockData}

위 실제 데이터를 바탕으로 오른 종목은 왜 올랐는지, 떨어진 종목은 왜 떨어졌는지 쉽게 설명해주세요.
어려운 용어는 쉬운 비유로 설명하고, 짧고 재미있게 써주세요.

메시지1(200자 이하): 오늘 주가 움직임을 이모지와 함께 아주 쉽게 (실제 수치 포함)
메시지2(200자 이하): 앞으로 주목할 회사나 분야를 쉬운 이유와 함께

반드시 아래 JSON만 반환 (다른 텍스트 없이):
{"msg1":"...", "msg2":"..."}`,
      }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API 오류: ${JSON.stringify(data)}`);

  const text = data.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`예상치 못한 응답: ${text}`);

  return JSON.parse(jsonMatch[0]);
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
  const { msg1, msg2 } = await generateMessages();

  await sendKakaoMessage(accessToken, msg1);
  console.log(`메시지1 전송 완료 (${msg1.length}자)`);

  await new Promise(r => setTimeout(r, 1000));

  await sendKakaoMessage(accessToken, msg2);
  console.log(`메시지2 전송 완료 (${msg2.length}자)`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
