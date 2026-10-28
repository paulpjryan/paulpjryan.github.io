import { OnsetDetector } from './onset-detector.js';

class PocketOnset extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new OnsetDetector(sampleRate);
    this.port.onmessage = (e) => this.detector.set(e.data);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const o = this.detector.run(ch, currentFrame);
      for (let k = 0; k < o.length; k++) this.port.postMessage(o[k]);
    }
    return true;
  }
}
registerProcessor('pocket-onset', PocketOnset);
