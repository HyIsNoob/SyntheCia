import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types/visualizer';

const SETTINGS_KEY = 'synthecia.studio.v3.settings';
const META_KEY = 'synthecia.studio.v3.meta';
const DB_NAME = 'synthecia-studio-db';
const DB_VERSION = 1;
const STORE_NAME = 'media';

export interface PersistedAppMeta {
  activePresetId: string | null;
  playbackSpeed: number;
  loopEnabled: boolean;
  customBgName?: string | null;
  customMidiName?: string | null;
}

export function loadPersistedSettings(): VisualizerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VisualizerSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // Object URLs are re-hydrated asynchronously from IndexedDB
      customBgUrl: null,
      customVideoUrl: null,
      backgroundPreset:
        parsed.backgroundPreset === 'video'
          ? DEFAULT_SETTINGS.backgroundPreset
          : (parsed.backgroundPreset ?? DEFAULT_SETTINGS.backgroundPreset),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function savePersistedSettings(settings: VisualizerSettings): void {
  try {
    const serializable = {
      ...settings,
      customBgUrl: null,
      customVideoUrl: null,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore quota errors in restricted browsing modes
  }
}

export function loadPersistedMeta(): PersistedAppMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) {
      return { activePresetId: 'rainbow-neon-3d', playbackSpeed: 1, loopEnabled: false };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAppMeta>;
    return {
      activePresetId: parsed.activePresetId ?? null,
      playbackSpeed: parsed.playbackSpeed ?? 1,
      loopEnabled: Boolean(parsed.loopEnabled),
      customBgName: parsed.customBgName ?? null,
      customMidiName: parsed.customMidiName ?? null,
    };
  } catch {
    return { activePresetId: 'rainbow-neon-3d', playbackSpeed: 1, loopEnabled: false };
  }
}

export function savePersistedMeta(meta: PersistedAppMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveMediaBlob(key: 'customBg' | 'customMidi', blob: Blob): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Graceful no-op if IndexedDB is blocked
  }
}

export async function loadMediaBlob(key: 'customBg' | 'customMidi'): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    const res = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

export async function deleteMediaBlob(key: 'customBg' | 'customMidi'): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function clearAllStoredState(): Promise<void> {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(META_KEY);
  } catch {
    // ignore
  }
  await deleteMediaBlob('customBg');
  await deleteMediaBlob('customMidi');
}
