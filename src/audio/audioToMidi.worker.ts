import { transcribeMonoPcmToMidi, type TranscriptionSensitivity } from './AudioToMidi';

interface WorkerRequest {
  samples: Float32Array;
  sampleRate: number;
  songName: string;
  sensitivity: TranscriptionSensitivity;
  filterDrums: boolean;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { samples, sampleRate, songName, sensitivity, filterDrums } = ev.data;
  try {
    const result = await transcribeMonoPcmToMidi(samples, sampleRate, songName, {
      sensitivity,
      filterDrums,
      onProgress: (pct) => {
        self.postMessage({ type: 'progress', pct });
      },
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Transcription failed',
    });
  }
};
