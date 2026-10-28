import { S } from './settings.js';
import { session } from './session.js';
import { audio } from './audio-engine.js';
import { calValid } from './calibration.js';
import { render } from './readouts.js';

export function onDet(m){
  const calRun = session.calibrationRun;
  if (m.type === 'level'){ session.inputLevel = Math.max(session.inputLevel*0.6, m.peakSample); if (calRun && calRun.phase === 'noise') calRun.peakEnergy = Math.max(calRun.peakEnergy, m.peakEnergy || 0); return; }
  if (calRun){ if (m.type === 'hit' && calRun.phase === 'clicks') calRun.hits.push(m.frame/audio.ctx.sampleRate); return; }
  if (m.type === 'hit') onHit(m.frame/audio.ctx.sampleRate, m.rms, m.frame);
  if (m.type === 'end') onEnd(m);
}

const pendingEnds = new Map();
function onEnd(m){
  const h = session.hits.find(x => x.frame === m.frame);
  if (h){ applyEnd(h, m); render(); } else { pendingEnds.set(m.frame, m); if (pendingEnds.size > 20) pendingEnds.delete(pendingEnds.keys().next().value); }
}
function applyEnd(h, m){ h.noteLengthMs = (m.endFrame - m.frame)/audio.ctx.sampleRate*1000; h.rangIntoNext = !!m.rangIntoNext; }
function onHit(t, rms, frame){
  if (!session.isRunning || t < session.analyzeFrom) return;
  const delay = calValid() ? S.cal.ms/1000 : session.startOutputLatency;
  const ta = t - delay - S.latMs/1000;
  const bd = 60/S.bpm;
  const beatsF = session.anchorBeat + (ta - session.anchorTime)/bd;
  const subF = beatsF*S.grid;
  const n = Math.round(subF);
  const off = (subF - n)/S.grid*bd*1000;
  const subIdx = ((n % S.grid) + S.grid) % S.grid;
  const beat = ((Math.floor(n/S.grid) % 4) + 4) % 4 + 1;
  const db = 20*Math.log10(Math.max(rms, 1e-7));
  const h = {frame, offsetMs: off, levelDb: db, subdivision: subIdx, beat, beatNumber: Math.floor(n/S.grid), beatMs: bd*1000, slotMs: bd*1000/S.grid, noteLengthMs: NaN, rangIntoNext:false, isDownstroke: S.grid===1 ? true : subIdx%2===0, grid:S.grid};
  if (pendingEnds.has(frame)){ applyEnd(h, pendingEnds.get(frame)); pendingEnds.delete(frame); }
  session.hits.push(h);
  if (session.hits.length > 4000) session.hits.shift();
  render();
}
