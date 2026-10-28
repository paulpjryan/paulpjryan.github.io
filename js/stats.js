import { S } from './settings.js';
import { session } from './session.js';

export const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : NaN;
export const sd = a => { if (a.length<2) return NaN; const m=mean(a); return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1)); };
export const fmtS = (v,d=1) => isNaN(v) ? '—' : (v>0?'+':v<0?'−':'') + Math.abs(v).toFixed(d);
export const fmt = (v,d=1) => isNaN(v) ? '—' : (v<0?'−':'') + Math.abs(v).toFixed(d);
export function windowed(){ return S.win ? session.hits.slice(-S.win) : session.hits; }

export function posName(h){
  const subs = {1:[''],2:['','&'],4:['','e','&','a']}[h.grid] || [''];
  return h.beat + (subs[h.subIdx] ? ' ' + subs[h.subIdx] : '');
}

// share of its slot a strum sounded (0–100); a strum that rang until the next one counts as 100
export function ringPct(h){ if (isNaN(h.lenMs)) return NaN; return h.cut ? 100 : Math.min(100, h.lenMs/h.slotMs*100); }
export const measured = arr => arr.filter(h => !isNaN(h.lenMs));
export function lenText(h){ return (!h || isNaN(h.lenMs)) ? '—' : Math.round(h.lenMs) + ' ms'; }
export function lenSub(h){ if (!h || isNaN(h.lenMs)) return 'measuring…'; return h.cut ? 'rang into next strum' : Math.round(ringPct(h)) + '% of slot'; }

/* ---------- Beat by beat ---------- */
export function beatStats(w){
  const on = w.filter(h => h.subIdx === 0);
  const byBn = new Map(on.map(h => [h.bn, h]));
  const allDb = mean(on.map(h=>h.db)); // compare beats with each other, not with the quieter offbeat strums
  const out = [1,2,3,4].map(b => {
    const g = on.filter(h => h.beat === b);
    // length of this beat = time from this beat's strum to the next beat's strum
    const lens = g.map(h => { const nx = byBn.get(h.bn+1); return nx ? nx.off - h.off : NaN; }).filter(v => !isNaN(v));
    const gm = measured(g);
    return { beat:b, ring:mean(gm.map(ringPct)), ringMs:mean(gm.map(h=>h.lenMs)), nRing:gm.length, n:g.length, off:mean(g.map(h=>h.off)), sd:sd(g.map(h=>h.off)), rel:mean(g.map(h=>h.db)) - allDb, len:mean(lens), nLen:lens.length };
  });
  return {beats:out, on};
}

export function beatInsights(beats){
  const ready = beats.filter(b => b.n >= 3);
  if (ready.length < 4) return ['Play a few more bars. Each beat needs at least 3 strums on it before patterns show up.'];
  const tips = [];
  const avg = (arr, k) => mean(arr.map(b => b[k]).filter(v => !isNaN(v)));
  const back = [beats[1], beats[3]], front = [beats[0], beats[2]];
  const dOff = avg(back,'off') - avg(front,'off'), dDb = avg(back,'rel') - avg(front,'rel');
  const parts = [];
  if (Math.abs(dOff) >= 4) parts.push(`land ${Math.abs(dOff).toFixed(0)} ms ${dOff>0?'later':'earlier'}`);
  if (Math.abs(dDb) >= 1) parts.push(`are ${Math.abs(dDb).toFixed(1)} dB ${dDb>0?'louder':'quieter'}`);
  const dRing = avg(back,'ring') - avg(front,'ring'), dRingMs = avg(back,'ringMs') - avg(front,'ringMs');
  if (Math.abs(dRing) >= 10) parts.push(`ring ${Math.abs(dRingMs).toFixed(0)} ms ${dRing<0?'shorter':'longer'}`);
  tips.push(parts.length ? `Your 2 and 4 ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')} than your 1 and 3.` : 'Your 2 and 4 match your 1 and 3 in timing, level and length.');

  const withLen = beats.filter(b => b.nLen >= 3);
  if (withLen.length){
    const short = withLen.reduce((a,b) => b.len < a.len ? b : a), long = withLen.reduce((a,b) => b.len > a.len ? b : a);
    const next = b => b.beat === 4 ? 'the next bar’s 1' : 'beat ' + (b.beat+1);
    if (short.len <= -5) tips.push(`Beat ${short.beat} runs ${Math.abs(short.len).toFixed(0)} ms short: you’re rushing into ${next(short)}.`);
    if (long.len >= 5) tips.push(`Beat ${long.beat} runs ${long.len.toFixed(0)} ms long: you’re holding back before ${next(long)}.`);
  }
  const worst = ready.reduce((a,b) => Math.abs(b.off) > Math.abs(a.off) ? b : a);
  if (Math.abs(worst.off) >= 6) tips.push(`Beat ${worst.beat} is your least centered, ${Math.abs(worst.off).toFixed(0)} ms ${worst.off>0?'behind':'ahead of'} the click on average.`);
  const loud = ready.reduce((a,b) => b.rel > a.rel ? b : a), quiet = ready.reduce((a,b) => b.rel < a.rel ? b : a);
  if (loud.rel - quiet.rel >= 2) tips.push(`Beat ${loud.beat} is your loudest and beat ${quiet.beat} your quietest, ${(loud.rel-quiet.rel).toFixed(1)} dB apart.`);
  const rung = ready.filter(b => b.nRing >= 3);
  if (rung.length >= 2){
    const lng = rung.reduce((a,b) => b.ring > a.ring ? b : a), sht = rung.reduce((a,b) => b.ring < a.ring ? b : a);
    if (lng.ring - sht.ring >= 20) tips.push(`Beat ${sht.beat} is your shortest note (${Math.round(sht.ringMs)} ms) and beat ${lng.beat} your longest (${Math.round(lng.ringMs)} ms).`);
  }
  const steady = ready.filter(b => !isNaN(b.sd));
  if (steady.length){
    const loose = steady.reduce((a,b) => b.sd > a.sd ? b : a);
    const others = mean(steady.filter(b => b !== loose).map(b => b.sd));
    if (loose.sd - others >= 4) tips.push(`Beat ${loose.beat} wanders the most (spread ${loose.sd.toFixed(0)} ms vs. ${others.toFixed(0)} ms on the others).`);
  }
  return tips;
}
