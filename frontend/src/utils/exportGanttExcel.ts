import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { GanttMilestone } from "../api/types";

// ---- helpers (same logic as GanttChart.tsx) ----
function getMonday(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface Week {
  start: Date;
  month: number;
  year: number;
  weekInMonth: number;
}

function buildWeeks(start: Date, end: Date): Week[] {
  const weeks: Week[] = [];
  let cur = getMonday(start);
  const stop = addDays(getMonday(end), 7);
  while (cur < stop) {
    weeks.push({
      start: new Date(cur),
      month: cur.getMonth(),
      year: cur.getFullYear(),
      weekInMonth: Math.ceil(cur.getDate() / 7),
    });
    cur = addDays(cur, 7);
  }
  return weeks;
}

function barCols(
  startStr: string,
  endStr: string,
  weeks: Week[],
): { startCol: number; endCol: number } | null {
  const s = new Date(startStr);
  const e = new Date(endStr);
  const first = weeks[0];
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || !first) return null;
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const firstWeek = first.start.getTime();
  const startCol = Math.max(0, (s.getTime() - firstWeek) / 604800000);
  const endCol = Math.min(weeks.length, (e.getTime() - firstWeek) / 604800000 + 1);
  if (endCol <= 0 || startCol >= weeks.length) return null;
  return { startCol: Math.max(0, startCol), endCol: Math.min(weeks.length, endCol) };
}

