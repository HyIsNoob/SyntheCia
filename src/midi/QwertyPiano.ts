/**
 * Maps standard QWERTY computer keyboard keys to 2+ octaves of concert piano notes
 * (FL Studio / Ableton style layout) relative to a base octave (default C4 = 60).
 */
const LOWER_ROW_OFFSETS: Record<string, number> = {
  KeyZ: -12, // C3
  KeyS: -11, // C#3
  KeyX: -10, // D3
  KeyD: -9,  // D#3
  KeyC: -8,  // E3
  KeyV: -7,  // F3
  KeyG: -6,  // F#3
  KeyB: -5,  // G3
  KeyH: -4,  // G#3
  KeyN: -3,  // A3
  KeyJ: -2,  // A#3
  KeyM: -1,  // B3
  Comma: 0,  // C4
  KeyL: 1,   // C#4
  Period: 2, // D4
  Semicolon: 3, // D#4
  Slash: 4,  // E4
};

const UPPER_ROW_OFFSETS: Record<string, number> = {
  KeyQ: 0,   // C4
  Digit2: 1, // C#4
  KeyW: 2,   // D4
  Digit3: 3, // D#4
  KeyE: 4,   // E4
  KeyR: 5,   // F4
  Digit5: 6, // F#4
  KeyT: 7,   // G4
  Digit6: 8, // G#4
  KeyY: 9,   // A4
  Digit7: 10,// A#4
  KeyU: 11,  // B4
  KeyI: 12,  // C5
  Digit9: 13,// C#5
  KeyO: 14,  // D5
  Digit0: 15,// D#5
  KeyP: 16,  // E5
};

export function qwertyCodeToMidi(code: string, baseOctaveShift = 0): number | null {
  let offset: number | undefined = UPPER_ROW_OFFSETS[code];
  if (offset === undefined) {
    offset = LOWER_ROW_OFFSETS[code];
  }
  if (offset === undefined) return null;

  const midi = 60 + baseOctaveShift * 12 + offset;
  if (midi < 21 || midi > 108) return null;
  return midi;
}

/**
 * Returns true if a keyboard event code is a playable letter/number/punctuation key
 * suitable for Magic Keys ("Giả bấm") mode (ignores modifiers, Escape, Arrows, Space, F-keys).
 */
export function isMagicTriggerKey(code: string): boolean {
  if (code.startsWith('Key') || code.startsWith('Digit')) return true;
  return (
    code === 'Comma' ||
    code === 'Period' ||
    code === 'Slash' ||
    code === 'Semicolon' ||
    code === 'Quote' ||
    code === 'BracketLeft' ||
    code === 'BracketRight' ||
    code === 'Enter'
  );
}
