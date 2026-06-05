const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// 색상
const C = {
  primary: "#2E5090",
  green: "#1E7E34",
  red: "#CC0000",
  light: "#EEF2FA",
  gray: "#888888",
  border: "#CCCCCC",
  white: "#FFFFFF",
};

function hex(h) {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return [r / 255, g / 255, b / 255];
}

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
    ws.eachRow((row) => {
      rows.push(row.values.slice(1)); // index 0 is empty
    });
    result[ws.name] = rows;
  });
  return result;
}

// 단순 표 그리기 (pdfkit)
function drawTable(doc, { x, y, headers, rows, colWidths, headerColor, altColor }) {
  const rowH = 22;
  const fontSize = 9;
  let curY = y;

  // 헤더
  doc.save();
  doc.fillColor(headerColor).rect(x, curY, colWidths.reduce((a, b) => a + b, 0), rowH).fill();
  let cx = x;
  headers.forEach((h, i) => {
    doc
      .fillColor(C.white)
      .fontSize(fontSize)
      .text(String(h), cx + 4, curY + 6, { width: colWidths[i] - 8, align: "center" });
    cx += colWidths[i];
  });
  doc.restore();
  curY += rowH;

  // 데이터 행
  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? C.white : C.light;
    doc.save();
    doc.fillColor(bg).rect(x, curY, colWidths.reduce((a, b) => a + b, 0), rowH).fill();

    let cx2 = x;
    row.forEach((cell, ci) => {
      const { text, color } = typeof cell === "object" ? cell : { text: String(cell ?? ""), color: "#000000" };
      doc
        .fillColor(color || "#000000")
        .fontSize(fontSize)
        .text(text, cx2 + 4, curY + 6, { width: colWidths[ci] - 8, align: "center" });
      cx2 += colWidths[ci];
    });
    doc.restore();

    // 구분선
    doc.save().strokeColor(C.border).lineWidth(0.5)
      .rect(x, curY, colWidths.reduce((a, b) => a + b, 0), rowH).stroke().restore();
    curY += rowH;
  });

  // 테두리
  doc.save().strokeColor(C.border).lineWidth(0.5)
    .rect(x, y, colWidths.reduce((a, b) => a + b, 0), curY - y).stroke().restore();

  return curY;
}

async function generatePdf(excelPath, outputPath = "report.pdf") {
  const data = await loadExcel(excelPath);
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "매출 보고서" } });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const pageW = doc.page.width - 80; // 좌우 마진 40씩
  const lm = 40;

  // ── 제목 ──────────────────────────────────
  doc.fillColor(C.primary).fontSize(20).text("2025년 상반기 매출 보고서", lm, 40);
  doc.fillColor(C.gray).fontSize(10).text("Monthly Sales Report — H1 2025", lm, 68);
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  doc.fillColor(C.gray).fontSize(9).text(`작성일: ${today}`, lm, 68, { align: "right", width: pageW });
  doc.save().strokeColor(C.primary).lineWidth(1.5).moveTo(lm, 88).lineTo(lm + pageW, 88).stroke().restore();

  let curY = 100;

  // ── 요약 ──────────────────────────────────
  if (data["월별매출"]) {
    const rows = data["월별매출"].slice(1);
    const totals = rows.map((r) => Number(r[4] ?? 0));
    const sum = totals.reduce((a, b) => a + b, 0);
    const avg = sum / totals.length;
    const bestIdx = totals.indexOf(Math.max(...totals));
    const bestMonth = rows[bestIdx][0];

    doc.fillColor(C.primary).fontSize(12).text("■ 핵심 요약", lm, curY);
    curY += 20;

    const summaryRows = [
      ["상반기 총 매출", `${fmtNum(sum)} 원`],
      ["월 평균 매출", `${fmtNum(Math.round(avg))} 원`],
      ["최고 실적 월", String(bestMonth)],
    ];

    summaryRows.forEach(([k, v]) => {
      doc.save()
        .fillColor(C.light).rect(lm, curY, 120, 22).fill()
        .fillColor("#000000").fontSize(9)
        .text(k, lm + 6, curY + 6, { width: 114 })
        .restore();
      doc.fillColor("#000000").fontSize(9).text(v, lm + 126, curY + 6);
      doc.save().strokeColor(C.border).lineWidth(0.5)
        .rect(lm, curY, pageW, 22).stroke().restore();
      curY += 22;
    });
    curY += 14;
  }

  // ── 월별 매출 표 ──────────────────────────
  if (data["월별매출"]) {
    doc.fillColor(C.primary).fontSize(12).text("■ 월별 매출 현황", lm, curY);
    curY += 18;

    const [header, ...rows] = data["월별매출"];
    const colW = [48, 72, 72, 72, 80, 72];
    const tableRows = rows.map((row) => [
      row[0],
      fmtNum(row[1]),
      fmtNum(row[2]),
      fmtNum(row[3]),
      { text: fmtNum(row[4]), color: C.primary },
      fmtPct(row[5]),
    ]);

    curY = drawTable(doc, {
      x: lm, y: curY,
      headers: header,
      rows: tableRows,
      colWidths: colW,
      headerColor: C.primary,
    });
    curY += 14;
  }

  // ── 팀별 실적 표 ──────────────────────────
  if (data["팀별실적"]) {
    doc.fillColor(C.primary).fontSize(12).text("■ 팀별 목표 달성 현황", lm, curY);
    curY += 18;

    const [header, ...rows] = data["팀별실적"];
    const colW = [90, 110, 110, 90];
    const tableRows = rows.map((row) => {
      const rate = parseFloat(row[3] ?? 0);
      return [
        row[0],
        fmtNum(row[1]),
        fmtNum(row[2]),
        { text: `${rate.toFixed(1)}%`, color: rate >= 100 ? C.green : C.red },
      ];
    });

    curY = drawTable(doc, {
      x: lm, y: curY,
      headers: header,
      rows: tableRows,
      colWidths: colW,
      headerColor: C.green,
    });
  }

  doc.end();
  await new Promise((res) => stream.on("finish", res));
  console.log(`PDF 생성 완료: ${outputPath}`);
}

const excelArg = process.argv[2] || "sample_report.xlsx";
const outArg = process.argv[3] || "report.pdf";
generatePdf(excelArg, outArg);
