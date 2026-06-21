export class AudioManager {
  private audioContext: AudioContext | null = null;
  private whiteNoiseSource: AudioBufferSourceNode | null = null;
  private noiseGainNode: GainNode | null = null;
  private signalOscillator: OscillatorNode | null = null;
  private signalGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  private noiseVolume: number = 0.5;
  private signalVolume: number = 0.5;
  private masterVolume: number = 0.7;
  private freqDriftAmount: number = 0.3;

  private currentNoiseVolume: number = 0;
  private currentSignalVolume: number = 0;
  private targetNoiseGain: number = 0;
  private targetSignalGain: number = 0;

  private signalFrequency: number = 0;
  private targetSignalFrequency: number = 0;

  private isInitialized: boolean = false;
  private isEnabled: boolean = false;

  private readonly fadeDuration: number = 0.5;
  private fadeStartGain: number = 0;
  private fadeTargetGain: number = 0;
  private fadeStartTime: number = 0;
  private fadeEndTime: number = 0;
  private fadeActive: boolean = false;

  constructor() {}

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = 0;
      this.masterGainNode.connect(this.audioContext.destination);

      const bufferSize = 2 * this.audioContext.sampleRate;
      const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.whiteNoiseSource = this.audioContext.createBufferSource();
      this.whiteNoiseSource.buffer = noiseBuffer;
      this.whiteNoiseSource.loop = true;

      this.noiseGainNode = this.audioContext.createGain();
      this.noiseGainNode.gain.value = 0;

      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;

      const filter2 = this.audioContext.createBiquadFilter();
      filter2.type = 'bandpass';
      filter2.frequency.value = 3500;
      filter2.Q.value = 0.5;

      this.whiteNoiseSource.connect(filter);
      filter.connect(filter2);
      filter2.connect(this.noiseGainNode);
      this.noiseGainNode.connect(this.masterGainNode);

      this.signalOscillator = this.audioContext.createOscillator();
      this.signalOscillator.type = 'sine';

      this.signalGainNode = this.audioContext.createGain();
      this.signalGainNode.gain.value = 0;

      this.signalOscillator.connect(this.signalGainNode);
      this.signalGainNode.connect(this.masterGainNode);

      this.whiteNoiseSource.start();
      this.signalOscillator.start();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Audio init failed:', e);
    }
  }

  private getCurrentMasterGain(): number {
    if (!this.fadeActive || !this.audioContext) {
      return this.fadeTargetGain;
    }
    const now = this.audioContext.currentTime;
    if (now >= this.fadeEndTime) {
      return this.fadeTargetGain;
    }
    const t = (now - this.fadeStartTime) / (this.fadeEndTime - this.fadeStartTime);
    const clampedT = Math.max(0, Math.min(1, t));
    return this.fadeStartGain + (this.fadeTargetGain - this.fadeStartGain) * clampedT;
  }

  setEnabled(enabled: boolean): void {
    if (!this.masterGainNode || !this.audioContext) return;

    const now = this.audioContext.currentTime;
    const currentGain = this.getCurrentMasterGain();
    const targetGain = enabled ? this.masterVolume : 0;

    if (Math.abs(currentGain - targetGain) < 0.0001) {
      this.isEnabled = enabled;
      this.fadeActive = false;
      this.fadeTargetGain = targetGain;
      return;
    }

    this.masterGainNode.gain.cancelScheduledValues(now);
    this.masterGainNode.gain.setValueAtTime(currentGain, now);

    const remainingFade = this.fadeActive ?
      Math.max(0.08, this.fadeDuration * (1 - (now - this.fadeStartTime) / (this.fadeEndTime - this.fadeStartTime))) :
      this.fadeDuration;

    this.fadeStartGain = currentGain;
    this.fadeTargetGain = targetGain;
    this.fadeStartTime = now;
    this.fadeEndTime = now + remainingFade;
    this.fadeActive = true;
    this.isEnabled = enabled;

    this.masterGainNode.gain.linearRampToValueAtTime(targetGain, this.fadeEndTime);
  }

  toggle(): boolean {
    this.setEnabled(!this.isEnabled);
    return this.isEnabled;
  }

  setNoiseVolume(volume: number): void {
    this.noiseVolume = Math.max(0, Math.min(1, volume));
  }

  setSignalVolume(volume: number): void {
    this.signalVolume = Math.max(0, Math.min(1, volume));
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.isEnabled && this.masterGainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      const currentGain = this.getCurrentMasterGain();
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(currentGain, now);
      this.masterGainNode.gain.setTargetAtTime(this.masterVolume, now, 0.05);
      this.fadeStartGain = currentGain;
      this.fadeTargetGain = this.masterVolume;
      this.fadeStartTime = now;
      this.fadeEndTime = now + 0.2;
      this.fadeActive = true;
    }
  }

  setFreqDrift(amount: number): void {
    this.freqDriftAmount = Math.max(0, Math.min(1, amount));
  }

  getNoiseVolume(): number {
    return this.noiseVolume;
  }

  getSignalVolume(): number {
    return this.signalVolume;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getFreqDrift(): number {
    return this.freqDriftAmount;
  }

  getEnabled(): boolean {
    return this.isEnabled;
  }

  setNoiseIntensity(signalStrength: number): void {
    if (!this.isEnabled) {
      this.targetNoiseGain = 0;
      return;
    }
    const baseNoise = 0.12 * this.noiseVolume;
    const noiseReduction = signalStrength * 0.09 * this.noiseVolume;
    this.targetNoiseGain = Math.max(0.01 * this.noiseVolume, baseNoise - noiseReduction);
  }

  setSignalTone(frequency: number, strength: number): void {
    this.targetSignalFrequency = frequency;

    if (this.signalGainNode && this.audioContext) {
      const baseGain = strength > 0.6 ? strength * 0.06 : 0;
      this.targetSignalGain = baseGain * this.signalVolume;
      this.signalGainNode.gain.setTargetAtTime(this.targetSignalGain, this.audioContext.currentTime, 0.08);
    }
  }

  update(): void {
    if (!this.noiseGainNode || !this.signalGainNode || !this.masterGainNode || !this.audioContext || !this.isInitialized) return;

    const currentTime = this.audioContext.currentTime;

    if (this.fadeActive && currentTime >= this.fadeEndTime) {
      this.fadeActive = false;
    }

    this.currentNoiseVolume += (this.targetNoiseGain - this.currentNoiseVolume) * 0.05;
    this.noiseGainNode.gain.setTargetAtTime(this.currentNoiseVolume, currentTime, 0.02);

    this.currentSignalVolume += (this.targetSignalGain - this.currentSignalVolume) * 0.05;

    const driftMax = 30 * this.freqDriftAmount;
    let wobble = 0;
    if (this.freqDriftAmount > 0.001) {
      const time = performance.now() * 0.008;
      wobble = Math.sin(time) * driftMax + Math.sin(time * 2.3) * driftMax * 0.3;
    }

    const freqSmooth = this.freqDriftAmount < 0.001 ? 0.3 : 0.1;
    this.signalFrequency += (this.targetSignalFrequency + wobble - this.signalFrequency) * freqSmooth;

    if (this.signalOscillator) {
      this.signalOscillator.frequency.setValueAtTime(this.signalFrequency, currentTime);
    }
  }

  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  destroy(): void {
    if (this.whiteNoiseSource) {
      try { this.whiteNoiseSource.stop(); } catch {}
    }
    if (this.signalOscillator) {
      try { this.signalOscillator.stop(); } catch {}
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
