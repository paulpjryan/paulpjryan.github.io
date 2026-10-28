import { S } from './settings.js';
import { session } from './session.js';

export const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN;
export const sd = a => { if (a.length<2) return NaN; const m=mean(a); return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1)); };
export const fmtS = (v,d=1) => isNaN(v) ? '—' : (v>0?'+':v<0?'−':'') + Math.abs(v).toFixed(d);
export const fmt = (v,d=1) => isNaN(v) ? '—' : (v<0?'−':'') + Math.abs(v).toFixed(d);
export function windowed(){ return S.win ? session.hits.slice(-S.win) : session.hits; }

export function posName(h){
  const subs = {1:[''],2:['','&'],4:['','e','&','a']}[h.grid] || [''];
  return h.beat + (subs[h.subdivision] ? ' ' + subs[h.subdivision] : '');
}

// share of its slot a strum sounded (0–100); a strum that rang until the next one counts as 100
export function ringPct(h){ if (isNaN(h.noteLengthMs)) return NaN; return h.rangIntoNext ? 100 : Math.min(100, h.noteLengthMs/h.slotMs*100); }
export const measured = arr => arr.filter(h => !isNaN(h.noteLengthMs));
export function lenText(h){ return (!h || isNaN(h.noteLengthMs)) ? '—' : Math.round(h.noteLengthMs) + ' ms'; }
export function lenSub(h){ if (!h || isNaN(h.noteLengthMs)) return 'measuring…'; return h.rangIntoNext ? 'rang into next strum' : Math.round(ringPct(h)) + '% of slot'; }

/* ---------- Beat by beat ---------- */
export function beatStats(w){
  const on = w.filter(h => h.subdivision === 0);
  const byBn = new Map(on.map(h => [h.beatNumber, h]));
  const allDb = mean(on.map(h=>h.levelDb)); // compare beats with each other, not with the quieter offbeat strums
  const out = [1,2,3,4].map(b => {
    const g = on.filter(h => h.beat === b);
    // length of this beat = time from this beat's strum to the next beat's strum
    const lens = g.map(h => { const nx = byBn.get(h.beatNumber+1); return nx ? nx.offsetMs - h.offsetMs : NaN; }).filter(v => !isNaN(v));
    const gm = measured(g);
    return { beat:b, ringPercent:mean(gm.map(ringPct)), ringMs:mean(gm.map(h=>h.noteLengthMs)), ringCount:gm.length, strumCount:g.length, offsetMs:mean(g.map(h=>h.offsetMs)), offsetSd:sd(g.map(h=>h.offsetMs)), relativeDb:mean(g.map(h=>h.levelDb)) - allDb, spacingMs:mean(lens), spacingCount:lens.length };
  });
  return {beats:out, on};
}

export function beatInsights(beats){
  const ready = beats.filter(b => b.strumCount >= 3);
  if (ready.length < 4) return ['Play a few more bars. Each beat needs at least 3 strums on it before patterns show up.'];
  const tips = [];
  const avg = (arr, k) => mean(arr.map(b => b[k]).filter(v => !isNaN(v)));
  const back = [beats[1], beats[3]], front = [beats[0], beats[2]];
  const dOff = avg(back,'offsetMs') - avg(front,'offsetMs'), dDb = avg(back,'relativeDb') - avg(front,'relativeDb');
  const parts = [];
  if (Math.abs(dOff) >= 4) parts.push(`land ${Math.abs(dOff).toFixed(0)} ms ${dOff>0?'later':'earlier'}`);
  if (Math.abs(dDb) >= 1) parts.push(`are ${Math.abs(dDb).toFixed(1)} dB ${dDb>0?'louder':'quieter'}`);
  const dRing = avg(back,'ringPercent') - avg(front,'ringPercent'), dRingMs = avg(back,'ringMs') - avg(front,'ringMs');
  if (Math.abs(dRing) >= 10) parts.push(`ring ${Math.abs(dRingMs).toFixed(0)} ms ${dRing<0?'shorter':'longer'}`);
  tips.push(parts.length ? `Your 2 and 4 ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')} than your 1 and 3.` : 'Your 2 and 4 match your 1 and 3 in timing, level and length.');

  const withLen = beats.filter(b => b.spacingCount >= 3);
  if (withLen.length){
    const short = withLen.reduce((a,b) => b.spacingMs < a.spacingMs ? b : a), long = withLen.reduce((a,b) => b.spacingMs > a.spacingMs ? b : a);
    const next = b => b.beat === 4 ? 'the next bar’s 1' : 'beat ' + (b.beat+1);
    if (short.spacingMs <= -5) tips.push(`Beat ${short.beat} runs ${Math.abs(short.spacingMs).toFixed(0)} ms short: you’re rushing into ${next(short)}.`);
    if (long.spacingMs >= 5) tips.push(`Beat ${long.beat} runs ${long.spacingMs.toFixed(0)} ms long: you’re holding back before ${next(long)}.`);
  }
  const worst = ready.reduce((a,b) => Math.abs(b.offsetMs) > Math.abs(a.offsetMs) ? b : a);
  if (Math.abs(worst.offsetMs) >= 6) tips.push(`Beat ${worst.beat} is your least centered, ${Math.abs(worst.offsetMs).toFixed(0)} ms ${worst.offsetMs>0?'behind':'ahead of'} the click on average.`);
  const loud = ready.reduce((a,b) => b.relativeDb > a.relativeDb ? b : a), quiet = ready.reduce((a,b) => b.relativeDb < a.relativeDb ? b : a);
  if (loud.relativeDb - quiet.relativeDb >= 2) tips.push(`Beat ${loud.beat} is your loudest and beat ${quiet.beat} your quietest, ${(loud.relativeDb-quiet.relativeDb).toFixed(1)} dB apart.`);
  const rung = ready.filter(b => b.ringCount >= 3);
  if (rung.length >= 2){
    const lng = rung.reduce((a,b) => b.ringPercent > a.ringPercent ? b : a), sht = rung.reduce((a,b) => b.ringPercent < a.ringPercent ? b : a);
    if (lng.ringPercent - sht.ringPercent >= 20) tips.push(`Beat ${sht.beat} is your shortest note (${Math.round(sht.ringMs)} ms) and beat ${lng.beat} your longest (${Math.round(lng.ringMs)} ms).`);
  }
  const steady = ready.filter(b => !isNaN(b.offsetSd));
  if (steady.length){
    const loose = steady.reduce((a,b) => b.offsetSd > a.offsetSd ? b : a);
    const others = mean(steady.filter(b => b !== loose).map(b => b.offsetSd));
    if (loose.offsetSd - others >= 4) tips.push(`Beat ${loose.beat} wanders the most (spread ${loose.offsetSd.toFixed(0)} ms vs. ${others.toFixed(0)} ms on the others).`);
  }
  return tips;
}
