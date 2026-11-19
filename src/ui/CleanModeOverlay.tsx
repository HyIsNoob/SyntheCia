import React, { useEffect, useState } from 'react';

interface CleanModeOverlayProps {
  cleanMode: boolean;
  isRecording: boolean;
  countdown: number | null;
  onExitCleanMode: () => void;
}

export const CleanModeOverlay: React.FC<CleanModeOverlayProps> = ({
  cleanMode,
  isRecording,
  countdown,
  onExitCleanMode,
}) => {
  const [showHint, setShowHint] = useState(false);

  // Show a brief non-intrusive exit tip ONLY when entering Clean Mode manually (not during recording)
  useEffect(() => {
    if (cleanMode && !isRecording && countdown === null) {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 2600);
      return () => clearTimeout(t);
    }
    setShowHint(false);
  }, [cleanMode, isRecording, countdown]);

  if (!cleanMode && countdown === null) return null;

  return (
    <>
      {/* 3-2-1 Countdown before recording starts (vanishes completely before MediaRecorder starts) */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm pointer-events-none">
          <div className="text-8xl font-bold font-[var(--font-display)] text-white drop-shadow-[0_0_35px_rgba(139,92,246,0.9)] animate-pulse">
            {countdown}
          </div>
          <div className="mt-3 text-sm tracking-widest uppercase text-slate-200 font-medium">
            Chuẩn bị quay video siêu sạch 60fps...
          </div>
        </div>
      )}

      {/* Brief auto-fading hint when manually entering OBS Clean Video Mode */}
      {showHint && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-950/75 backdrop-blur-xl border border-white/15 text-xs text-slate-200 shadow-xl flex items-center gap-2 pointer-events-auto">
          <span>Clean Video Mode đang bật — Nhấn</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[11px] text-white">Esc</kbd>
          <span>hoặc</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[11px] text-white">V</kbd>
          <span>để hiện lại giao diện •</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[11px] text-white">Space</kbd>
          <span>Phát/Dừng</span>
          <button
            type="button"
            onClick={onExitCleanMode}
            className="ml-1 text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
          >
            Thoát
          </button>
        </div>
      )}
    </>
  );
};