// ---- colors ----
const COLORS = {
  completed: "388e3c",
  in_progress: "42a5f5",
  stagnant: "ffa726",
  not_started: "78909c",
  overdue: "e53935",
  header: "2e2e2e",
  headerFont: "ffffff",
  border: "444444",
  labelBg: "1e1e1e",
  labelFont: "e0e0e0",
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

export async function exportGanttExcel(
  milestones: GanttMilestone[],
  timelineStartDate?: string | null,
) {
  if (milestones.length === 0) return;

  // ---- compute weeks ----
  const timelineStart = timelineStartDate
    ? new Date(timelineStartDate)
    : addDays(new Date(Math.min(...milestones.map((m) => new Date(m.start_date).getTime()))), -14);
  const timelineEnd = addDays(
    new Date(Math.max(...milestones.map((m) => new Date(m.end_date).getTime()))),
    14,
  );
  const weeks = buildWeeks(timelineStart, timelineEnd);

  // ---- today column index ----
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const firstWeekTime = weeks[0]?.start.getTime() ?? 0;
  const todayColIdx = weeks.length > 0 ? Math.floor((now.getTime() - firstWeekTime) / 604800000) : -1;

  // ---- build workbook ----
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ガントチャート");

  const labelCol = 1; // column A
  const weekStartCol = 2; // columns B onward

  // Column widths
  ws.getColumn(labelCol).width = 40;
  for (let i = 0; i < weeks.length; i++) {
    ws.getColumn(weekStartCol + i).width = 4;
  }

  // ---- Row 1: Month header ----
  const monthRow = ws.getRow(1);
  monthRow.height = 20;
  const labelCell = ws.getCell(1, labelCol);
  labelCell.value = "マイルストーン";
  labelCell.font = { bold: true, color: { argb: `FF${COLORS.headerFont}` }, size: 10 };
  labelCell.fill = fill(COLORS.header);
  labelCell.border = cellBorders;
  labelCell.alignment = { vertical: "middle" };

  // Build month groups and merge
  let ci = 0;
  while (ci < weeks.length) {
    const w = weeks[ci]!;
    const month = w.month;
    const year = w.year;
    let span = 0;
    while (ci + span < weeks.length && weeks[ci + span]!.month === month && weeks[ci + span]!.year === year) span++;
    const startExcelCol = weekStartCol + ci;
    const endExcelCol = weekStartCol + ci + span - 1;
    if (span > 1) {
      ws.mergeCells(1, startExcelCol, 1, endExcelCol);
    }
    const cell = ws.getCell(1, startExcelCol);
    cell.value = `${month + 1}月`;
    cell.font = { bold: true, color: { argb: `FF${COLORS.headerFont}` }, size: 9 };
    cell.fill = fill(COLORS.header);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorders;
    // Apply border to merged cells
    for (let j = startExcelCol; j <= endExcelCol; j++) {
      ws.getCell(1, j).border = cellBorders;
    }
    ci += span;
  }

  // ---- Row 2: Week header ----
  const weekRow = ws.getRow(2);
  weekRow.height = 18;
  ws.mergeCells(1, labelCol, 2, labelCol); // merge label cell across both header rows
  for (let i = 0; i < weeks.length; i++) {
    const cell = ws.getCell(2, weekStartCol + i);
    cell.value = `${weeks[i]!.weekInMonth}w`;
    cell.font = { color: { argb: "FFaaaaaa" }, size: 8 };
    cell.fill = fill(COLORS.header);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorders;
  }

  // ---- Data rows ----
  let rowIdx = 3;

  for (const ms of milestones) {
    const { stats } = ms;
    const bar = barCols(ms.start_date, ms.end_date, weeks);

    // Milestone label
    const msRow = ws.getRow(rowIdx);
    msRow.height = 40;
    const msLabelCell = ws.getCell(rowIdx, labelCol);
    msLabelCell.value = {
      richText: [
        { text: `${ms.name}\n`, font: { bold: true, size: 11, color: { argb: "FF000000" } } },
        {
          text: `${stats.total}件 達成率${stats.completion_rate}% | 未${stats.not_started} 進${stats.in_progress} 完${stats.completed}${stats.stagnant > 0 ? ` 滞${stats.stagnant}` : ""}`,
          font: { size: 10, color: { argb: "FF666666" } },
        },
      ],
    };
    msLabelCell.alignment = { vertical: "middle", wrapText: true };
    msLabelCell.border = cellBorders;

    // Milestone bar cells
    if (bar && stats.total > 0) {
      const startIdx = Math.floor(bar.startCol);
      const endIdx = Math.ceil(bar.endCol);
      const totalCells = endIdx - startIdx;

      // Distribute cells proportionally by status
      const segments: { color: string; count: number }[] = [];
      if (stats.completed > 0) segments.push({ color: COLORS.completed, count: stats.completed });
      if (stats.in_progress > 0) segments.push({ color: COLORS.in_progress, count: stats.in_progress });
      if (stats.stagnant > 0) segments.push({ color: COLORS.stagnant, count: stats.stagnant });
      if (stats.not_started > 0) segments.push({ color: COLORS.not_started, count: stats.not_started });

      // Map segments to cell ranges
      let cellOffset = 0;
      for (const seg of segments) {
        const segCells = Math.max(1, Math.round((seg.count / stats.total) * totalCells));
        for (let j = 0; j < segCells && cellOffset + j < totalCells; j++) {
          const col = weekStartCol + startIdx + cellOffset + j;
          if (col <= weekStartCol + weeks.length - 1) {
            ws.getCell(rowIdx, col).fill = fill(seg.color);
          }
        }
        cellOffset += segCells;
      }
    } else if (bar) {
      // No tickets — gray bar
      for (let j = Math.floor(bar.startCol); j < Math.ceil(bar.endCol); j++) {
        ws.getCell(rowIdx, weekStartCol + j).fill = fill("e0e0e0");
      }
    }

    // Apply borders to all week cells
    for (let i = 0; i < weeks.length; i++) {
      ws.getCell(rowIdx, weekStartCol + i).border = cellBorders;
    }

    rowIdx++;
  }

  // ---- Today red line (left border on today's column for all rows) ----
  if (todayColIdx >= 0 && todayColIdx < weeks.length) {
    const todayExcelCol = weekStartCol + todayColIdx;
    const redBorder: ExcelJS.Border = { style: "medium", color: { argb: "FFe53935" } };
    for (let r = 1; r < rowIdx; r++) {
      const cell = ws.getCell(r, todayExcelCol);
      cell.border = { ...cell.border, left: redBorder };
    }
  }

  // ---- export ----
  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(new Blob([buf]), `gantt_${today}.xlsx`);
}
