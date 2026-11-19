export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationSec: number;
}

const MIME_CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export function pickSupportedMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mime: 'video/webm', ext: 'webm' };
  }
  for (const c of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c.mime)) {
      return c;
    }
  }
  return { mime: '', ext: 'webm' };
}

export class VideoExporter {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private ext = 'webm';
  private mime = 'video/webm';
  private active = false;

  public isRecording(): boolean {
    return this.active;
  }

  public start(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    bitrateMbps = 16,
    onFinished?: (result: RecordingResult) => void
  ): void {
    if (this.active) return;

    const videoStream = canvas.captureStream(60);
    const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
    if (audioStream) {
      tracks.push(...audioStream.getAudioTracks());
    }
    const combined = new MediaStream(tracks);

    const chosen = pickSupportedMimeType();
    this.mime = chosen.mime || 'video/webm';
    this.ext = chosen.ext;

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: Math.max(4, Math.min(32, bitrateMbps)) * 1_000_000,
      audioBitsPerSecond: 256_000,
    };
    if (chosen.mime) {
      options.mimeType = chosen.mime;
    }

    const recorder = new MediaRecorder(combined, options);
    this.chunks = [];
    this.startedAt = performance.now();
    this.active = true;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };

    recorder.onstop = () => {
      this.active = false;
      const durationSec = (performance.now() - this.startedAt) / 1000;
      const blob = new Blob(this.chunks, { type: this.mime });
      this.chunks = [];
      videoStream.getTracks().forEach((t) => t.stop());
      onFinished?.({
        blob,
        mimeType: this.mime,
        extension: this.ext,
        durationSec,
      });
    };

    recorder.start(250);
    this.recorder = recorder;
  }

  public stop(): void {
    if (!this.active || !this.recorder) return;
    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }
}

export function downloadRecording(result: RecordingResult, songName: string): void {
  const safeName = songName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'piano-visual';
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const filename = `synthecia-${safeName}-${stamp}.${result.extension}`;

  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
