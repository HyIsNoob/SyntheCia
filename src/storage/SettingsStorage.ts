import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types/visualizer';

const SETTINGS_KEY = 'synthecia.studio.v3.settings';
const META_KEY = 'synthecia.studio.v3.meta';
const DB_NAME = 'synthecia-studio-db';
const DB_VERSION = 2;
const MEDIA_STORE = 'media';
const LIBRARY_STORE = 'library';

export interface PersistedAppMeta {
  activePresetId: string | null;
  playbackSpeed: number;
  loopEnabled: boolean;
  customBgName?: string | null;
  customMidiName?: string | null;
}

export interface SavedSongMeta {
  id: string;
  name: string;
  noteCount: number;
  duration: number;
  savedAt: number;
}

interface SavedSongRecord extends SavedSongMeta {
  blob: Blob;
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
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
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
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).put(blob, key);
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
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(key);
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
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

/**
 * Multi-Song Browser Library (IndexedDB): persists user MIDI / Audio->MIDI songs as a quick-switch playlist.
 */
export async function saveSongToLibrary(
  name: string,
  blob: Blob,
  noteCount: number,
  duration: number
): Promise<SavedSongMeta | null> {
  try {
    const cleanName = name.replace(/\.(mid|midi)$/i, '').trim() || 'Untitled Song';
    const id = `song_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 42)}`;
    const record: SavedSongRecord = {
      id,
      name: cleanName,
      noteCount,
      duration,
      savedAt: Date.now(),
      blob,
    };
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readwrite');
      tx.objectStore(LIBRARY_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { id, name: cleanName, noteCount, duration, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export async function listSavedSongs(): Promise<SavedSongMeta[]> {
  try {
    const db = await openMediaDb();
    const rows = await new Promise<SavedSongRecord[]>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readonly');
      const req = tx.objectStore(LIBRARY_STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as SavedSongRecord[]) : []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows
      .map(({ id, name, noteCount, duration, savedAt }) => ({ id, name, noteCount, duration, savedAt }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function loadSavedSongBlob(id: string): Promise<{ name: string; blob: Blob } | null> {
  try {
    const db = await openMediaDb();
    const rec = await new Promise<SavedSongRecord | null>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readonly');
      const req = tx.objectStore(LIBRARY_STORE).get(id);
      req.onsuccess = () => resolve((req.result as SavedSongRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!rec || !(rec.blob instanceof Blob)) return null;
    return { name: rec.name, blob: rec.blob };
  } catch {
    return null;
  }
}

export async function deleteSavedSong(id: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readwrite');
      tx.objectStore(LIBRARY_STORE).delete(id);
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
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readwrite');
      tx.objectStore(LIBRARY_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

/**
 * Encodes non-default visual settings into a compact shareable URL hash (`#preset=...`).
 */
export function encodePresetToHash(settings: VisualizerSettings): string {
  const diff: Partial<VisualizerSettings> = {};
  const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof VisualizerSettings>;
  for (const k of keys) {
    if (k === 'customBgUrl' || k === 'customVideoUrl') continue;
    if (settings[k] !== DEFAULT_SETTINGS[k]) {
      (diff as Record<string, unknown>)[k] = settings[k];
    }
  }
  const json = JSON.stringify(diff);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#preset=${b64}`;
}

/**
 * Decodes a `#preset=...` URL hash into a safe partial VisualizerSettings patch.
 */
export function decodePresetFromHash(hash: string): Partial<VisualizerSettings> | null {
  try {
    const prefix = '#preset=';
    if (!hash || !hash.startsWith(prefix)) return null;
    const b64url = hash.slice(prefix.length).trim();
    if (!b64url) return null;
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<VisualizerSettings>;
    if (!parsed || typeof parsed !== 'object') return null;
    const safe: Partial<VisualizerSettings> = {};
    const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const [k, v] of Object.entries(parsed)) {
      if (k === 'customBgUrl' || k === 'customVideoUrl') continue;
      if (allowedKeys.has(k)) {
        (safe as Record<string, unknown>)[k] = v;
      }
    }
    return safe;
  } catch {
    return null;
  }
}
