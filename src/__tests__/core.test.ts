import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { hexToRgb, resolveNoteColor } from '../engine/ColorUtils';
import {
  FIRST_MIDI,
  getKeyLayoutByMidi,
  getPianoLayout,
  LAST_MIDI,
  projectHighwayPoint,
  TOTAL_KEYS,
  WHITE_KEY_COUNT,
} from '../engine/PianoGeometry';
import { exportParsedMidiToBlob, transcribeMonoPcmToMidi } from '../audio/AudioToMidi';
import { DEMO_SONGS } from '../midi/DemoSongs';
import { findActiveLyricIndex, parseLyricsText } from '../midi/LyricsParser';
import { buildMagicSteps, findMagicStepIndexAtTime } from '../midi/MagicKeys';
import { detectChordForNotes, findVisibleNoteRange, midiToNoteName, parseMidiBuffer } from '../midi/MidiParser';
import { isMagicTriggerKey, qwertyCodeToMidi } from '../midi/QwertyPiano';
import { assignNotesToFingers, VirtualHandsController } from '../engine/VirtualHands';
import { decodePresetFromHash, encodePresetToHash } from '../storage/SettingsStorage';
import { DEFAULT_SETTINGS } from '../types/visualizer';

describe('PianoGeometry', () => {
  it('generates exact 88-key layout with 52 white keys and 36 black keys', () => {
    const layout = getPianoLayout();
    expect(layout).toHaveLength(TOTAL_KEYS);
    const white = layout.filter((k) => !k.isBlack);
    const black = layout.filter((k) => k.isBlack);
    expect(white).toHaveLength(WHITE_KEY_COUNT);
    expect(black).toHaveLength(36);
    expect(layout[0].midi).toBe(FIRST_MIDI);
    expect(layout[layout.length - 1].midi).toBe(LAST_MIDI);
    // Coverage from 0 to ~1
    expect(white[0].normX).toBeCloseTo(0, 6);
    expect(white[white.length - 1].normX + white[white.length - 1].normWidth).toBeCloseTo(1, 5);
  });

  it('projects 3D perspective highway narrowing cleanly toward top horizon', () => {
    const botLeft = projectHighwayPoint(0, 0, 1000, 800, true, 0.6);
    const topLeft = projectHighwayPoint(0, 1, 1000, 800, true, 0.6);
    const botRight = projectHighwayPoint(1, 0, 1000, 800, true, 0.6);
    const topRight = projectHighwayPoint(1, 1, 1000, 800, true, 0.6);

    expect(botLeft.y).toBeCloseTo(800, 3);
    expect(topLeft.y).toBeCloseTo(0, 3);
    expect(botRight.x - botLeft.x).toBeCloseTo(1000, 3);
    // Top edge should be significantly narrower than bottom edge
    expect(topRight.x - topLeft.x).toBeLessThan(700);
    expect(topLeft.scale).toBeLessThan(1);
  });

  it('looks up keys by midi number safely', () => {
    expect(getKeyLayoutByMidi(60)?.isBlack).toBe(false); // Middle C
    expect(getKeyLayoutByMidi(61)?.isBlack).toBe(true); // C#4
    expect(getKeyLayoutByMidi(10)).toBeUndefined();
  });
});

