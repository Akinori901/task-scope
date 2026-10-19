import { useState } from "react";

/**
 * マウントした時刻（ミリ秒）を返す。
 * 描画中に Date.now() を直接呼ぶと描画のたびに値が変わり、純粋でなくなるため、
 * 「直近 24 時間以内か」のような判定の基準時刻はこれで固定する。
 */
export function useMountedAt(): number {
  const [mountedAt] = useState(() => Date.now());
  return mountedAt;
}
