import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { QaItem } from "../api/client";

// ---- colors (合わせる: exportGanttExcel.ts のトーン) ----
const COLORS = {
  header: "2e2e2e",
  headerFont: "ffffff",
  border: "cccccc",
  altRow: "f5f5f5",
} as const;

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } };
}

const thinBorder: ExcelJS.Border = { style: "thin", color: { argb: `FF${COLORS.border}` } };
const cellBorders: Partial<ExcelJS.Borders> = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

interface ColumnDef {
  header: string;
  key: keyof QaItem | "no" | "actual";
  width: number;
}

// 標準QA様式: No / テスト観点 / 前提条件 / テスト手順 / 期待結果 / 実施結果 / 担当 / 備考
const COLUMNS: ColumnDef[] = [
  { header: "No", key: "no", width: 6 },
  { header: "テスト観点", key: "category", width: 24 },
  { header: "前提条件", key: "precondition", width: 30 },
  { header: "テスト手順", key: "steps", width: 44 },
  { header: "期待結果", key: "expected", width: 36 },
  { header: "実施結果", key: "actual", width: 12 },
  { header: "担当", key: "actual", width: 10 },
  { header: "備考", key: "note", width: 24 },
];

/** モデルが配列で返すフィールド（手順など）を改行区切りの文字列へ正規化する */
function toText(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join("\n");
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * QA テスト項目リストを標準QA様式の Excel としてダウンロードする。
 */
export async function exportQaExcel(
  issueKey: string,
  summary: string,
  items: QaItem[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("QA項目");

  // ---- タイトル行 ----
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `QAテスト項目リスト｜${issueKey} ${summary}`;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;

  // ---- ヘッダー行 (row 2) ----
  const headerRowIdx = 2;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 22;
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(headerRowIdx, i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: `FF${COLORS.headerFont}` }, size: 11 };
    cell.fill = fill(COLORS.header);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorders;
    ws.getColumn(i + 1).width = col.width;
  });

  // ---- データ行 ----
  items.forEach((item, idx) => {
    const rowIdx = headerRowIdx + 1 + idx;
    const row = ws.getRow(rowIdx);
    const steps = toText(item.steps);
    const values: string[] = [
      String(idx + 1),
      toText(item.category),
      toText(item.precondition),
      steps,
      toText(item.expected),
      "", // 実施結果（手入力用）
      "", // 担当（手入力用）
      toText(item.note),
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(rowIdx, i + 1);
      cell.value = v;
      cell.alignment = {
        vertical: "top",
        wrapText: true,
        horizontal: i === 0 ? "center" : "left",
      };
      cell.border = cellBorders;
      if (idx % 2 === 1) cell.fill = fill(COLORS.altRow);
    });
    // 行高さは手順の改行数に応じて
    const stepLines = steps.split("\n").length;
    row.height = Math.max(20, stepLines * 16);
  });

  // ---- オートフィルタ ----
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: COLUMNS.length },
  };
  // ヘッダー行を固定
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  // ---- export ----
  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename = `QA_${issueKey}_${today}.xlsx`;
  // file-saver は内部で <a download> を生成してクリックするが、ユーザー
  // ジェスチャーから切り離された文脈（バックグラウンドタスク完了後の自動DL）では
  // 一部ブラウザがブロックすることがある。明示的に <a> を生成してクリックし、
  // フォールバックとして saveAs も呼ぶ。
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // クリック直後に revoke するとブラウザによってはDLが中断されるため遅延
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    saveAs(blob, filename);
  }
}
