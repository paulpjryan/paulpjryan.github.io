import { S } from './settings.js';
import { session } from './session.js';
import { audio } from './audio-engine.js';
import { calValid } from './calibration.js';
import { requestRender } from './readouts.js';

export function onDet(m) {
  const calRun = session.calibrationRun;
  if (m.type === 'level') {
    session.inputLevel = Math.max(session.inputLevel * 0.6 ** 2, m.peakEnergy);
    if (calRun && calRun.phase === 'noise')
      calRun.peakEnergy = Math.max(calRun.peakEnergy, m.peakEnergy || 0);
    return;
  }
  if (calRun) {
    if (m.type === 'hit' && calRun.phase === 'clicks')
      calRun.hits.push(m.frame / audio.ctx.sampleRate);
    return;
  }
  if (m.type === 'hit') onHit(m.frame / audio.ctx.sampleRate, m.rms, m.frame);
  if (m.type === 'end') onEnd(m);
}

const pendingEnds = new Map();
function onEnd(m) {
  const h = session.hits.find((x) => x.frame === m.frame);
  if (h) {
    applyEnd(h, m);
    requestRender();
  } else {
    pendingEnds.set(m.frame, m);
    if (pendingEnds.size > 20) pendingEnds.delete(pendingEnds.keys().next().value);
  }
}
function applyEnd(h, m) {
  h.noteLengthMs = ((m.endFrame - m.frame) / audio.ctx.sampleRate) * 1000;
  h.rangIntoNext = !!m.rangIntoNext;
}
// Places a moment against the beats the click track actually played, so a tempo change mid-take
// grades each strum against the beat it really followed.
function beatPosition(time) {
  const beats = session.beatTimes;
  let i = beats.length - 1;
  while (i > 0 && beats[i] > time) i--;
  const nextBeat = i < beats.length - 1 ? beats[i + 1] : beats[i] + 60 / S.bpm;
  const beatSeconds = nextBeat - beats[i];
  return { beats: i + (time - beats[i]) / beatSeconds, beatSeconds };
}
function onHit(t, rms, frame) {
  if (!session.isRunning || !session.beatTimes.length) return;
  const delay = calValid() ? S.cal.ms / 1000 : session.estimatedLatency;
  const ta = t - delay - S.latMs / 1000;
  if (ta < session.analyzeFrom) return;
  const { beats: beatsF, beatSeconds: bd } = beatPosition(ta);
  const subF = beatsF * S.grid;
  const n = Math.round(subF);
  const off = ((subF - n) / S.grid) * bd * 1000;
  const subIdx = ((n % S.grid) + S.grid) % S.grid;
  const beat = (((Math.floor(n / S.grid) % 4) + 4) % 4) + 1;
  const db = 20 * Math.log10(Math.max(rms, 1e-7));
  const h = {
    frame,
    offsetMs: off,
    levelDb: db,
    subdivision: subIdx,
    beat,
    beatNumber: Math.floor(n / S.grid),
    beatMs: bd * 1000,
    slotMs: (bd * 1000) / S.grid,
    noteLengthMs: NaN,
    rangIntoNext: false,
    isDownstroke: S.grid === 1 ? true : subIdx % 2 === 0,
    grid: S.grid,
  };
  if (pendingEnds.has(frame)) {
    applyEnd(h, pendingEnds.get(frame));
    pendingEnds.delete(frame);
  }
  session.hits.push(h);
  if (session.hits.length > 4000) session.hits.shift();
  requestRender();
}
