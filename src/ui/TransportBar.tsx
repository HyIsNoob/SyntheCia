import React, { useMemo } from 'react';
import { Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { ParsedMidi } from '../types/visualizer';

interface TransportBarProps {
  midi: ParsedMidi | null;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  loopEnabled: boolean;
  volume: number;
  pianoHeightRatio: number;
  inspectorOpen: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onRestart: () => void;
  onChangeSpeed: (speed: number) => void;
  onToggleLoop: () => void;
  onChangeVolume: (vol: number) => void;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

export const TransportBar: React.FC<TransportBarProps> = ({
  midi,
  currentTime,
  isPlaying,
  playbackSpeed,
  loopEnabled,
  volume,
  pianoHeightRatio,
  inspectorOpen,
  onTogglePlay,
  onSeek,
  onRestart,
  onChangeSpeed,
  onToggleLoop,
  onChangeVolume,
}) => {
  const duration = midi?.duration ?? 1;
  const progressPct = Math.max(0, Math.min(100, (currentTime / Math.max(0.1, duration)) * 100));

  // Precompute 72 mini density bars showing note activity across the song
  const densityBars = useMemo(() => {
    const bins = 72;
    const arr = new Float32Array(bins);
    if (!midi || midi.duration <= 0) return Array.from(arr);
    for (const n of midi.notes) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((n.start / midi.duration) * bins)));
      arr[idx] += 0.5 + n.velocity * 0.5;
    }
    let maxV = 1;
    for (let i = 0; i < bins; i++) if (arr[i] > maxV) maxV = arr[i];
    return Array.from(arr, (v) => Math.max(0.12, v / maxV));
  }, [midi]);

  const handleTimelinePointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!midi) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    onSeek(ratio * midi.duration);
  };

  // Position cleanly just above the piano keyboard
  const bottomOffset = `calc(${Math.round(pianoHeightRatio * 100)}vh + 14px)`;

  return (
    <div
      style={{ bottom: bottomOffset }}
      className={`fixed z-20 px-3.5 py-2 rounded-2xl bg-slate-950/72 backdrop-blur-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.65)] flex items-center gap-3 transition-all duration-200 ${
        inspectorOpen
          ? 'left-4 right-4 lg:right-[356px] max-w-[740px] mx-auto'
          : 'left-1/2 -translate-x-1/2 w-[min(94vw,760px)]'
      }`}
    >
      {/* Play / Pause & Restart */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRestart}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
          title="Phát lại từ đầu"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.55)] transition cursor-pointer"
          title={isPlaying ? 'Tạm dừng (Space)' : 'Phát nhạc (Space)'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>
      </div>

      {/* Time + Interactive Density Timeline */}
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <span className="text-[11px] font-mono text-slate-300 w-9 text-right shrink-0">
          {fmt(currentTime)}
        </span>

        <div
          onClick={handleTimelinePointer}
          className="relative flex-1 h-8 flex items-end gap-[2px] py-1 cursor-pointer group"
          title="Click để tua nhạc"
        >
          {densityBars.map((h, i) => {
            const pct = ((i + 0.5) / densityBars.length) * 100;
            const passed = pct <= progressPct;
            return (
              <div
                key={i}
                style={{ height: `${Math.round(h * 100)}%` }}
                className={`flex-1 rounded-full transition-colors ${
                  passed
                    ? 'bg-gradient-to-t from-violet-500 to-amber-300 shadow-[0_0_6px_rgba(167,139,250,0.5)]'
                    : 'bg-white/16 group-hover:bg-white/25'
                }`}
              />
            );
          })}

          {/* Playhead indicator */}
          <div
            style={{ left: `${progressPct}%` }}
            className="absolute top-0.5 bottom-0.5 w-0.5 bg-white shadow-[0_0_10px_#ffffff] pointer-events-none"
          />
        </div>

        <span className="text-[11px] font-mono text-slate-400 w-9 shrink-0">
          {fmt(duration)}
        </span>
      </div>

      {/* Speed + Loop + Volume */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            const idx = SPEEDS.indexOf(playbackSpeed);
            onChangeSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
          }}
          className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/14 text-[11px] font-mono text-slate-200 transition cursor-pointer"
          title="Đổi tốc độ phát"
        >
          {playbackSpeed}x
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          className={`p-1.5 rounded-lg transition cursor-pointer ${
            loopEnabled
              ? 'bg-violet-500/25 text-violet-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/8'
          }`}
          title="Lặp lại bài nhạc"
        >
          <Repeat className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5 pl-1">
          <button
            type="button"
            onClick={() => onChangeVolume(volume > 0.01 ? 0 : 0.82)}
            className="text-slate-300 hover:text-white cursor-pointer"
            title="Bật/tắt tiếng"
          >
            {volume <= 0.01 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
            className="studio-slider !w-14"
            aria-label="Âm lượng"
          />
        </div>
      </div>
    </div>
  );
};
