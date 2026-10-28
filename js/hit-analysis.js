import { S } from './settings.js';
import { session } from './session.js';
import { audio } from './audio-engine.js';
import { calValid } from './calibration.js';
import { render } from './readouts.js';

export function onDet(m){
  const calRun = session.calRun;
  if (m.type === 'lvl'){ session.level = Math.max(session.level*0.6, m.v); if (calRun && calRun.phase === 'noise') calRun.emax = Math.max(calRun.emax, m.e || 0); return; }
  if (calRun){ if (m.type === 'hit' && calRun.phase === 'clicks') calRun.hits.push(m.frame/audio.ctx.sampleRate); return; }
  if (m.type === 'hit') onHit(m.frame/audio.ctx.sampleRate, m.rms, m.frame);
  if (m.type === 'end') onEnd(m);
}

const pendingEnds = new Map();
function onEnd(m){
  const h = session.hits.find(x => x.f === m.frame);
  if (h){ applyEnd(h, m); render(); } else { pendingEnds.set(m.frame, m); if (pendingEnds.size > 20) pendingEnds.delete(pendingEnds.keys().next().value); }
}
function applyEnd(h, m){ h.lenMs = (m.end - m.frame)/audio.ctx.sampleRate*1000; h.cut = !!m.cut; }
function onHit(t, rms, frame){
  if (!session.running || t < session.analyzeFrom) return;
  const delay = calValid() ? S.cal.ms/1000 : session.startOutLat;
  const ta = t - delay - S.latMs/1000;
  const bd = 60/S.bpm;
  const beatsF = session.anchorBeat + (ta - session.anchorTime)/bd;
  const subF = beatsF*S.grid;
  const n = Math.round(subF);
  const off = (subF - n)/S.grid*bd*1000;
  const subIdx = ((n % S.grid) + S.grid) % S.grid;
  const beat = ((Math.floor(n/S.grid) % 4) + 4) % 4 + 1;
  const db = 20*Math.log10(Math.max(rms, 1e-7));
  const h = {f: frame, off, db, subIdx, beat, bn: Math.floor(n/S.grid), bdMs: bd*1000, slotMs: bd*1000/S.grid, lenMs: NaN, cut:false, down: S.grid===1 ? true : subIdx%2===0, grid:S.grid};
  if (pendingEnds.has(frame)){ applyEnd(h, pendingEnds.get(frame)); pendingEnds.delete(frame); }
  session.hits.push(h);
  if (session.hits.length > 4000) session.hits.shift();
  render();
}
