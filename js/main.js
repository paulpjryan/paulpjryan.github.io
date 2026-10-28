import { S, save } from './settings.js';
import { $, setBanner } from './dom.js';
import { session } from './session.js';
import { audio, applySink, sendDet, canPickOutput } from './audio-engine.js';
import { start, stop, reanchor } from './metronome.js';
import { calibrate, renderCal } from './calibration.js';
import { onDet } from './hit-analysis.js';
import { fmt } from './stats.js';
import { render } from './readouts.js';
import { drawTiming, drawVolume, drawLength } from './charts.js';

audio.onMessage = onDet;

/* ---------- Visual loop: beat lights + input meter ---------- */
function loop(){
  if (session.isRunning && audio.ctx){
    const now = audio.ctx.currentTime - (audio.ctx.outputLatency||0);
    while (session.beatLightQueue.length && session.beatLightQueue[0].time <= now){
      const b = session.beatLightQueue.shift();
      document.querySelectorAll('.light').forEach(l => l.classList.remove('on','silent'));
      const l = document.querySelector(`.light[data-b="${b.beatIndex}"]`);
      l.classList.add('on'); if (!b.isAudible) l.classList.add('silent');
    }
  }
  const lvDb = 20*Math.log10(Math.max(session.inputLevel, 1e-6));
  const pct = v => Math.max(0, Math.min(100, (v + 72)/72*100));
  const fill = $('meterFill'); fill.style.width = (session.isRunning ? pct(lvDb) : 0) + '%';
  fill.classList.toggle('hot', session.isRunning && lvDb > S.trigDb);
  $('meterThr').style.left = pct(S.trigDb) + '%';
  session.inputLevel *= 0.92;
  requestAnimationFrame(loop);
}

/* ---------- UI wiring ---------- */
function setBpm(v){
  v = Math.round(Math.max(40, Math.min(220, Number(v) || S.bpm)));
  S.bpm = v; $('bpm').value = v; $('bpmRange').value = v; save(); reanchor();
}
$('bpm').addEventListener('change', e => setBpm(e.target.value));
$('bpmRange').addEventListener('input', e => setBpm(e.target.value));
$('bpmDown').onclick = () => setBpm(S.bpm-1);
$('bpmUp').onclick = () => setBpm(S.bpm+1);
let taps = [];
$('tap').onclick = () => {
  const t = performance.now(); taps = taps.filter(x => t-x < 2500); taps.push(t);
  if (taps.length >= 3){ const iv = (taps[taps.length-1]-taps[0])/(taps.length-1); setBpm(60000/iv); }
};

function setPattern(p){ S.pattern = p; $('patAll').setAttribute('aria-pressed', p==='all'); $('patBack').setAttribute('aria-pressed', p==='back'); markLights(); save(); }
$('patAll').onclick = () => setPattern('all');
$('patBack').onclick = () => setPattern('back');
function markLights(){ document.querySelectorAll('.light').forEach(l => { const b = +l.dataset.b; l.classList.toggle('click', S.pattern==='all' || b===1 || b===3); }); }

document.querySelectorAll('[data-grid]').forEach(btn => btn.onclick = () => {
  S.grid = +btn.dataset.grid;
  document.querySelectorAll('[data-grid]').forEach(b => b.setAttribute('aria-pressed', b===btn));
  save(); reanchor(); render();
});

$('start').onclick = () => session.isRunning ? stop() : start();
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)){ e.preventDefault(); session.isRunning ? stop() : start(); }
});

$('trig').addEventListener('input', e => { S.trigDb = +e.target.value; $('trigVal').textContent = fmt(S.trigDb,0)+' dB'; sendDet({trigDb:S.trigDb}); save(); });
$('lat').addEventListener('change', e => { S.latMs = +e.target.value || 0; save(); });
$('calBtn').onclick = () => { if (session.isRunning) stop(); calibrate(); };
$('calChip').onclick = () => { $('calBox').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'center'}); $('calBtn').focus({preventScroll:true}); };
$('sink').addEventListener('change', async e => { S.sink = e.target.value; save(); if (audio.ctx) await applySink(); renderCal(); });
$('tol').addEventListener('change', e => { S.tol = +e.target.value; save(); render(); });
$('win').addEventListener('change', e => { S.win = +e.target.value; save(); render(); });
$('vol').addEventListener('input', e => { S.vol = +e.target.value; if (audio.clickGain) audio.clickGain.gain.value = S.vol; save(); });
$('accent').addEventListener('change', e => { S.accent = e.target.checked; save(); });
$('countin').addEventListener('change', e => { S.countIn = +e.target.value; save(); });
$('reset').onclick = () => { session.hits = []; session.isExample = false; setBanner(null); render(); };
$('device').addEventListener('change', async e => {
  S.device = e.target.value; save(); renderCal();
  const wasRunning = session.isRunning; if (session.isRunning) stop();
  if (audio.stream){ audio.stream.getTracks().forEach(t => t.stop()); audio.stream = null; }
  if (wasRunning) await start();
});
window.addEventListener('pagehide', () => { if (audio.stream) audio.stream.getTracks().forEach(t => t.stop()); });

// Init controls from settings
$('bpm').value = S.bpm; $('bpmRange').value = S.bpm;
setPattern(S.pattern);
document.querySelectorAll('[data-grid]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.grid === S.grid));
$('trig').value = S.trigDb; $('trigVal').textContent = fmt(S.trigDb,0)+' dB';
$('lat').value = S.latMs; $('tol').value = String(S.tol); $('win').value = String(S.win);
$('vol').value = S.vol; $('accent').checked = S.accent; $('countin').value = String(S.countIn);

new ResizeObserver(() => { drawTiming(); drawVolume(); drawLength(); }).observe($('tchart'));
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawTiming(); drawVolume(); drawLength(); });
$('sinkField').hidden = !canPickOutput;
renderCal();
render();
requestAnimationFrame(loop);