describe('MidiParser & Chord Detection', () => {
  it('converts MIDI numbers to pitch names', () => {
    expect(midiToNoteName(60)).toEqual({ name: 'C4', pitchClass: 'C' });
    expect(midiToNoteName(61)).toEqual({ name: 'C#4', pitchClass: 'C#' });
    expect(midiToNoteName(21)).toEqual({ name: 'A0', pitchClass: 'A' });
  });

  it('detects common major and minor chords accurately', () => {
    const cMajor = [48, 52, 55, 60].map((midi, i) => ({
      id: i,
      midi,
      ...midiToNoteName(midi),
      start: 0,
      duration: 1,
      end: 1,
      velocity: 0.8,
      trackIndex: 0,
      hand: 'left' as const,
    }));
    expect(detectChordForNotes(cMajor)).toBe('C');

    const aMinor = [45, 52, 57, 60, 64].map((midi, i) => ({
      id: i,
      midi,
      ...midiToNoteName(midi),
      start: 0,
      duration: 1,
      end: 1,
      velocity: 0.8,
      trackIndex: 0,
      hand: 'left' as const,
    }));
    expect(detectChordForNotes(aMinor)).toBe('Am');
  });

  it('parses a real MIDI binary buffer with notes, hands, and CC64 sustain', () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const lh = midi.addTrack();
    lh.addNote({ midi: 48, time: 0, duration: 1, velocity: 0.7 });
    lh.addCC({ number: 64, time: 0, value: 1 });
    lh.addCC({ number: 64, time: 2, value: 0 });

    const rh = midi.addTrack();
    rh.addNote({ midi: 72, time: 0.5, duration: 0.75, velocity: 0.9 });

    const raw = midi.toArray();
    const parsed = parseMidiBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'test.mid');

    expect(parsed.notes).toHaveLength(2);
    expect(parsed.notes[0].hand).toBe('left');
    expect(parsed.notes[1].hand).toBe('right');
    expect(parsed.sustainIntervals).toHaveLength(1);
    expect(parsed.sustainIntervals[0].start).toBeCloseTo(0, 2);
    expect(parsed.sustainIntervals[0].end).toBeCloseTo(2, 1);
    expect(parsed.measures.length).toBeGreaterThan(0);
  });

  it('supports multi-tempo MIDI headers when computing measure markers', () => {
    const midi = new Midi();
    midi.header.tempos = [
      { ticks: 0, bpm: 120 },
      { ticks: midi.header.ppq * 4, bpm: 60 }, // Bar 2 slows down to half tempo!
    ];
    midi.header.update();
    const tr = midi.addTrack();
    tr.addNote({ midi: 60, ticks: 0, durationTicks: midi.header.ppq * 2, velocity: 0.8 });
    tr.addNote({ midi: 64, ticks: midi.header.ppq * 4, durationTicks: midi.header.ppq * 4, velocity: 0.8 });

    const raw = midi.toArray();
    const parsed = parseMidiBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'rubato.mid');
    // Bar 1 (120 BPM, 4 beats) = 2.0s; Bar 2 (60 BPM, 4 beats) = 4.0s -> Bar 3 starts at ~6.0s!
    expect(parsed.measures[0].time).toBeCloseTo(0, 2);
    expect(parsed.measures[1].time).toBeCloseTo(2.0, 1);
    expect(parsed.measures[2].time).toBeCloseTo(6.0, 1);
  });
});

describe('DemoSongs & ColorUtils', () => {
  it('builds all 3 built-in demo songs with valid 88-key notes and measures', () => {
    expect(DEMO_SONGS.length).toBe(3);
    for (const song of DEMO_SONGS) {
      const parsed = song.build();
      expect(parsed.notes.length).toBeGreaterThan(80);
      expect(parsed.measures.length).toBeGreaterThan(4);
      for (const n of parsed.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(FIRST_MIDI);
        expect(n.midi).toBeLessThanOrEqual(LAST_MIDI);
      }
    }
  });

  it('resolves hex colors and dual-hand colors cleanly', () => {
    expect(hexToRgb('#ff9640')).toEqual({ r: 255, g: 150, b: 64 });
    const col = resolveNoteColor(
      { midi: 64, hand: 'right', velocity: 0.8, trackIndex: 1 },
      { colorMode: 'dual-hand', leftHandColor: '#ff9640', rightHandColor: '#9b6dff' }
    );
    expect(col).toEqual({ r: 155, g: 109, b: 255 });
  });
});

