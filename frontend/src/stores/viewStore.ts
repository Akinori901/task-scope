import { create } from "zustand";
import type { ViewMode } from "../api/types";

export type ColorMode = "light" | "dark";

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** spaceId format: "b:<id>" for Backlog, "j:<id>" for Jira, null for all */
export type SpaceId = string | null;

/** Parse spaceId into API filter params */
export function parseSpaceId(sid: SpaceId): { space?: number; jira_space?: number } {
  if (!sid) return {};
  if (sid.startsWith("b:")) return { space: Number(sid.slice(2)) };
  if (sid.startsWith("j:")) return { jira_space: Number(sid.slice(2)) };
  return {};
}

/** バッファ係数の設定値 */
export interface BufferCoeffConfig {
  ambiguityWeight: number;       // 曖昧度の重み (default: 0.4)
  verificationWeight: number;    // 検証難度の重み (default: 0.3)
  coordinationWeight: number;    // 調整コストの重み (default: 0.3)
  minCoeff: number;              // 係数の最小値 (default: 1.2)
  maxCoeff: number;              // 係数の最大値 (default: 2.0)
}

export const DEFAULT_BUFFER_CONFIG: BufferCoeffConfig = {
  ambiguityWeight: 0.4,
  verificationWeight: 0.3,
  coordinationWeight: 0.3,
  minCoeff: 1.2,
  maxCoeff: 2.0,
};

interface ViewState {
  viewMode: ViewMode;
  spaceId: SpaceId;
  defaultCommentTag: string | null;
  colorMode: ColorMode;
  bufferConfig: BufferCoeffConfig;
  setViewMode: (mode: ViewMode) => void;
  setSpaceId: (id: SpaceId) => void;
  setDefaultCommentTag: (tag: string | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setBufferConfig: (config: BufferCoeffConfig) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  viewMode: "all",
  spaceId: null,
  defaultCommentTag: loadPref<string | null>("ts:defaultCommentTag", null),
  colorMode: loadPref<ColorMode>("ts:colorMode", "dark"),
  bufferConfig: loadPref<BufferCoeffConfig>("ts:bufferConfig", DEFAULT_BUFFER_CONFIG),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSpaceId: (id) => set({ spaceId: id }),
  setDefaultCommentTag: (tag) => {
    localStorage.setItem("ts:defaultCommentTag", JSON.stringify(tag));
    set({ defaultCommentTag: tag });
  },
  setColorMode: (mode) => {
    localStorage.setItem("ts:colorMode", JSON.stringify(mode));
    set({ colorMode: mode });
  },
  setBufferConfig: (config) => {
    localStorage.setItem("ts:bufferConfig", JSON.stringify(config));
    set({ bufferConfig: config });
  },
}));
