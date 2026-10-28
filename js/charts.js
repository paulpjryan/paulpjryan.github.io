import { S } from './settings.js';
import { $ } from './dom.js';
import { session } from './session.js';
import { mean, windowed, ringPct } from './stats.js';

function css(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function range(){ return Math.max(50, S.tol*2.5); }

export function drawNeedle(){
  const el = $('needle'); el.querySelectorAll('.tick').forEach(t=>t.remove());
  const R = range();
  const pct = v => 50 + Math.max(-1, Math.min(1, v/R))*50;
  const band = $('band'); band.style.left = pct(-S.tol)+'%'; band.style.width = (pct(S.tol)-pct(-S.tol))+'%';
  $('scaleL').textContent = `−${R} ms early`; $('scaleR').textContent = `+${R} ms late`;
  const recent = session.hits.slice(-10);
  recent.forEach((h,i) => {
    const t = document.createElement('div'); t.className = 'tick' + (i===recent.length-1 ? ' last' : '');
    t.style.left = pct(h.off)+'%';
    if (i===recent.length-1) t.style.background = Math.abs(h.off)<=S.tol ? 'var(--ok)' : h.off>0 ? 'var(--late)' : 'var(--early)';
    el.appendChild(t);
  });
}

function prep(cv){
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)){ cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  return {g,w,h};
}

export function drawTiming(){
  const {g,w,h} = prep($('tchart'));
  const ink = css('--ink'), muted = css('--muted'), line = css('--line'), ok = css('--ok'), early = css('--early'), late = css('--late');
  const padL = 52, padR = 10, padT = 10, padB = 18;
  const R = range();
  const y = v => padT + (1 - (Math.max(-R, Math.min(R, v)) + R)/(2*R)) * (h-padT-padB);
  g.font = '11px ' + css('--f-mono'); g.textBaseline = 'middle';
  // tolerance band
  g.fillStyle = ok; g.globalAlpha = 0.12; g.fillRect(padL, y(S.tol), w-padL-padR, y(-S.tol)-y(S.tol)); g.globalAlpha = 1;
  // grid lines
  const ticks = [-R, -S.tol, 0, S.tol, R];
  ticks.forEach(v => {
    g.strokeStyle = v===0 ? muted : line; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, Math.round(y(v))+0.5); g.lineTo(w-padR, Math.round(y(v))+0.5); g.stroke();
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText((v>0?'+':v<0?'−':'')+Math.abs(v)+' ms', padL-8, y(v));
  });
  g.textAlign = 'left'; g.fillStyle = muted;
  g.fillText('late ↑', padL+4, padT+6);
  g.fillText('early ↓', padL+4, h-padB+8);
  const N = 64, data = session.hits.slice(-N);
  if (!data.length){ g.textAlign='center'; g.fillText('Strums will appear here as you play', (w+padL)/2, h/2 - 14); return; }
  const step = (w-padL-padR-12)/(N-1);
  const x = i => padL + 6 + (N - data.length + i)*step;
  // rolling mean
  g.strokeStyle = ink; g.globalAlpha = 0.45; g.lineWidth = 1.5; g.beginPath();
  data.forEach((_,i) => { const s = data.slice(Math.max(0,i-7), i+1); const m = mean(s.map(q=>q.off)); i ? g.lineTo(x(i), y(m)) : g.moveTo(x(i), y(m)); });
  g.stroke(); g.globalAlpha = 1;
  data.forEach((d,i) => {
    const c = Math.abs(d.off)<=S.tol ? ok : d.off>0 ? late : early;
    const last = i === data.length-1, r = last ? 5.5 : 4;
    g.beginPath(); g.arc(x(i), y(d.off), r, 0, Math.PI*2);
    if (d.down){ g.fillStyle = c; g.fill(); } else { g.strokeStyle = c; g.lineWidth = 2; g.stroke(); }
    if (Math.abs(d.off) > R){ g.fillStyle = c; g.textAlign='center'; g.fillText(d.off>0?'▲':'▼', x(i), d.off>0 ? padT+2 : h-padB-2); }
    if (last){ g.strokeStyle = ink; g.lineWidth = 1; g.beginPath(); g.arc(x(i), y(d.off), r+3, 0, Math.PI*2); g.stroke(); }
  });
}

export function drawVolume(){
  const {g,w,h} = prep($('vchart'));
  const ink = css('--ink'), muted = css('--muted'), line = css('--line');
  const padL = 52, padR = 10, padT = 8, padB = 8, R = 6;
  const y = v => padT + (1 - (Math.max(-R, Math.min(R, v)) + R)/(2*R)) * (h-padT-padB);
  g.font = '11px ' + css('--f-mono'); g.textBaseline = 'middle';
  [-R, -3, 0, 3, R].forEach(v => {
    g.strokeStyle = v===0 ? muted : line; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, Math.round(y(v))+0.5); g.lineTo(w-padR, Math.round(y(v))+0.5); g.stroke();
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText((v>0?'+':v<0?'−':'')+Math.abs(v)+' dB', padL-8, y(v));
  });
  const N = 64, data = session.hits.slice(-N);
  if (!data.length) return;
  const m = mean(windowed().map(q=>q.db));
  const step = (w-padL-padR-12)/(N-1), bw = Math.max(2, step*0.62);
  data.forEach((d,i) => {
    const xi = padL + 6 + (N - data.length + i)*step;
    const dv = d.db - m, y0 = y(0), y1 = y(dv);
    g.fillStyle = d.down ? ink : muted; g.globalAlpha = d.down ? 0.8 : 0.65;
    g.fillRect(xi - bw/2, Math.min(y0,y1), bw, Math.max(1, Math.abs(y1-y0)));
    g.globalAlpha = 1;
  });
}

export function drawLength(){
  const {g,w,h} = prep($('lchart'));
  const ink = css('--ink'), muted = css('--muted'), line = css('--line');
  const padL = 52, padR = 10, padT = 8, padB = 8;
  const y = v => padT + (1 - v/100) * (h-padT-padB);
  g.font = '11px ' + css('--f-mono'); g.textBaseline = 'middle';
  [0, 50, 100].forEach(v => {
    g.strokeStyle = v===0 ? muted : line; g.lineWidth = 1; g.beginPath(); g.moveTo(padL, Math.round(y(v))+0.5); g.lineTo(w-padR, Math.round(y(v))+0.5); g.stroke();
    g.fillStyle = muted; g.textAlign = 'right'; g.fillText(v+'%', padL-8, y(v));
  });
  const N = 64, data = session.hits.slice(-N);
  if (!data.length) return;
  const step = (w-padL-padR-12)/(N-1), bw = Math.max(2, step*0.62);
  data.forEach((d,i) => {
    const p = ringPct(d); if (isNaN(p)) return;
    const xi = padL + 6 + (N - data.length + i)*step;
    g.fillStyle = d.down ? ink : muted;
    g.globalAlpha = d.cut ? 0.25 : (d.down ? 0.8 : 0.65);
    g.fillRect(xi - bw/2, y(p), bw, y(0) - y(p));
    g.globalAlpha = 1;
  });
}