describe('VirtualHands Kinematics', () => {
  it('assigns octave chords to outer fingers (pinky + thumb) ergonomically and clamps wide sustained bass', () => {
    const col = { r: 255, g: 150, b: 64 };
    const slots = assignNotesToFingers('right', [
      { midi: 60, start: 1.0, isBlack: false, normCenterX: 0.45, velocity: 0.8, color: col, isPressed: true },
      { midi: 72, start: 1.0, isBlack: false, normCenterX: 0.58, velocity: 0.9, color: col, isPressed: true },
    ]);
    expect(slots[0]?.midi).toBe(60); // Thumb
    expect(slots[4]?.midi).toBe(72); // Pinky

    // Wide sustained bass (E1=28 held from t=0) + recent upper arpeggio (E3=52 at t=2.0) should NOT stretch 24 semitones
    const clusterSlots = assignNotesToFingers('left', [
      { midi: 28, start: 0.0, isBlack: false, normCenterX: 0.1, velocity: 0.7, color: col, isPressed: true },
      { midi: 52, start: 2.0, isBlack: false, normCenterX: 0.36, velocity: 0.8, color: col, isPressed: true },
    ]);
    const assignedMidis = clusterSlots.filter((s) => s !== null).map((s) => s!.midi);
    expect(assignedMidis).toEqual([52]);
  });

  it('smoothly glides pianist hands toward active MIDI notes', () => {
    const ctrl = new VirtualHandsController();
    const song = DEMO_SONGS[0].build();
    const initialRightX = ctrl.right.palmX;
    for (let step = 0; step < 30; step++) {
      ctrl.update(
        song,
        1.2 + step * 0.016,
        0.016,
        () => ({ r: 155, g: 109, b: 255 }),
        new Map()
      );
    }
    expect(ctrl.right.palmX).not.toBe(initialRightX);
    expect(ctrl.left.presence).toBeGreaterThan(0.5);
  });
});

