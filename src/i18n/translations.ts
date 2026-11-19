import type { Language } from '../types/visualizer';

export interface Translations {
  openMidi: string;
  selectDemo: string;
  demoHeader: string;
  videoMode: string;
  recordVideo: string;
  controls: string;
  notesUnit: string;
  studioControls: string;
  resetDefaults: string;
  exportPreset: string;
  importPreset: string;
  tabPresets: string;
  tabNotes: string;
  tabFx: string;
  tabStage: string;
  tabPlay: string;
  tabSettings: string;
  playModeAuto: string;
  playModeQwerty: string;
  playModeMagic: string;
  magicHint: string;
  qwertyHint: string;
  usbMidiConnect: string;
  usbMidiDisconnect: string;
  usbMidiNone: string;
  tracksTitle: string;
  dropOverlayTitle: string;
  dropOverlayDesc: string;
  cleanModeBanner: string;
  cleanModeExit: string;
  countdownHint: string;
}

const EN: Translations = {
  openMidi: 'Open MIDI',
  selectDemo: 'Demo Songs',
  demoHeader: 'Built-in Demo MIDI Songs',
  videoMode: 'Video Mode',
  recordVideo: 'Record',
  controls: 'Settings',
  notesUnit: 'notes',
  studioControls: 'Studio Settings',
  resetDefaults: 'Reset defaults',
  exportPreset: 'Export JSON',
  importPreset: 'Import JSON',
  tabPresets: 'Presets',
  tabNotes: 'Notes',
  tabFx: 'Glow/FX',
  tabStage: 'Stage',
  tabPlay: 'Play',
  tabSettings: 'Settings',
  playModeAuto: 'Auto Play',
  playModeQwerty: 'QWERTY Piano',
  playModeMagic: 'Magic Keys',
  magicHint: 'Magic Keys Active — Tap ANY letter/number key to perform the exact next MIDI chord with your own timing!',
  qwertyHint: 'QWERTY Piano Active — Play Z–M & Q–P rows live ([ / ] shifts octave, Shift = sustain)',
  usbMidiConnect: 'Connect USB MIDI Keyboard',
  usbMidiDisconnect: 'Disconnect USB MIDI',
  usbMidiNone: 'No MIDI keyboard detected yet — plug in USB MIDI and reconnect.',
  tracksTitle: 'MIDI Track Manager',
  dropOverlayTitle: 'Drop files anywhere',
  dropOverlayDesc: 'Supports .mid / .midi songs, custom backdrop images, .mp3 / .wav sync audio, or .json presets.',
  cleanModeBanner: 'Clean Video Mode — Press Esc or V to restore UI • Space Play/Pause',
  cleanModeExit: 'Exit',
  countdownHint: 'Starting clean 60fps video capture...',
};

const VI: Translations = {
  openMidi: 'Mở MIDI',
  selectDemo: 'Chọn bài Demo',
  demoHeader: 'Nhạc MIDI Demo Tích Hợp',
  videoMode: 'Video Mode',
  recordVideo: 'Quay Video',
  controls: 'Cài đặt',
  notesUnit: 'nốt',
  studioControls: 'Cài đặt Studio',
  resetDefaults: 'Khôi phục mặc định',
  exportPreset: 'Xuất JSON',
  importPreset: 'Nhập JSON',
  tabPresets: 'Preset',
  tabNotes: 'Nốt/3D',
  tabFx: 'Hiệu ứng',
  tabStage: 'Nền/Vid',
  tabPlay: 'Âm/Chơi',
  tabSettings: 'Cài đặt',
  playModeAuto: 'Tự động phát',
  playModeQwerty: 'Đàn QWERTY',
  playModeMagic: 'Giả bấm',
  magicHint: 'Giả bấm (Magic Keys) — Gõ BẤT KỲ phím chữ/số nào để đánh đúng hợp âm MIDI theo nhịp của bạn!',
  qwertyHint: 'Đàn QWERTY đang bật — Gõ hàng phím Z–M & Q–P ([ / ] đổi quãng tám, Shift = Sustain)',
  usbMidiConnect: 'Kết nối đàn Piano USB (Web MIDI)',
  usbMidiDisconnect: 'Ngắt kết nối MIDI USB',
  usbMidiNone: 'Chưa thấy đàn MIDI nào — hãy cắm cáp USB rồi kết nối lại.',
  tracksTitle: 'Quản lý Track MIDI',
  dropOverlayTitle: 'Thả file vào đây',
  dropOverlayDesc: 'Hỗ trợ file .mid / .midi, ảnh nền (.png / .jpg), nhạc đồng bộ (.mp3 / .wav) hoặc preset .json.',
  cleanModeBanner: 'Clean Video Mode đang bật — Nhấn Esc hoặc V để hiện lại giao diện • Space Phát/Dừng',
  cleanModeExit: 'Thoát',
  countdownHint: 'Chuẩn bị quay video siêu sạch 60fps...',
};

export function getTranslations(lang: Language): Translations {
  return lang === 'vi' ? VI : EN;
}
