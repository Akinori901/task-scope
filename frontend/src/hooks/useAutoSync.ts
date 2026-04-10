import { useEffect, useRef } from "react";
import { triggerSync } from "../api/client";
import type { BacklogSpace } from "../api/types";

/**
 * スペースの sync_interval_minutes に基づいて自動同期を実行するフック
 * 1分ごとにチェックし、last_synced_at + interval を超えていれば同期を発火
 */
export function useAutoSync(spaces: BacklogSpace[] | undefined) {
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!spaces) return;

    const activeSpaces = spaces.filter((s) => s.sync_interval_minutes > 0);
    if (activeSpaces.length === 0) return;

    const check = () => {
      if (syncingRef.current) return;

      const now = Date.now();
      for (const space of activeSpaces) {
        const lastSynced = space.last_synced_at ? new Date(space.last_synced_at).getTime() : 0;
        const intervalMs = space.sync_interval_minutes * 60 * 1000;

        if (now - lastSynced >= intervalMs) {
          syncingRef.current = true;
          triggerSync(space.id).finally(() => {
            syncingRef.current = false;
          });
          break; // 1回に1スペースずつ
        }
      }
    };

    const timer = setInterval(check, 60_000); // 1分ごとにチェック
    check(); // 初回即チェック

    return () => clearInterval(timer);
  }, [spaces]);
}
