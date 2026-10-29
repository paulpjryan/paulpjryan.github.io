import { S } from './settings.js';
import { $, setBanner } from './dom.js';
import { session } from './session.js';
import { audio, openAudio, closeDetector, sendClick, estimateLatency } from './audio-engine.js';
import { renderCal } from './calibration.js';
import { render } from './readouts.js';

let wakeLock = null;

function clickSettings() {
  return { bpm: S.bpm, countIn: S.countIn, pattern: S.pattern, accent: S.accent };
}

export function syncClickSettings() {
  sendClick({ type: 'settings', settings: clickSettings() });
}

// The click track announces each beat one beat ahead; a message from an earlier take is ignored.
export function onBeatAnnounced(m) {
  if (!session.isRunning || m.type !== 'beat' || m.takeId !== session.takeId) return;
  session.beatTimes[m.beatNumber] = m.time;
  session.beatLightQueue.push({ time: m.time, beatIndex: m.beatIndex, isAudible: m.isAudible });
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
  const firstBeatTime = audio.ctx.currentTime + 0.25;
  session.analyzeFrom = firstBeatTime + 4 * S.countIn * bd - bd / (2 * S.grid);
  session.beatTimes = [];
  session.beatLightQueue = [];
  session.takeId++;
  session.isRunning = true;
  sendClick({
    type: 'start',
    takeId: session.takeId,
    startFrame: firstBeatTime * audio.ctx.sampleRate,
    settings: clickSettings(),
  });
  $('start').textContent = 'Stop';
  $('start').dataset.on = 'true';
  try {
    if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
  render();
}

export function stop() {
  session.isRunning = false;
  sendClick({ type: 'stop' });
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
