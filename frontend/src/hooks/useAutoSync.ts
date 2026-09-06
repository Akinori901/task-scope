import { useEffect, useRef } from "react";
import { triggerJiraSync, triggerSync } from "../api/client";
import type { BacklogSpace, JiraSpace } from "../api/types";

/** 自動同期の対象。Backlog / Jira を同じ形に揃えて扱う */
type SyncTarget = {
  id: number;
  interval: number;
  lastSyncedAt: string | null;
  trigger: (id: number) => Promise<unknown>;
};

/**
 * スペースの sync_interval_minutes に基づいて自動同期を実行するフック
 * 1分ごとにチェックし、last_synced_at + interval を超えていれば同期を発火
 *
 * Backlog / Jira の両方を対象にする（どちらも 0=手動のみ）。
 */
export function useAutoSync(spaces: BacklogSpace[] | undefined, jiraSpaces?: JiraSpace[] | undefined) {
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!spaces && !jiraSpaces) return;

    const targets: SyncTarget[] = [
      ...(spaces ?? []).map((s) => ({
        id: s.id,
        interval: s.sync_interval_minutes,
        lastSyncedAt: s.last_synced_at,
        trigger: triggerSync,
      })),
      ...(jiraSpaces ?? []).map((s) => ({
        id: s.id,
        interval: s.sync_interval_minutes,
        lastSyncedAt: s.last_synced_at,
        trigger: triggerJiraSync,
      })),
    ].filter((t) => t.interval > 0);

    if (targets.length === 0) return;

    const check = () => {
      if (syncingRef.current) return;

      const now = Date.now();
      for (const target of targets) {
        const lastSynced = target.lastSyncedAt ? new Date(target.lastSyncedAt).getTime() : 0;
        const intervalMs = target.interval * 60 * 1000;

        if (now - lastSynced >= intervalMs) {
          syncingRef.current = true;
          target.trigger(target.id).finally(() => {
            syncingRef.current = false;
          });
          break; // 1回に1スペースずつ
        }
      }
    };

    const timer = setInterval(check, 60_000); // 1分ごとにチェック
    check(); // 初回即チェック

    return () => clearInterval(timer);
  }, [spaces, jiraSpaces]);
}
