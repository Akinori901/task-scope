import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { TicketQueryParams } from "../api/client";
import { fetchTicketDetail, fetchTickets } from "../api/client";
import type { GanttMilestone } from "../api/types";
import { parseScheduleTable, type ScheduleRow } from "./parseScheduleTable";

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
  labelFont: "333333",
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
  filters?: TicketQueryParams,
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
      if (stats.overdue > 0) segments.push({ color: COLORS.overdue, count: stats.overdue });
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

  // ---- Sheet 2: 詳細 (full hierarchy) ----
  if (filters) {
    const ws2 = wb.addWorksheet("詳細");

    // Column widths
    ws2.getColumn(labelCol).width = 50;
    for (let i = 0; i < weeks.length; i++) {
      ws2.getColumn(weekStartCol + i).width = 4;
    }

    // Header rows (same as sheet 1)
    const monthRow2 = ws2.getRow(1);
    monthRow2.height = 20;
    const labelCell2 = ws2.getCell(1, labelCol);
    labelCell2.value = "詳細ガントチャート";
    labelCell2.font = { bold: true, color: { argb: `FF${COLORS.headerFont}` }, size: 10 };
    labelCell2.fill = fill(COLORS.header);
    labelCell2.border = cellBorders;
    labelCell2.alignment = { vertical: "middle" };

    let ci2 = 0;
    while (ci2 < weeks.length) {
      const w = weeks[ci2]!;
      const month = w.month;
      const year = w.year;
      let span = 0;
      while (ci2 + span < weeks.length && weeks[ci2 + span]!.month === month && weeks[ci2 + span]!.year === year) span++;
      const startExcelCol = weekStartCol + ci2;
      const endExcelCol = weekStartCol + ci2 + span - 1;
      if (span > 1) ws2.mergeCells(1, startExcelCol, 1, endExcelCol);
      const cell = ws2.getCell(1, startExcelCol);
      cell.value = `${month + 1}月`;
      cell.font = { bold: true, color: { argb: `FF${COLORS.headerFont}` }, size: 9 };
      cell.fill = fill(COLORS.header);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = cellBorders;
      for (let j = startExcelCol; j <= endExcelCol; j++) ws2.getCell(1, j).border = cellBorders;
      ci2 += span;
    }

    const weekRow2 = ws2.getRow(2);
    weekRow2.height = 18;
    ws2.mergeCells(1, labelCol, 2, labelCol);
    for (let i = 0; i < weeks.length; i++) {
      const cell = ws2.getCell(2, weekStartCol + i);
      cell.value = `${weeks[i]!.weekInMonth}w`;
      cell.font = { color: { argb: "FFaaaaaa" }, size: 8 };
      cell.fill = fill(COLORS.header);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = cellBorders;
    }

    let row2Idx = 3;

    // Helper: get bar color for a ticket
    function ticketColor(t: { status_name: string; is_stagnant?: boolean; is_overdue?: boolean }): string {
      if (t.is_stagnant) return COLORS.stagnant;
      if (t.is_overdue) return COLORS.overdue;
      if (t.status_name === "完了" || t.status_name === "Done" || t.status_name === "Closed") return COLORS.completed;
      if (t.status_name === "未対応" || t.status_name === "Open") return COLORS.not_started;
      return COLORS.in_progress;
    }

    // Helper: draw a ticket-style bar
    function drawBar(sheet: ExcelJS.Worksheet, rowNum: number, startDate: string | null, endDate: string | null, color: string, dashed = false) {
      if (!startDate || !endDate) return;
      const b = barCols(startDate, endDate, weeks);
      if (!b) return;
      const startIdx = Math.floor(b.startCol);
      const endIdx = Math.ceil(b.endCol);
      for (let j = startIdx; j < endIdx && j < weeks.length; j++) {
        const cell = sheet.getCell(rowNum, weekStartCol + j);
        if (dashed) {
          // Dashed style: lighter fill + border
          cell.fill = fill(color);
          cell.font = { color: { argb: `FF${color}` }, size: 6 };
          cell.value = "─";
        } else {
          cell.fill = fill(color);
        }
      }
    }

    // Helper: write label with indent
    function writeLabel(sheet: ExcelJS.Worksheet, rowNum: number, text: string, indent: number, bold = false, fontSize = 10) {
      const row = sheet.getRow(rowNum);
      row.height = indent === 0 ? 36 : 24;
      const cell = sheet.getCell(rowNum, labelCol);
      const prefix = "  ".repeat(indent);
      cell.value = prefix + text;
      cell.font = { bold, size: fontSize, color: { argb: `FF${COLORS.labelFont}` } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = cellBorders;
      // borders on week cells
      for (let i = 0; i < weeks.length; i++) {
        sheet.getCell(rowNum, weekStartCol + i).border = cellBorders;
      }
    }

    // Fetch and render
    for (const ms of milestones) {
      // Milestone row
      writeLabel(ws2, row2Idx, `📌 ${ms.name}`, 0, true, 11);
      const msBar = barCols(ms.start_date, ms.end_date, weeks);
      if (msBar && ms.stats.total > 0) {
        const startIdx = Math.floor(msBar.startCol);
        const endIdx = Math.ceil(msBar.endCol);
        const totalCells = endIdx - startIdx;
        const segments: { color: string; count: number }[] = [];
        if (ms.stats.completed > 0) segments.push({ color: COLORS.completed, count: ms.stats.completed });
        if (ms.stats.in_progress > 0) segments.push({ color: COLORS.in_progress, count: ms.stats.in_progress });
        if (ms.stats.overdue > 0) segments.push({ color: COLORS.overdue, count: ms.stats.overdue });
        if (ms.stats.stagnant > 0) segments.push({ color: COLORS.stagnant, count: ms.stats.stagnant });
        if (ms.stats.not_started > 0) segments.push({ color: COLORS.not_started, count: ms.stats.not_started });
        let cellOffset = 0;
        for (const seg of segments) {
          const segCells = Math.max(1, Math.round((seg.count / ms.stats.total) * totalCells));
          for (let j = 0; j < segCells && cellOffset + j < totalCells; j++) {
            const col = weekStartCol + startIdx + cellOffset + j;
            if (col <= weekStartCol + weeks.length - 1) ws2.getCell(row2Idx, col).fill = fill(seg.color);
          }
          cellOffset += segCells;
        }
      }
      row2Idx++;

      // Fetch root tickets for this milestone
      try {
        const rootRes = await fetchTickets({
          ...filters,
          milestone: ms.name,
          is_root: true,
          page: 1,
          ordering: "due_date",
        });
        const rootTickets = rootRes.data.results;

        for (const parent of rootTickets) {
          // Parent ticket row
          writeLabel(ws2, row2Idx, `${parent.issue_key} ${parent.summary}`, 1, true);
          drawBar(ws2, row2Idx, parent.start_date, parent.due_date, ticketColor(parent));
          row2Idx++;

          // Parent's schedule rows
          try {
            const parentDetail = await fetchTicketDetail(parent.id);
            const parentSchedule = parseScheduleTable(parentDetail.data.description, parent.start_date, parent.due_date);
            for (const sr of parentSchedule) {
              const label = sr.assignee_name ? `詳細Task｜担当：${sr.assignee_name} — ${sr.summary}` : `詳細Task — ${sr.summary}`;
              writeLabel(ws2, row2Idx, label, 2);
              drawBar(ws2, row2Idx, sr.start_date, sr.due_date, scheduleRowColor(sr), true);
              row2Idx++;
            }
          } catch { /* detail fetch failed, skip */ }

          // Child tickets
          if (parent.child_count > 0) {
            try {
              const childRes = await fetchTickets({
                ...filters,
                parent_id: parent.id,
                is_root: undefined,
                milestone: undefined,
                page: 1,
                ordering: "due_date",
              });
              const children = childRes.data.results;

              for (const child of children) {
                writeLabel(ws2, row2Idx, `${child.issue_key} ${child.summary}`, 2);
                drawBar(ws2, row2Idx, child.start_date, child.due_date, ticketColor(child));
                row2Idx++;

                // Child's schedule rows
                try {
                  const childDetail = await fetchTicketDetail(child.id);
                  const childSchedule = parseScheduleTable(childDetail.data.description, child.start_date, child.due_date);
                  for (const sr of childSchedule) {
                    const label = sr.assignee_name ? `詳細Task｜担当：${sr.assignee_name} — ${sr.summary}` : `詳細Task — ${sr.summary}`;
                    writeLabel(ws2, row2Idx, label, 3);
                    drawBar(ws2, row2Idx, sr.start_date, sr.due_date, scheduleRowColor(sr), true);
                    row2Idx++;
                  }
                } catch { /* detail fetch failed, skip */ }
              }
            } catch { /* children fetch failed, skip */ }
          }
        }
      } catch { /* root tickets fetch failed, skip */ }
    }

    // Today line on sheet 2
    if (todayColIdx >= 0 && todayColIdx < weeks.length) {
      const todayExcelCol = weekStartCol + todayColIdx;
      const redBorder: ExcelJS.Border = { style: "medium", color: { argb: "FFe53935" } };
      for (let r = 1; r < row2Idx; r++) {
        const cell = ws2.getCell(r, todayExcelCol);
        cell.border = { ...cell.border, left: redBorder };
      }
    }
  }

  // ---- export ----
  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  saveAs(new Blob([buf]), `gantt_${today}.xlsx`);
}

// Helper: color for schedule row based on status + overdue check
function scheduleRowColor(sr: ScheduleRow): string {
  const isCompleted = sr.status_name === "完了" || sr.status_name === "Done" || sr.status_name === "Closed";
  if (isCompleted) return COLORS.completed;
  // Overdue: due_date is past and not completed
  if (sr.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(sr.due_date) < today) return COLORS.overdue;
  }
  if (sr.status_name === "未対応" || sr.status_name === "Open") return COLORS.not_started;
  if (sr.status_name === "進行中" || sr.status_name === "In Progress") return COLORS.in_progress;
  return COLORS.not_started;
}