describe('Performance Windowing, Magic Keys & QWERTY Piano', () => {
  it('binary-searches visible note windows accurately for large MIDI note lists', () => {
    const song = DEMO_SONGS[0].build();
    const [lo, hi] = findVisibleNoteRange(song.notes, 10.0, 12.5, song.maxNoteDuration);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(song.notes.length);
    // Every note overlapping [10.0, 12.5] must be contained inside [lo, hi)
    const brute = song.notes.filter((n) => n.start <= 12.5 && n.end >= 10.0);
    const windowed = song.notes.slice(lo, hi).filter((n) => n.start <= 12.5 && n.end >= 10.0);
    expect(windowed.length).toBe(brute.length);
  });

  it('groups simultaneous MIDI chords into sequential Magic Keys steps', () => {
    const song = DEMO_SONGS[0].build();
    const steps = buildMagicSteps(song);
    expect(steps.length).toBeGreaterThan(20);
    expect(steps.length).toBeLessThan(song.notes.length); // chords grouped together
    // Step times strictly increase
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].time).toBeGreaterThan(steps[i - 1].time);
    }
    const idxMid = findMagicStepIndexAtTime(steps, song.duration * 0.5);
    expect(idxMid).toBeGreaterThan(0);
    expect(idxMid).toBeLessThanOrEqual(steps.length);
  });

  it('maps QWERTY keyboard codes to valid 88-key MIDI pitches and filters Magic trigger keys', () => {
    expect(qwertyCodeToMidi('KeyQ', 0)).toBe(60); // Middle C4
    expect(qwertyCodeToMidi('KeyZ', 0)).toBe(48); // C3
    expect(qwertyCodeToMidi('KeyQ', 1)).toBe(72); // C5
    expect(isMagicTriggerKey('KeyA')).toBe(true);
    expect(isMagicTriggerKey('Digit5')).toBe(true);
    expect(isMagicTriggerKey('Escape')).toBe(false);
    expect(isMagicTriggerKey('Space')).toBe(false);
  });

  it('transcribes synthetic mono PCM audio into accurate MIDI pitches and exports valid .mid binary', async () => {
    const sr = 11025;
    const durSec = 1.2;
    const pcm = new Float32Array(Math.floor(sr * durSec));
    // Generate A4 (440 Hz, MIDI 69) from 0.1s..0.55s and C5 (523.25 Hz, MIDI 72) from 0.65s..1.05s
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sr;
      if (t >= 0.1 && t <= 0.55) {
        pcm[i] = Math.sin(2 * Math.PI * 440 * t) * 0.8;
      } else if (t >= 0.65 && t <= 1.05) {
        pcm[i] = Math.sin(2 * Math.PI * 523.251 * t) * 0.8;
      }
    }

    const parsed = await transcribeMonoPcmToMidi(pcm, sr, 'synth-test.wav', { sensitivity: 'balanced' });
    const detectedMidis = parsed.notes.map((n) => n.midi);
    expect(detectedMidis).toContain(69); // A4
    expect(detectedMidis).toContain(72); // C5

    const midBlob = exportParsedMidiToBlob(parsed);
    expect(midBlob.size).toBeGreaterThan(40);
  });

  it('parses LRC & SRT lyrics and finds active line accurately', () => {
    const lrc = `[00:01.50] First glowing line\n[00:05.25] Second chorus line`;
    const parsedLrc = parseLyricsText(lrc);
    expect(parsedLrc).toHaveLength(2);
    expect(findActiveLyricIndex(parsedLrc, 0.5)).toBe(-1);
    expect(findActiveLyricIndex(parsedLrc, 2.1)).toBe(0);
    expect(findActiveLyricIndex(parsedLrc, 6.0)).toBe(1);

    const srt = `1\n00:00:02,000 --> 00:00:04,500\nHello Piano\n\n2\n00:00:05,000 --> 00:00:08,000\nStarlight`;
    const parsedSrt = parseLyricsText(srt);
    expect(parsedSrt).toHaveLength(2);
    expect(parsedSrt[0].text).toBe('Hello Piano');
    expect(findActiveLyricIndex(parsedSrt, 3.0)).toBe(0);
    expect(findActiveLyricIndex(parsedSrt, 6.2)).toBe(1);
  });

  it('round-trips shareable preset URL hashes safely without leaking object URLs', () => {
    const custom = {
      ...DEFAULT_SETTINGS,
      particleTheme: 'sakura' as const,
      instrument: 'felt' as const,
      dynamicCameraEnabled: true,
      transposeSemitones: 3,
      customBgUrl: 'blob:secret-local',
    };
    const hash = encodePresetToHash(custom);
    expect(hash.startsWith('#preset=')).toBe(true);
    const decoded = decodePresetFromHash(hash);
    expect(decoded).not.toBeNull();
    expect(decoded?.particleTheme).toBe('sakura');
    expect(decoded?.instrument).toBe('felt');
    expect(decoded?.dynamicCameraEnabled).toBe(true);
    expect(decoded?.transposeSemitones).toBe(3);
    expect(decoded?.customBgUrl).toBeUndefined();
  });

  it('shifts 3D horizon cleanly with dynamic camera vanishXOffset while anchoring keys at hitLineY', () => {
    const baseHit = projectHighwayPoint(0.5, 0, 1920, 900, true, 0.6, 0.08);
    expect(baseHit.x).toBeCloseTo(960, 1);
    const farCenter = projectHighwayPoint(0.5, 1, 1920, 900, true, 0.6, 0.08);
    expect(farCenter.x).toBeGreaterThan(960);
  });

  it('cycles RGB Flow Wave colors continuously with hue phase and note start time', () => {
    const c0 = resolveNoteColor(
      { midi: 60, hand: 'right', velocity: 0.85, trackIndex: 0, start: 0 },
      { colorMode: 'rgb-wave', leftHandColor: '#ff9640', rightHandColor: '#9b6dff', rgbFlowEnabled: true },
      undefined,
      0
    );
    const c1 = resolveNoteColor(
      { midi: 60, hand: 'right', velocity: 0.85, trackIndex: 0, start: 0 },
      { colorMode: 'rgb-wave', leftHandColor: '#ff9640', rightHandColor: '#9b6dff', rgbFlowEnabled: true },
      undefined,
      120
    );
    expect(c0).not.toEqual(c1);
  });
});
