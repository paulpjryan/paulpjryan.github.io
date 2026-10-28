import { S } from './settings.js';
import { $, setBanner } from './dom.js';
import { session } from './session.js';
import {
  audio,
  openAudio,
  closeDetector,
  sendDet,
  refractFor,
  estimateLatency,
} from './audio-engine.js';
import { renderCal } from './calibration.js';
import { render } from './readouts.js';

let schedTimer = null,
  nextBeatTime = 0,
  beatNum = 0,
  wakeLock = null;

function click(t, kind) {
  const o = audio.ctx.createOscillator(),
    g = audio.ctx.createGain();
  const f = kind === 'accent' ? 1760 : kind === 'back' ? 1180 : 980;
  o.type = 'triangle';
  o.frequency.value = f;
  const peak = kind === 'accent' ? 1 : 0.8;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.0003); // near-instant attack so the click's onset is exactly t, like the calibration click
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'back' ? 0.07 : 0.045));
  o.connect(g);
  g.connect(audio.clickGain);
  o.start(t);
  o.stop(t + 0.09);
}

function schedule() {
  const bd = 60 / S.bpm;
  while (nextBeatTime < audio.ctx.currentTime + 0.12) {
    const pos = beatNum % 4;
    const inCount = beatNum < 4 * S.countIn;
    let play, kind;
    if (inCount) {
      play = true;
      kind = pos === 0 ? 'accent' : 'normal';
    } else if (S.pattern === 'all') {
      play = true;
      kind = pos === 0 && S.accent ? 'accent' : 'normal';
    } else {
      play = pos === 1 || pos === 3;
      kind = 'back';
    }
    if (play) click(nextBeatTime, kind);
    session.beatLightQueue.push({ time: nextBeatTime, beatIndex: pos, isAudible: play });
    nextBeatTime += bd;
    beatNum++;
  }
}

export async function start() {
  if (session.calibrationRun) return;
  if (!(await openAudio())) return;
  session.estimatedLatency = estimateLatency(); // snapshot: Chrome revises its estimates while running
  renderCal();
  // Each Start begins a fresh take; data from the last take stays visible after Stop for review.
  session.hits = [];
  session.isExample = false;
  setBanner(null);
  const bd = 60 / S.bpm;
  nextBeatTime = audio.ctx.currentTime + 0.25;
  beatNum = 0;
  session.anchorTime = nextBeatTime;
  session.anchorBeat = 0;
  session.analyzeFrom = nextBeatTime + 4 * S.countIn * bd - bd / (2 * S.grid);
  session.beatLightQueue = [];
  session.isRunning = true;
  schedule();
  schedTimer = setInterval(schedule, 25);
  $('start').textContent = 'Stop';
  $('start').dataset.on = 'true';
  try {
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
  render();
}

export function stop() {
  session.isRunning = false;
  clearInterval(schedTimer);
  closeDetector();
  $('start').textContent = 'Start';
  $('start').dataset.on = 'false';
  render();
  document.querySelectorAll('.light').forEach((l) => l.classList.remove('on', 'silent'));
  try {
    wakeLock && wakeLock.release();
  } catch (e) {}
  wakeLock = null;
}

export function reanchor() {
  if (!session.isRunning) return;
  session.anchorTime = nextBeatTime;
  session.anchorBeat = beatNum;
  sendDet({ refractorySeconds: refractFor() });
}
