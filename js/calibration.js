import { S, save } from './settings.js';
import { $ } from './dom.js';
import { session } from './session.js';
import { audio, openAudio, closeDetector, sendDet } from './audio-engine.js';
import { mean, sd } from './stats.js';
import { render } from './readouts.js';

// The measured round trip (click scheduled → heard back through the mic) is exactly the delay a
// perfectly timed strum shows, so it is subtracted from every strum as one fixed number.
function setupKey(){ return (S.device || 'default') + '|' + (S.sink || 'default'); }
export function calValid(){
  if (!S.cal || S.cal.key !== setupKey()) return false;
  if (audio.ctx && S.cal.sr && S.cal.sr !== audio.ctx.sampleRate) return false;
  return true;
}
let calBuf = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function calClick(t){
  const ctx = audio.ctx;
  if (!calBuf || calBuf.sampleRate !== ctx.sampleRate){
    const n = Math.round(ctx.sampleRate*0.012); calBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = calBuf.getChannelData(0); let seed = 12345;
    for (let i=0;i<n;i++){ seed = (seed*1103515245+12345) % 2147483648; d[i] = (seed/1073741824-1) * Math.exp(-i/(ctx.sampleRate*0.0025)); }
  }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = calBuf; g.gain.value = Math.max(0.75, S.vol);
  src.connect(g); g.connect(ctx.destination); src.start(t);
}

// The caller stops the metronome first.
export async function calibrate(){
  if (session.calibrationRun) return;
  $('calBtn').disabled = true;
  setCalStatus('Starting…', '', '');
  if (!await openAudio()){ $('calBtn').disabled = false; renderCal(); return; }
  const ctx = audio.ctx;
  const calRun = session.calibrationRun = {phase:'noise', peakEnergy:0, hits:[]};
  try {
    setCalStatus('Listening to the room…', '', 'Keep your strings muted.');
    sendDet({trigDb:-90, refractorySeconds:0.1});
    await sleep(800);
    const floorDb = 10*Math.log10(Math.max(calRun.peakEnergy, 1e-12));
    if (floorDb > -24) throw new Error('The room is too loud to calibrate. Mute your strings and try again somewhere quieter.');
    sendDet({trigDb: Math.min(-18, Math.max(-80, floorDb + 12))});
    // Irregular spacing so room echoes or the metronome can’t line up with the wrong click.
    const N = 14, sched = [];
    let t = ctx.currentTime + 0.3;
    for (let i=0;i<N;i++){ sched.push(t); calClick(t); t += 0.45 + ((i*7919)%11)/11*0.3; }
    calRun.phase = 'clicks';
    while (ctx.currentTime < t + 0.45){
      const done = sched.filter(x => x < ctx.currentTime).length;
      setCalStatus(`Measuring… click ${Math.min(done, N)} of ${N}`, '', '');
      await sleep(120);
    }
    const lags = [];
    for (const s0 of sched){
      const h = calRun.hits.find(x => x >= s0 - 0.002 && x < s0 + 0.42);
      if (h != null) lags.push((h - s0)*1000);
    }
    const sorted = [...lags].sort((a,b)=>a-b);
    const med = sorted.length ? sorted[Math.floor(sorted.length/2)] : NaN;
    const mad = sorted.length ? [...sorted.map(v=>Math.abs(v-med))].sort((a,b)=>a-b)[Math.floor(sorted.length/2)] : NaN;
    const good = lags.filter(v => Math.abs(v - med) <= Math.max(1.5, 3*mad));
    if (good.length < 8){
      throw new Error(lags.length < 8
        ? `Heard ${lags.length} of ${N} clicks. Turn the click volume up or move the mic closer to the speaker, then try again.`
        : 'The clicks came back at uneven times. Make sure nothing else is playing, then try again.');
    }
    const ms = mean(good), spread = sd(good);
    if (spread > 3) throw new Error(`The delay varied by ±${spread.toFixed(1)} ms between clicks, which is too unsteady to trust. Close other audio apps and try again. Bluetooth headphones often do this.`);
    if (S.cal && S.cal.key === setupKey()) S.calPrev = {ms:S.cal.ms, when:S.cal.when};
    else S.calPrev = null;
    S.cal = {ms, sd:spread, n:good.length, when:Date.now(), key:setupKey(), sr:ctx.sampleRate};
    S.latMs = 0; $('lat').value = 0;
    save();
  } catch(err){
    renderCal(err.message || 'Calibration didn’t finish. Try again.');
    return;
  } finally {
    session.calibrationRun = null; closeDetector(); $('calBtn').disabled = false;
  }
  renderCal(); render();
}

function setCalStatus(main, cls, detail){
  const st = $('calStatus'); st.textContent = main; st.className = cls || '';
  $('calDetail').textContent = detail || '';
}
function ago(ms){
  const m = Math.round(ms/60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m/60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h/24); return `${d} day${d>1?'s':''} ago`;
}
export function renderCal(error){
  const chip = $('calChip');
  if (error){ setCalStatus('Calibration failed', 'warn', error); }
  else if (calValid()){
    const c = S.cal;
    let detail = `${c.ms.toFixed(1)} ms round trip, steady to ±${c.sd.toFixed(1)} ms · ${ago(Date.now()-c.when)}`;
    if (S.calPrev){
      const d = c.ms - S.calPrev.ms;
      detail += Math.abs(d) < 1.5
        ? `. Matches your previous calibration (${ago(Date.now()-S.calPrev.when)}).`
        : `. That’s ${d>0?'+':'−'}${Math.abs(d).toFixed(1)} ms from your previous calibration (${ago(Date.now()-S.calPrev.when)}), so the delay is drifting on this setup.`;
    }
    setCalStatus('Calibrated', 'ok', detail);
  } else if (S.cal){
    setCalStatus('Recalibrate', 'warn', 'Your input, output or sample rate changed since you calibrated, so timing is using the browser’s estimate.');
  } else {
    setCalStatus('Not calibrated', 'warn', 'Timing is using the browser’s own delay estimate, which is often 10–40 ms off.');
  }
  const ok = calValid();
  chip.textContent = ok ? `Calibrated · ${S.cal.ms.toFixed(0)} ms` : S.cal ? 'Recalibrate' : 'Not calibrated';
  chip.className = 'chip calchip ' + (ok ? 'c-ok' : 'c-late');
}
