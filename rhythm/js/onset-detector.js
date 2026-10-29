const HIGHPASS_CUTOFF_HZ = 230;

// Onset detector, shared by the AudioWorklet and the ScriptProcessor fallback.
export class OnsetDetector {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.highpassCoefficient = Math.exp((-2 * Math.PI * HIGHPASS_CUTOFF_HZ) / sampleRate);
    this.highpassed = 0;
    this.previousSample = 0;
    this.fastEnergy = 0;
    this.slowEnergy = 0;
    this.fastCoefficient = Math.exp(-1 / (0.0015 * sampleRate));
    this.slowCoefficient = Math.exp(-1 / (0.12 * sampleRate));
    this.framesSinceOnset = 1e9;
    this.refractoryFrames = Math.round(sampleRate * 0.08);
    this.triggerEnergy = Math.pow(10, -42 / 10);
    this.onsetRatio = 4;
    this.onsetFrame = 0;
    this.rmsFramesLeft = 0;
    this.rmsSumOfSquares = 0;
    this.rmsFrameCount = 0;
    this.rmsWindowFrames = Math.round(0.06 * sampleRate);
    this.peakEnergy = 0;
    this.levelFrameCount = 0;
    this.levelReportFrames = Math.round(0.05 * sampleRate);
    this.historyLength = Math.round(0.03 * sampleRate);
    this.energyHistory = new Float32Array(this.historyLength);
    this.sortedHistory = new Float32Array(this.historyLength);
    this.historyIndex = 0;
    this.messages = [];
    // note length: full-band 3 ms envelope (its own fade time is subtracted); a strum ends 20 dB below its own peak, or when the next strum starts
    this.noteEnvelope = 0;
    this.envelopeCoefficient = Math.exp(-1 / (0.003 * sampleRate));
    this.envelopeLagFrames = Math.round(0.003 * sampleRate * Math.log(100));
    this.isTrackingNote = false;
    this.noteStartFrame = 0;
    this.notePeak = 0;
    this.notePeakWindowFrames = Math.round(0.05 * sampleRate);
    this.maxNoteFrames = Math.round(2 * sampleRate);
    this.noteEndRatio = 0.01;
  }
  set(o) {
    if (o.trigDb != null) this.triggerEnergy = Math.pow(10, o.trigDb / 10);
    if (o.refractorySeconds != null)
      this.refractoryFrames = Math.round(this.sampleRate * o.refractorySeconds);
  }
  run(ch, frame0) {
    const out = this.messages;
    out.length = 0;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      this.highpassed = this.highpassCoefficient * (this.highpassed + x - this.previousSample);
      this.previousSample = x;
      const e = this.highpassed * this.highpassed;
      this.fastEnergy = this.fastCoefficient * this.fastEnergy + (1 - this.fastCoefficient) * e;
      const prevSlow = this.slowEnergy;
      this.slowEnergy = this.slowCoefficient * this.slowEnergy + (1 - this.slowCoefficient) * e;
      this.noteEnvelope =
        this.envelopeCoefficient * this.noteEnvelope + (1 - this.envelopeCoefficient) * x * x;
      const f = frame0 + i;
      if (this.isTrackingNote) {
        const age = f - this.noteStartFrame;
        if (age < this.notePeakWindowFrames) {
          if (this.noteEnvelope > this.notePeak) this.notePeak = this.noteEnvelope;
        } else if (
          this.noteEnvelope <
            Math.max(this.notePeak * this.noteEndRatio, this.triggerEnergy * 0.25) ||
          age > this.maxNoteFrames
        ) {
          out.push({
            type: 'end',
            frame: this.noteStartFrame,
            endFrame: Math.max(this.noteStartFrame + 1, f - this.envelopeLagFrames),
            rangIntoNext: false,
          });
          this.isTrackingNote = false;
        }
      }
      if (this.rmsFramesLeft > 0) {
        this.rmsSumOfSquares += x * x;
        this.rmsFrameCount++;
        this.rmsFramesLeft--;
        if (this.rmsFramesLeft === 0)
          out.push({
            type: 'hit',
            frame: this.onsetFrame,
            rms: Math.sqrt(this.rmsSumOfSquares / this.rmsFrameCount),
          });
      }
      this.framesSinceOnset++;
      this.energyHistory[this.historyIndex] = this.fastEnergy;
      this.historyIndex = (this.historyIndex + 1) % this.historyLength;
      if (
        this.framesSinceOnset > this.refractoryFrames &&
        this.fastEnergy > this.triggerEnergy &&
        this.fastEnergy > prevSlow * this.onsetRatio
      ) {
        // backtrack: walk back through the unbroken rise above 4x the last 30 ms's median level.
        // Measuring from the median, not the quietest instant, keeps a stray noise flicker
        // before the attack from being taken as the onset.
        const L = this.historyLength;
        this.sortedHistory.set(this.energyHistory);
        this.sortedHistory.sort();
        const riseThreshold = this.sortedHistory[L >> 1] * 4;
        let on = L - 1;
        while (on > 0 && this.energyHistory[(this.historyIndex + on - 1) % L] > riseThreshold) on--;
        if (on === 0) on = L - 1;
        const nf = frame0 + i - (L - 1 - on);
        if (this.rmsFramesLeft > 0 && this.rmsFrameCount > 0)
          out.push({
            type: 'hit',
            frame: this.onsetFrame,
            rms: Math.sqrt(this.rmsSumOfSquares / this.rmsFrameCount),
          });
        if (this.isTrackingNote)
          out.push({ type: 'end', frame: this.noteStartFrame, endFrame: nf, rangIntoNext: true });
        this.framesSinceOnset = 0;
        this.onsetFrame = nf;
        this.rmsFramesLeft = this.rmsWindowFrames;
        this.rmsSumOfSquares = 0;
        this.rmsFrameCount = 0;
        this.isTrackingNote = true;
        this.noteStartFrame = nf;
        this.notePeak = this.noteEnvelope;
      }
      if (this.fastEnergy > this.peakEnergy) this.peakEnergy = this.fastEnergy;
      if (++this.levelFrameCount >= this.levelReportFrames) {
        out.push({ type: 'level', peakEnergy: this.peakEnergy });
        this.peakEnergy = 0;
        this.levelFrameCount = 0;
      }
    }
    return out;
  }
}
