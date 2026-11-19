import type { LyricLine } from '../types/visualizer';

/**
 * Parses standard LRC (`[mm:ss.xx] Line text`) or SRT (`00:01:23,456 --> 00:01:27,000`)
 * subtitle/lyric files into sorted LyricLine entries for glowing on-canvas rendering.
 */
export function parseLyricsText(rawText: string): LyricLine[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  // Detect SRT format by arrow timestamp pattern
  if (/-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(normalized)) {
    return parseSrt(normalized);
  }
  return parseLrc(normalized);
}

function parseSrtTimestamp(ts: string): number {
  const m = ts.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3600 +
    parseInt(m[2], 10) * 60 +
    parseInt(m[3], 10) +
    parseInt(m[4], 10) / 1000
  );
}

function parseSrt(text: string): LyricLine[] {
  const blocks = text.split(/\n{2,}/);
  const lines: LyricLine[] = [];

  for (const block of blocks) {
    const rows = block
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    if (rows.length < 2) continue;
    const timeRowIdx = rows.findIndex((r) => r.includes('-->'));
    if (timeRowIdx === -1) continue;
    const parts = rows[timeRowIdx].split('-->');
    if (parts.length !== 2) continue;

    const start = parseSrtTimestamp(parts[0]);
    const end = Math.max(start + 0.5, parseSrtTimestamp(parts[1]));
    const body = rows
      .slice(timeRowIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (body) {
      lines.push({ time: start, endTime: end, text: body });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function parseLrc(text: string): LyricLine[] {
  const rows = text.split('\n');
  const rawEntries: Array<{ time: number; text: string }> = [];
  const tagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const row of rows) {
    const times: number[] = [];
    let match: RegExpExecArray | null;
    tagRegex.lastIndex = 0;
    while ((match = tagRegex.exec(row)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const fracRaw = match[3] ?? '0';
      const frac =
        fracRaw.length === 3
          ? parseInt(fracRaw, 10) / 1000
          : fracRaw.length === 2
            ? parseInt(fracRaw, 10) / 100
            : parseInt(fracRaw, 10) / 10;
      times.push(mins * 60 + secs + frac);
    }
    if (times.length === 0) continue;
    const lyricText = row.replace(tagRegex, '').trim();
    if (!lyricText) continue;
    for (const t of times) {
      rawEntries.push({ time: t, text: lyricText });
    }
  }

  rawEntries.sort((a, b) => a.time - b.time);
  const lines: LyricLine[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const cur = rawEntries[i];
    const nextTime = i + 1 < rawEntries.length ? rawEntries[i + 1].time : cur.time + 5.5;
    lines.push({
      time: cur.time,
      endTime: Math.max(cur.time + 0.8, Math.min(cur.time + 8, nextTime)),
      text: cur.text,
    });
  }
  return lines;
}

/**
 * Returns the active lyric line index at `currentTime`, or -1 if none is active.
 */
export function findActiveLyricIndex(lines: readonly LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === -1) return -1;
  if (currentTime <= lines[best].endTime + 0.25) return best;
  return -1;
}
