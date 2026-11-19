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
  tabBg: string;
  tabAudio: string;
  tabPlay: string;
  tabVideo: string;
  playModeAuto: string;
  playModeQwerty: string;
  playModeMagic: string;
  magicHint: string;
  qwertyHint: string;
  abLoopSetA: string;
  abLoopSetB: string;
  abLoopClear: string;
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

const VI: Translations = {
  openMidi: 'Mở MIDI',
  selectDemo: 'Chọn bài Demo',
  demoHeader: 'Nhạc MIDI Demo Tích Hợp',
  videoMode: 'Video Mode',
  recordVideo: 'Quay Video',
  controls: 'Tùy chỉnh',
  notesUnit: 'nốt',
  studioControls: 'Studio Controls',
  resetDefaults: 'Khôi phục mặc định',
  exportPreset: 'Xuất Preset',
  importPreset: 'Nhập Preset',
  tabPresets: 'Preset',
  tabNotes: 'Nốt/3D',
  tabFx: 'Glow/Hạt',
  tabBg: 'Nền',
  tabAudio: 'Âm/Track',
  tabPlay: 'Chơi đàn',
  tabVideo: 'Video',
  playModeAuto: 'Tự động phát',
  playModeQwerty: 'Phím QWERTY',
  playModeMagic: 'Giả bấm (Magic)',
  magicHint: 'Magic Keys đang bật — Gõ bất kỳ phím chữ/số nào trên bàn phím để tự đánh đúng hợp âm MIDI theo nhịp của bạn!',
  qwertyHint: 'Chế độ Đàn QWERTY đang bật — Gõ hàng phím Z–M & Q–P để chơi đàn trực tiếp ([ / ] đổi quãng tám)',
  abLoopSetA: 'Đặt A',
  abLoopSetB: 'Đặt B',
  abLoopClear: 'Xóa A-B',
  usbMidiConnect: 'Kết nối đàn Piano USB (Web MIDI)',
  usbMidiDisconnect: 'Ngắt kết nối MIDI USB',
  usbMidiNone: 'Chưa thấy đàn MIDI nào — hãy cắm cáp USB rồi bấm làm mới.',
  tracksTitle: 'Quản lý Track MIDI',
  dropOverlayTitle: 'Thả file vào đây',
  dropOverlayDesc: 'Hỗ trợ file .mid / .midi, ảnh nền (.png / .jpg), nhạc đồng bộ (.mp3 / .wav) hoặc preset .json.',
  cleanModeBanner: 'Clean Video Mode đang bật — Nhấn Esc hoặc V để hiện lại giao diện • Space Phát/Dừng',
  cleanModeExit: 'Thoát',
  countdownHint: 'Chuẩn bị quay video siêu sạch 60fps...',
};

const EN: Translations = {
  openMidi: 'Open MIDI',
  selectDemo: 'Demo Songs',
  demoHeader: 'Built-in Demo MIDI Songs',
  videoMode: 'Video Mode',
  recordVideo: 'Record',
  controls: 'Customize',
  notesUnit: 'notes',
  studioControls: 'Studio Controls',
  resetDefaults: 'Reset defaults',
  exportPreset: 'Export JSON',
  importPreset: 'Import JSON',
  tabPresets: 'Presets',
  tabNotes: 'Notes/3D',
  tabFx: 'Glow/FX',
  tabBg: 'Backdrop',
  tabAudio: 'Audio/Tracks',
  tabPlay: 'Play',
  tabVideo: 'Video',
  playModeAuto: 'Auto Play',
  playModeQwerty: 'QWERTY Piano',
  playModeMagic: 'Magic Keys',
  magicHint: 'Magic Keys Active — Tap ANY letter/number key to perform the exact next MIDI chord with your own timing!',
  qwertyHint: 'QWERTY Piano Active — Play Z–M & Q–P rows live with full HDR particles ([ / ] shifts octave)',
  abLoopSetA: 'Set A',
  abLoopSetB: 'Set B',
  abLoopClear: 'Clear A-B',
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

export function getTranslations(lang: Language): Translations {
  return lang === 'en' ? EN : VI;
}
