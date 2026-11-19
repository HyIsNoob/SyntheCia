export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface WebMidiCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onSustainChange: (down: boolean) => void;
  onDevicesChange: (devices: MidiDeviceInfo[]) => void;
}

export class WebMidiController {
  private access: MIDIAccess | null = null;
  private callbacks: WebMidiCallbacks;
  private connected = false;

  constructor(callbacks: WebMidiCallbacks) {
    this.callbacks = callbacks;
  }

  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(): Promise<{ ok: boolean; devices: MidiDeviceInfo[]; error?: string }> {
    if (!WebMidiController.isSupported()) {
      return { ok: false, devices: [], error: 'Web MIDI API is not supported in this browser (use Chrome / Edge).' };
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      this.access = access;
      this.connected = true;
      this.bindInputs();
      access.onstatechange = () => {
        this.bindInputs();
      };
      return { ok: true, devices: this.listDevices() };
    } catch (err) {
      return {
        ok: false,
        devices: [],
        error: err instanceof Error ? err.message : 'MIDI permission denied',
      };
    }
  }

  public disconnect(): void {
    if (this.access) {
      this.access.onstatechange = null;
      this.access.inputs.forEach((input) => {
        input.onmidimessage = null;
      });
      this.access = null;
    }
    this.connected = false;
    this.callbacks.onDevicesChange([]);
  }

  public listDevices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    const list: MidiDeviceInfo[] = [];
    this.access.inputs.forEach((input) => {
      if (input.state === 'connected') {
        list.push({
          id: input.id,
          name: input.name || 'MIDI Piano',
          manufacturer: input.manufacturer || '',
        });
      }
    });
    return list;
  }

  private bindInputs(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (ev: MIDIMessageEvent) => this.handleMessage(ev);
    });
    this.callbacks.onDevicesChange(this.listDevices());
  }

  private handleMessage(ev: MIDIMessageEvent): void {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && d2 > 0) {
      // Note On
      if (d1 >= 21 && d1 <= 108) {
        this.callbacks.onNoteOn(d1, Math.max(0.15, d2 / 127));
      }
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      // Note Off
      if (d1 >= 21 && d1 <= 108) {
        this.callbacks.onNoteOff(d1);
      }
    } else if (status === 0xb0 && d1 === 64) {
      // CC64 Sustain Pedal
      this.callbacks.onSustainChange(d2 >= 64);
    }
  }
}
