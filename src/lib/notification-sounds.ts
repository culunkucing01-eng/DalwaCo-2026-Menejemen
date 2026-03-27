/**
 * Notification Sound System using Web Audio API
 * Each notification type has a unique, clear & assertive tone pattern
 * No external files needed — generated programmatically
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

const getAudioCtx = (): AudioContext => {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const setSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
  localStorage.setItem('dalwa_sound_enabled', JSON.stringify(enabled));
};

export const isSoundEnabled = (): boolean => {
  const stored = localStorage.getItem('dalwa_sound_enabled');
  if (stored !== null) {
    soundEnabled = JSON.parse(stored);
  }
  return soundEnabled;
};

type OscType = OscillatorType;

interface ToneNote {
  freq: number;
  duration: number;
  delay: number;
  type?: OscType;
  gain?: number;
}

const playTones = (notes: ToneNote[]) => {
  if (!isSoundEnabled()) return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    notes.forEach(({ freq, duration, delay, type = 'sine', gain: vol = 0.3 }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      gainNode.gain.setValueAtTime(vol, now + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    });
  } catch (e) {
    console.warn('Audio notification failed:', e);
  }
};

/** Permintaan Stok Baru — 3-note ascending chime, urgent */
export const playStockRequestSound = () => {
  playTones([
    { freq: 587, duration: 0.15, delay: 0, type: 'triangle', gain: 0.4 },
    { freq: 740, duration: 0.15, delay: 0.12, type: 'triangle', gain: 0.4 },
    { freq: 988, duration: 0.25, delay: 0.24, type: 'triangle', gain: 0.5 },
  ]);
};

/** Chat Masuk — soft double-tap notification */
export const playChatSound = () => {
  playTones([
    { freq: 880, duration: 0.1, delay: 0, type: 'sine', gain: 0.25 },
    { freq: 1100, duration: 0.12, delay: 0.1, type: 'sine', gain: 0.3 },
  ]);
};

/** Piutang Jatuh Tempo — low warning pulse, 2 descending tones */
export const playPiutangAlertSound = () => {
  playTones([
    { freq: 440, duration: 0.3, delay: 0, type: 'square', gain: 0.2 },
    { freq: 330, duration: 0.4, delay: 0.25, type: 'square', gain: 0.25 },
  ]);
};

/** Barang Masuk / Pengiriman — bright ascending 2-note ding */
export const playShipmentSound = () => {
  playTones([
    { freq: 660, duration: 0.15, delay: 0, type: 'sine', gain: 0.35 },
    { freq: 990, duration: 0.2, delay: 0.13, type: 'sine', gain: 0.4 },
  ]);
};

/** Transaksi Berhasil — cheerful 3-note success jingle */
export const playTransactionSuccessSound = () => {
  playTones([
    { freq: 523, duration: 0.12, delay: 0, type: 'triangle', gain: 0.3 },
    { freq: 659, duration: 0.12, delay: 0.1, type: 'triangle', gain: 0.3 },
    { freq: 784, duration: 0.2, delay: 0.2, type: 'triangle', gain: 0.35 },
  ]);
};

/** Response/Update pada Request Stok — single bright ping */
export const playRequestResponseSound = () => {
  playTones([
    { freq: 1047, duration: 0.18, delay: 0, type: 'sine', gain: 0.35 },
  ]);
};

/** Generic notification — simple ding */
export const playGenericNotificationSound = () => {
  playTones([
    { freq: 800, duration: 0.15, delay: 0, type: 'sine', gain: 0.3 },
    { freq: 1000, duration: 0.15, delay: 0.12, type: 'sine', gain: 0.35 },
  ]);
};
