const ExcelJS = require("exceljs");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

function fmtNum(v) {
  if (v === null || v === undefined || v === "") return "-";
  return Number(v).toLocaleString("ko-KR");
}

function fmtPct(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = parseFloat(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

async function loadExcel(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const result = {};
  wb.worksheets.forEach((ws) => {
    const rows = [];
    ws.eachRow((row) => rows.push(row.values.slice(1)));
    result[ws.name] = rows;
  });
  return result;
}

function buildSummaryHtml(rows) {
  const data = rows.slice(1);
  const totals = data.map((r) => Number(r[4] ?? 0));
  const sum = totals.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / totals.length);
  const bestIdx = totals.indexOf(Math.max(...totals));
  const bestMonth = data[bestIdx][0];

  return `
    <table class="summary-table">
      <tr><td class="label">상반기 총 매출</td><td>${fmtNum(sum)} 원</td></tr>
      <tr><td class="label">월 평균 매출</td><td>${fmtNum(avg)} 원</td></tr>
      <tr><td class="label">최고 실적 월</td><td>${bestMonth}</td></tr>
    </table>`;
}

function buildMonthlyHtml(rows) {
  const [header, ...data] = rows;
  const headerHtml = header.map((h) => `<th>${h}</th>`).join("");
  const bodyHtml = data.map((row) => `
    <tr>
      <td>${row[0]}</td>
      <td>${fmtNum(row[1])}</td>
      <td>${fmtNum(row[2])}</td>
      <td>${fmtNum(row[3])}</td>
      <td class="total">${fmtNum(row[4])}</td>
      <td>${fmtPct(row[5])}</td>
    </tr>`).join("");
  return `<table class="data-table blue"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function buildTeamHtml(rows) {
  const [header, ...data] = rows;
  const headerHtml = header.map((h) => `<th>${h}</th>`).join("");
  const bodyHtml = data.map((row) => {
    const rate = parseFloat(row[3] ?? 0);
    const cls = rate >= 100 ? "green" : "red";
    return `
    <tr>
      <td>${row[0]}</td>
      <td>${fmtNum(row[1])}</td>
      <td>${fmtNum(row[2])}</td>
      <td class="${cls}">${rate.toFixed(1)}%</td>
    </tr>`;
  }).join("");
  return `<table class="data-table green"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function buildHtml(data) {
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const monthly = data["월별매출"] ? buildMonthlyHtml(data["월별매출"]) : "";
  const summary = data["월별매출"] ? buildSummaryHtml(data["월별매출"]) : "";
  const team = data["팀별실적"] ? buildTeamHtml(data["팀별실적"]) : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; font-size: 10pt; color: #222; padding: 30px 40px; }
  h1 { font-size: 20pt; color: #2E5090; margin-bottom: 4px; }
  .subtitle { font-size: 10pt; color: #888; margin-bottom: 4px; }
  .date { font-size: 9pt; color: #888; text-align: right; }
  hr { border: none; border-top: 2px solid #2E5090; margin: 10px 0 20px; }
  h2 { font-size: 12pt; color: #2E5090; margin: 20px 0 10px; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .summary-table td { padding: 7px 10px; border: 1px solid #ccc; font-size: 9pt; }
  .summary-table .label { background: #EEF2FA; width: 140px; font-weight: 600; }
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .data-table thead tr { color: white; font-weight: 700; font-size: 9pt; }
  .data-table.blue thead tr { background: #2E5090; }
  .data-table.green thead tr { background: #1E7E34; }
  .data-table th, .data-table td { padding: 6px 8px; text-align: center; border: 1px solid #ccc; font-size: 9pt; }
  .data-table tbody tr:nth-child(even) { background: #EEF2FA; }
  .total { font-weight: 700; color: #2E5090; }
  .green { color: #1E7E34; font-weight: 700; }
  .red { color: #CC0000; font-weight: 700; }
</style>
</head>
<body>
  <h1>2025년 상반기 매출 보고서</h1>
  <div class="subtitle">Monthly Sales Report — H1 2025</div>
  <div class="date">작성일: ${today}</div>
  <hr>
  <h2>■ 핵심 요약</h2>
  ${summary}
  <h2>■ 월별 매출 현황</h2>
  ${monthly}
  <h2>■ 팀별 목표 달성 현황</h2>
  ${team}
</body>
</html>`;
}

async function generatePdf(excelPath, outputPath = "report.pdf") {
  const data = await loadExcel(excelPath);
  const html = buildHtml(data);

  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({
    path: outputPath,
    format: "A4",
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
    printBackground: true,
  });
  await browser.close();
  console.log(`PDF 생성 완료: ${outputPath}`);
}

const excelArg = process.argv[2] || "sample_report.xlsx";
const outArg = process.argv[3] || "report.pdf";
generatePdf(excelArg, outArg);
