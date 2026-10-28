import { S, save } from './settings.js';
import { $, setBanner } from './dom.js';
import { Det } from './onset-detector.js';

// onMessage receives every detector message; main.js wires it up.
export const audio = { ctx:null, stream:null, srcNode:null, detNode:null, sinkGain:null, clickGain:null, fallbackDet:null, onMessage:null };

const WORKLET_URL = new URL('./onset-worklet.js', import.meta.url);
let workletLoaded = false;

export function refractFor(){ const sub = 60/S.bpm/S.grid; return Math.max(0.04, Math.min(0.6*sub, 0.15)); }
export function sendDet(o){ if(audio.detNode && audio.detNode.port) audio.detNode.port.postMessage(o); else if(audio.fallbackDet) audio.fallbackDet.set(o); }

async function setupDetector(){
  const ctx = audio.ctx;
  audio.srcNode = ctx.createMediaStreamSource(audio.stream);
  audio.sinkGain = ctx.createGain(); audio.sinkGain.gain.value = 0; audio.sinkGain.connect(ctx.destination);
  if (ctx.audioWorklet){
    try {
      if (!workletLoaded){ await ctx.audioWorklet.addModule(WORKLET_URL); workletLoaded = true; }
      audio.detNode = new AudioWorkletNode(ctx, 'pocket-onset', {numberOfInputs:1, numberOfOutputs:1, channelCount:1, channelCountMode:'explicit'});
      audio.detNode.port.onmessage = e => audio.onMessage(e.data);
      audio.srcNode.connect(audio.detNode); audio.detNode.connect(audio.sinkGain);
      sendDet({trigDb:S.trigDb, refract:refractFor()});
      return;
    } catch(e){ audio.detNode = null; }
  }
  // Fallback: ScriptProcessor (less precise timing)
  audio.fallbackDet = new Det(ctx.sampleRate);
  const sp = ctx.createScriptProcessor(1024,1,1);
  sp.onaudioprocess = ev => {
    const ch = ev.inputBuffer.getChannelData(0);
    const frame0 = Math.round(ctx.currentTime*ctx.sampleRate) - 2048;
    const o = audio.fallbackDet.run(ch, frame0); for (const m of o) audio.onMessage(m);
  };
  audio.srcNode.connect(sp); sp.connect(audio.sinkGain); audio.detNode = sp;
  sendDet({trigDb:S.trigDb, refract:refractFor()});
  setBanner('Your browser lacks AudioWorklet, so timing uses a slower fallback and may be off by a few milliseconds.', true);
}

// Opens the audio context, output device, mic and detector. Returns false (with a banner) if it can't.
export async function openAudio(){
  try {
    audio.ctx = audio.ctx || new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
    await audio.ctx.resume();
    await applySink();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomedia');
    // Reuse the open mic between Start/Stop so the browser asks only once per visit.
    const live = audio.stream && audio.stream.getAudioTracks().some(t => t.readyState === 'live');
    if (!live) audio.stream = await navigator.mediaDevices.getUserMedia({audio:{
      deviceId: S.device ? {exact:S.device} : undefined,
      echoCancellation:false, noiseSuppression:false, autoGainControl:false }});
  } catch(e){
    setBanner(e && e.message==='nomedia'
      ? 'This browser can’t open the microphone. Try a recent version of Chrome, Edge, Firefox or Safari.'
      : 'The microphone was blocked. Allow mic access for this page in your browser’s address bar, then try again.', true);
    return false;
  }
  if (!audio.clickGain){ audio.clickGain = audio.ctx.createGain(); audio.clickGain.connect(audio.ctx.destination); }
  audio.clickGain.gain.value = S.vol;
  if (!audio.detNode) await setupDetector();
  listDevices();
  return true;
}

export function closeDetector(){
  try { audio.srcNode && audio.srcNode.disconnect(); audio.detNode && audio.detNode.disconnect(); audio.sinkGain && audio.sinkGain.disconnect(); } catch(e) {}
  audio.srcNode = audio.detNode = null; audio.fallbackDet = null;
}

export const canPickOutput = !!(window.AudioContext && 'setSinkId' in AudioContext.prototype);
export async function applySink(){
  if (!canPickOutput || !audio.ctx) return;
  const want = S.sink || '';
  if ((audio.ctx.sinkId || '') === want) return;
  try { await audio.ctx.setSinkId(want); }
  catch(e){ S.sink = ''; save(); $('sink').value = ''; setBanner('That output device isn’t available, so the click is using your default output.', true); }
}

export async function listDevices(){
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const sel = $('device'); sel.innerHTML = '';
    const def = document.createElement('option'); def.value = ''; def.textContent = 'Default microphone'; sel.appendChild(def);
    devs.forEach((d,i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Input ${i+1}`; sel.appendChild(o); });
    sel.value = S.device || '';
    if (canPickOutput){
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== '');
      const so = $('sink'); so.innerHTML = '';
      const d0 = document.createElement('option'); d0.value = ''; d0.textContent = 'Default speakers or headphones'; so.appendChild(d0);
      outs.forEach((d,i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || `Output ${i+1}`; so.appendChild(o); });
      so.value = S.sink || '';
    }
  } catch(e) {}
}
