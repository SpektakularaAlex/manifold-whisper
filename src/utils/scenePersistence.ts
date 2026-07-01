import type { SavedSceneState } from "./sceneSerialization";
import { deserializeSceneState, serializeSceneState } from "./sceneSerialization";

const STORAGE_KEY = "manifold:last-scene";

type StoredScene = {
  version: 1;
  savedAt: number;
  sceneKey: string;
};

export function saveAutosavedScene(state: SavedSceneState): void {
  if (typeof window === "undefined") return;
  const payload: StoredScene = {
    version: 1,
    savedAt: Date.now(),
    sceneKey: serializeSceneState(state),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadAutosavedScene(): { sceneKey: string; state: SavedSceneState } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<StoredScene>;
  if (parsed.version !== 1 || typeof parsed.sceneKey !== "string") return null;
  return { sceneKey: parsed.sceneKey, state: deserializeSceneState(parsed.sceneKey) };
}

export function clearAutosavedScene(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
