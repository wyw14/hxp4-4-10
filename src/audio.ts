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
  private currentMasterGain: number = 0;
  private targetMasterGain: number = 0;

  private signalFrequency: number = 0;
  private targetSignalFrequency: number = 0;

  private isInitialized: boolean = false;
  private isEnabled: boolean = false;
  private fadeInProgress: boolean = false;
  private fadeStartTime: number = 0;
  private fadeDuration: number = 0.5;

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

  setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled && !this.fadeInProgress) return;
    
    this.isEnabled = enabled;
    this.fadeInProgress = true;
    this.fadeStartTime = this.audioContext?.currentTime || 0;

    if (this.masterGainNode && this.audioContext) {
      const targetGain = enabled ? this.masterVolume : 0;
      this.masterGainNode.gain.cancelScheduledValues(this.fadeStartTime);
      this.masterGainNode.gain.setValueAtTime(this.currentMasterGain, this.fadeStartTime);
      this.masterGainNode.gain.linearRampToValueAtTime(targetGain, this.fadeStartTime + this.fadeDuration);
      this.targetMasterGain = targetGain;
    }
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
      this.targetMasterGain = this.masterVolume;
      this.masterGainNode.gain.setTargetAtTime(this.masterVolume, this.audioContext.currentTime, 0.05);
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

    if (this.fadeInProgress && currentTime >= this.fadeStartTime + this.fadeDuration) {
      this.fadeInProgress = false;
      this.currentMasterGain = this.targetMasterGain;
    }

    if (!this.fadeInProgress) {
      this.currentMasterGain += (this.targetMasterGain - this.currentMasterGain) * 0.1;
    } else {
      const fadeProgress = Math.min(1, (currentTime - this.fadeStartTime) / this.fadeDuration);
      this.currentMasterGain = this.isEnabled ? 
        this.targetMasterGain * fadeProgress : 
        this.masterVolume * (1 - fadeProgress);
    }

    this.currentNoiseVolume += (this.targetNoiseGain - this.currentNoiseVolume) * 0.05;
    this.noiseGainNode.gain.setTargetAtTime(this.currentNoiseVolume, currentTime, 0.02);

    this.currentSignalVolume += (this.targetSignalGain - this.currentSignalVolume) * 0.05;

    const driftMax = 30 * this.freqDriftAmount;
    const time = performance.now() * 0.008;
    const wobble = Math.sin(time) * driftMax + Math.sin(time * 2.3) * driftMax * 0.3;
    this.signalFrequency += (this.targetSignalFrequency + wobble - this.signalFrequency) * 0.1;
    
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
