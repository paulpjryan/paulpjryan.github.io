import { S, save } from './settings.js';
import { $, setBanner } from './dom.js';
import { OnsetDetector } from './onset-detector.js';
import { ClickTrack } from './click-track.js';

// onMessage receives every detector message and onClickMessage every click track message;
// main.js wires them up.
export const audio = {
  ctx: null,
  stream: null,
  sourceNode: null,
  detectorNode: null,
  detectorPath: null,
  silentOutput: null,
  clickGain: null,
  clickNode: null,
  fallbackDetector: null,
  fallbackClickTrack: null,
  onMessage: null,
  onClickMessage: null,
};

const WORKLET_URL = new URL('./worklet-processors.js', import.meta.url);
let workletLoaded = false;

async function loadWorklet() {
  if (!audio.ctx.audioWorklet) return false;
  if (!workletLoaded) {
    await audio.ctx.audioWorklet.addModule(WORKLET_URL);
    workletLoaded = true;
  }
  return true;
}

// The browser's own estimate of click-out plus mic-in delay, used until the user calibrates.
export function estimateLatency() {
  const track = audio.stream && audio.stream.getAudioTracks()[0];
  const inputLatency = (track && track.getSettings().latency) || 0;
  return (audio.ctx.baseLatency || 0) + (audio.ctx.outputLatency || 0) + inputLatency;
}

export function refractFor() {
  const sub = 60 / S.bpm / S.grid;
  return Math.max(0.04, Math.min(0.6 * sub, 0.15));
}
export function sendDet(o) {
  if (audio.detectorNode && audio.detectorNode.port) audio.detectorNode.port.postMessage(o);
  else if (audio.fallbackDetector) audio.fallbackDetector.set(o);
}
export function updateRefractory() {
  sendDet({ refractorySeconds: refractFor() });
}
export function sendClick(message) {
  if (audio.clickNode && audio.clickNode.port) audio.clickNode.port.postMessage(message);
  else if (audio.fallbackClickTrack) audio.fallbackClickTrack.set(message);
}

async function setupDetector() {
  const ctx = audio.ctx;
  audio.sourceNode = ctx.createMediaStreamSource(audio.stream);
  audio.silentOutput = ctx.createGain();
  audio.silentOutput.gain.value = 0;
  audio.silentOutput.connect(ctx.destination);
  try {
    if (await loadWorklet()) {
      audio.detectorNode = new AudioWorkletNode(ctx, 'pocket-onset', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      audio.detectorNode.port.onmessage = (e) => audio.onMessage(e.data);
      audio.sourceNode.connect(audio.detectorNode);
      audio.detectorNode.connect(audio.silentOutput);
      audio.detectorPath = 'worklet';
      sendDet({ trigDb: S.trigDb, refractorySeconds: refractFor() });
      return;
    }
  } catch (e) {
    audio.detectorNode = null;
  }
  // Fallback: ScriptProcessor (less precise timing)
  audio.fallbackDetector = new OnsetDetector(ctx.sampleRate);
  const sp = ctx.createScriptProcessor(1024, 1, 1);
  sp.onaudioprocess = (ev) => {
    const ch = ev.inputBuffer.getChannelData(0);
    const frame0 = Math.round(ctx.currentTime * ctx.sampleRate) - 2048;
    const o = audio.fallbackDetector.run(ch, frame0);
    for (const m of o) audio.onMessage(m);
  };
  audio.sourceNode.connect(sp);
  sp.connect(audio.silentOutput);
  audio.detectorNode = sp;
  audio.detectorPath = 'fallback';
  sendDet({ trigDb: S.trigDb, refractorySeconds: refractFor() });
  setBanner(
    'Your browser lacks AudioWorklet, so timing uses a slower fallback and may be off by a few milliseconds.',
    true,
  );
}

async function setupClickTrack() {
  const ctx = audio.ctx;
  try {
    if (await loadWorklet()) {
      audio.clickNode = new AudioWorkletNode(ctx, 'pocket-click', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      audio.clickNode.port.onmessage = (e) => audio.onClickMessage(e.data);
      audio.clickNode.connect(audio.clickGain);
      return;
    }
  } catch (e) {
    audio.clickNode = null;
  }
  // Fallback: ScriptProcessor (less precise timing)
  audio.fallbackClickTrack = new ClickTrack(ctx.sampleRate);
  const sp = ctx.createScriptProcessor(1024, 1, 1);
  sp.onaudioprocess = (ev) => {
    const frame0 = Math.round(ev.playbackTime * ctx.sampleRate);
    const o = audio.fallbackClickTrack.run(ev.outputBuffer.getChannelData(0), frame0);
    for (const m of o) audio.onClickMessage(m);
  };
  sp.connect(audio.clickGain);
  audio.clickNode = sp;
}

// Opens the audio context, output device, mic and detector. Returns false (with a banner) if it can't.
export async function openAudio() {
  try {
    audio.ctx =
      audio.ctx ||
      new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await audio.ctx.resume();
    await applySink();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomedia');
    // Reuse the open mic between Start/Stop so the browser asks only once per visit.
    const live = audio.stream && audio.stream.getAudioTracks().some((t) => t.readyState === 'live');
    if (!live)
      audio.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: S.device ? { exact: S.device } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
  } catch (e) {
    setBanner(
      e && e.message === 'nomedia'
        ? 'This browser can’t open the microphone. Try a recent version of Chrome, Edge, Firefox or Safari.'
        : 'The microphone was blocked. Allow mic access for this page in your browser’s address bar, then try again.',
      true,
    );
    return false;
  }
  if (!audio.clickGain) {
    audio.clickGain = audio.ctx.createGain();
    audio.clickGain.connect(audio.ctx.destination);
  }
  audio.clickGain.gain.value = S.vol;
  if (!audio.clickNode) await setupClickTrack();
  if (!audio.detectorNode) await setupDetector();
  listDevices();
  return true;
}

export function closeDetector() {
  try {
    audio.sourceNode && audio.sourceNode.disconnect();
    audio.detectorNode && audio.detectorNode.disconnect();
    audio.silentOutput && audio.silentOutput.disconnect();
  } catch (e) {}
  audio.sourceNode = audio.detectorNode = null;
  audio.fallbackDetector = null;
}

export const canPickOutput = !!(window.AudioContext && 'setSinkId' in AudioContext.prototype);
export async function applySink() {
  if (!canPickOutput || !audio.ctx) return;
  const want = S.sink || '';
  if ((audio.ctx.sinkId || '') === want) return;
  try {
    await audio.ctx.setSinkId(want);
  } catch (e) {
    S.sink = '';
    save();
    $('sink').value = '';
    setBanner(
      'That output device isn’t available, so the click is using your default output.',
      true,
    );
  }
}

export async function listDevices() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput',
    );
    const sel = $('device');
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default microphone';
    sel.appendChild(def);
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Input ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = S.device || '';
    if (canPickOutput) {
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== '',
      );
      const so = $('sink');
      so.innerHTML = '';
      const d0 = document.createElement('option');
      d0.value = '';
      d0.textContent = 'Default speakers or headphones';
      so.appendChild(d0);
      outs.forEach((d, i) => {
        const o = document.createElement('option');
        o.value = d.deviceId;
        o.textContent = d.label || `Output ${i + 1}`;
        so.appendChild(o);
      });
      so.value = S.sink || '';
    }
  } catch (e) {}
}
