import { Det } from './onset-detector.js';

class PocketOnset extends AudioWorkletProcessor{
  constructor(){ super(); this.d=new Det(sampleRate); this.port.onmessage=e=>this.d.set(e.data); }
  process(inputs){
    const ch=inputs[0]&&inputs[0][0];
    if(ch){ const o=this.d.run(ch,currentFrame); for(let k=0;k<o.length;k++) this.port.postMessage(o[k]); }
    return true;
  }
}
registerProcessor('pocket-onset',PocketOnset);
