import { OnsetDetector } from './onset-detector.js';
import { ClickTrack } from './click-track.js';

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

class PocketClick extends AudioWorkletProcessor {
  constructor() {
    super();
    this.clickTrack = new ClickTrack(sampleRate);
    this.port.onmessage = (e) => this.clickTrack.set(e.data);
  }
  process(inputs, outputs) {
    const o = this.clickTrack.run(outputs[0][0], currentFrame);
    for (let k = 0; k < o.length; k++) this.port.postMessage(o[k]);
    return true;
  }
}
registerProcessor('pocket-click', PocketClick);
