const ExcelJS = require("exceljs");

async function createSampleExcel(path = "sample_report.xlsx") {
  const wb = new ExcelJS.Workbook();

  // 월별 매출 시트
  const ws1 = wb.addWorksheet("월별매출");
  ws1.columns = [
    { header: "월", key: "month", width: 8 },
    { header: "제품A", key: "a", width: 16 },
    { header: "제품B", key: "b", width: 16 },
    { header: "제품C", key: "c", width: 16 },
    { header: "합계", key: "total", width: 18 },
    { header: "전월대비(%)", key: "pct", width: 14 },
  ];

  const headerRow = ws1.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5090" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center" };
  });

  const rawData = [
    ["1월", 12000000, 8500000, 6200000],
    ["2월", 13500000, 9200000, 5800000],
    ["3월", 15000000, 10100000, 7300000],
    ["4월", 14200000, 9800000, 8100000],
    ["5월", 16800000, 11200000, 8900000],
    ["6월", 18500000, 12500000, 9600000],
  ];

  let prevTotal = null;
  for (const [month, a, b, c] of rawData) {
    const total = a + b + c;
    const pct = prevTotal === null ? "" : +((total - prevTotal) / prevTotal * 100).toFixed(1);
    ws1.addRow({ month, a, b, c, total, pct });
    prevTotal = total;
  }

  // 팀별 실적 시트
  const ws2 = wb.addWorksheet("팀별실적");
  ws2.columns = [
    { header: "팀명", key: "team", width: 14 },
    { header: "목표", key: "goal", width: 16 },
    { header: "실적", key: "actual", width: 16 },
    { header: "달성률(%)", key: "rate", width: 14 },
  ];

  const teamHeader = ws2.getRow(1);
  teamHeader.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E7E34" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center" };
  });

  const teamData = [
    ["영업1팀", 50000000, 53200000],
    ["영업2팀", 45000000, 41800000],
    ["영업3팀", 40000000, 44100000],
    ["온라인팀", 30000000, 35600000],
  ];

  for (const [team, goal, actual] of teamData) {
    const rate = +((actual / goal) * 100).toFixed(1);
    ws2.addRow({ team, goal, actual, rate });
  }

  await wb.xlsx.writeFile(path);
  console.log(`샘플 Excel 생성: ${path}`);
}

createSampleExcel();
