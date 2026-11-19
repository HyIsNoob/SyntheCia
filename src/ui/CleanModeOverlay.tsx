import React, { useEffect, useState } from 'react';
import { getTranslations } from '../i18n/translations';
import type { Language } from '../types/visualizer';

interface CleanModeOverlayProps {
  cleanMode: boolean;
  isRecording: boolean;
  countdown: number | null;
  language: Language;
  onExitCleanMode: () => void;
}

export const CleanModeOverlay: React.FC<CleanModeOverlayProps> = ({
  cleanMode,
  isRecording,
  countdown,
  language,
  onExitCleanMode,
}) => {
  const [showHint, setShowHint] = useState(false);
  const t = getTranslations(language);

  useEffect(() => {
    if (cleanMode && !isRecording && countdown === null) {
      setShowHint(true);
      const timer = setTimeout(() => setShowHint(false), 2600);
      return () => clearTimeout(timer);
    }
    setShowHint(false);
  }, [cleanMode, isRecording, countdown]);

  if (!cleanMode && countdown === null) return null;

  return (
    <>
      {countdown !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm pointer-events-none">
          <div className="text-8xl font-bold font-[var(--font-display)] text-white drop-shadow-[0_0_35px_rgba(139,92,246,0.9)] animate-pulse">
            {countdown}
          </div>
          <div className="mt-3 text-sm tracking-widest uppercase text-slate-200 font-medium">
            {t.countdownHint}
          </div>
        </div>
      )}

      {showHint && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-950/75 backdrop-blur-xl border border-white/15 text-xs text-slate-200 shadow-xl flex items-center gap-2 pointer-events-auto">
          <span>{t.cleanModeBanner}</span>
          <button
            type="button"
            onClick={onExitCleanMode}
            className="ml-1 text-cyan-300 hover:text-cyan-200 underline cursor-pointer font-semibold"
          >
            {t.cleanModeExit}
          </button>
        </div>
      )}
    </>
  );
};
