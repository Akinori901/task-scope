export interface ScheduleRow {
  summary: string;
  start_date: string | null;
  due_date: string | null;
  assignee_name: string | null;
  status_name: string;
}

const SUMMARY_PATTERNS = ["タスク", "作業", "項目", "内容", "名前", "task", "name"];
const START_PATTERNS = ["開始", "start", "from", "着手"];
const END_PATTERNS = ["終了", "end", "to", "完了日", "期限", "due"];
const ASSIGNEE_PATTERNS = ["担当", "assignee", "who", "責任者"];
const STATUS_PATTERNS = ["ステータス", "状態", "status", "進捗"];

function matchColumn(header: string, patterns: string[]): boolean {
  const h = header.trim().toLowerCase();
  return patterns.some((p) => h.includes(p));
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "未定") return null;
  // yyyy-mm-dd or yyyy/mm/dd
  const match = trimmed.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  // mm/dd or mm-dd — use current year, but if the date is more than 3 months in the past, assume next year
  const shortMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (shortMatch) {
    const now = new Date();
    let year = now.getFullYear();
    const [, m, d] = shortMatch;
    const candidate = new Date(year, Number(m) - 1, Number(d));
    if (candidate.getTime() < now.getTime() - 90 * 86400000) {
      year++;
    }
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

function distributeDate(
  index: number,
  total: number,
  parentStart: string,
  parentDue: string,
): { start_date: string; due_date: string } {
  const s = new Date(parentStart);
  const e = new Date(parentDue);
  const totalMs = e.getTime() - s.getTime();
  const sliceMs = totalMs / total;
  const sliceStart = new Date(s.getTime() + sliceMs * index);
  const sliceEnd = new Date(s.getTime() + sliceMs * (index + 1));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start_date: fmt(sliceStart), due_date: fmt(sliceEnd) };
}

export function parseScheduleTable(
  description: string,
  parentStartDate: string | null,
  parentDueDate: string | null,
): ScheduleRow[] {
  if (!description) return [];

  // Find ## 詳細タスク section
  const lines = description.split("\n");
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,3}\s*詳細タスク/.test(lines[i]!)) {
      sectionStart = i + 1;
      break;
    }
  }
  if (sectionStart < 0) return [];

  // Extract table lines (starting with |)
  const tableLines: string[] = [];
  for (let i = sectionStart; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("|")) {
      tableLines.push(line);
    } else if (tableLines.length > 0) {
      break; // end of table
    }
    // skip blank lines before table starts
  }

  if (tableLines.length < 3) return []; // header + separator + at least 1 row

  // Parse header
  const headerCells = tableLines[0]!
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

  // Detect column indices
  let summaryIdx = -1;
  let startIdx = -1;
  let endIdx = -1;
  let assigneeIdx = -1;
  let statusIdx = -1;

  headerCells.forEach((h, i) => {
    if (summaryIdx < 0 && matchColumn(h, SUMMARY_PATTERNS)) summaryIdx = i;
    else if (startIdx < 0 && matchColumn(h, START_PATTERNS)) startIdx = i;
    else if (endIdx < 0 && matchColumn(h, END_PATTERNS)) endIdx = i;
    else if (assigneeIdx < 0 && matchColumn(h, ASSIGNEE_PATTERNS)) assigneeIdx = i;
    else if (statusIdx < 0 && matchColumn(h, STATUS_PATTERNS)) statusIdx = i;
  });

  // If no summary column detected, use first column
  if (summaryIdx < 0) summaryIdx = 0;

  // Parse data rows (skip header and separator)
  const dataLines = tableLines.slice(2);
  const rows: ScheduleRow[] = [];

  for (const line of dataLines) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const summary = cells[summaryIdx] ?? "";
    if (!summary || summary === "-" || summary === "—") continue;

    rows.push({
      summary,
      start_date: startIdx >= 0 ? parseDate(cells[startIdx] ?? "") : null,
      due_date: endIdx >= 0 ? parseDate(cells[endIdx] ?? "") : null,
      assignee_name: assigneeIdx >= 0 ? cells[assigneeIdx] || null : null,
      status_name: statusIdx >= 0 ? cells[statusIdx] || "未対応" : "未対応",
    });
  }

  // Fill missing dates with parent's period distributed equally
  if (parentStartDate && parentDueDate) {
    const needsFill = rows.filter((r) => !r.start_date || !r.due_date);
    if (needsFill.length > 0) {
      let fillIndex = 0;
      const fillTotal = needsFill.length;
      for (const row of rows) {
        if (!row.start_date || !row.due_date) {
          const dist = distributeDate(fillIndex, fillTotal, parentStartDate, parentDueDate);
          if (!row.start_date) row.start_date = dist.start_date;
          if (!row.due_date) row.due_date = dist.due_date;
          fillIndex++;
        }
      }
    }
  }

  return rows;
}
