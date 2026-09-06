/**
 * タスク通知のローカル状態（ダウンロード済み / 非表示）。
 *
 * これらをメモリ (useRef/useState) だけで持つと、リロードのたびに
 * 「QA の Excel が再ダウンロードされる」「× で消した通知が復活する」
 * という挙動になる。ブラウザに保存して跨いで覚えておく。
 *
 * サーバ側の削除が失敗しても表示が正しくなるよう、非表示はここを正とする。
 */

const DOWNLOADED_KEY = "task-scope:qa-downloaded";
const DISMISSED_KEY = "task-scope:tasks-dismissed";
// 無制限に増えないよう保持件数に上限を設ける（古いものから捨てる）
const MAX_ENTRIES = 500;

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(-MAX_ENTRIES)));
  } catch {
    /* プライベートモード等で保存できなくても動作は継続する */
  }
}

function add(key: string, id: string): void {
  const ids = read(key);
  if (ids.includes(id)) return;
  ids.push(id);
  write(key, ids);
}

/** QA の Excel をダウンロード済みとして記録する */
export const markQaDownloaded = (taskId: string): void => add(DOWNLOADED_KEY, taskId);

/** 既にダウンロード済みか（リロードしても覚えている） */
export const isQaDownloaded = (taskId: string): boolean =>
  read(DOWNLOADED_KEY).includes(taskId);

/** 通知を非表示にしたことを記録する */
export const markTaskDismissed = (taskId: string): void => add(DISMISSED_KEY, taskId);

/** 非表示にした通知の一覧 */
export const getDismissedTasks = (): Set<string> => new Set(read(DISMISSED_KEY));
