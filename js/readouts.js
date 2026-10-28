import { S } from './settings.js';
import { $ } from './dom.js';
import { session } from './session.js';
import {
  mean,
  sd,
  fmtS,
  fmt,
  windowed,
  posName,
  ringPct,
  measured,
  lenText,
  lenSub,
  beatStats,
  beatInsights,
} from './stats.js';
import { drawNeedle, drawTiming, drawVolume, drawLength } from './charts.js';

function setChip(el, text, cls) {
  el.textContent = text;
  el.className = 'chip ' + cls;
}

export function render() {
  const w = windowed();
  const offs = w.map((h) => h.offsetMs),
    dbs = w.map((h) => h.levelDb);
  const bias = mean(offs),
    spread = sd(offs);
  const inside = w.filter((h) => Math.abs(h.offsetMs) <= S.tol).length;
  const vAvg = mean(dbs),
    vSd = sd(dbs);

  $('winLabel').textContent = S.win ? `Last ${S.win} strums` : 'Whole session';
  $('sBias').textContent = isNaN(bias) ? '—' : fmtS(bias) + ' ms';
  if (isNaN(bias)) setChip($('sBiasC'), 'Waiting', 'c-muted');
  else if (bias > 5) setChip($('sBiasC'), 'Dragging', 'c-late');
  else if (bias < -5) setChip($('sBiasC'), 'Rushing', 'c-early');
  else setChip($('sBiasC'), 'Centered', 'c-ok');

  $('sSd').textContent = isNaN(spread) ? '—' : fmt(spread) + ' ms';
  if (isNaN(spread)) setChip($('sSdC'), 'Waiting', 'c-muted');
  else if (spread < 8) setChip($('sSdC'), 'Tight', 'c-ok');
  else if (spread < 15) setChip($('sSdC'), 'Solid', 'c-ok');
  else if (spread < 25) setChip($('sSdC'), 'Loose', 'c-late');
  else setChip($('sSdC'), 'Unsteady', 'c-late');

  document.querySelector('#sIn').previousElementSibling.textContent = `Inside ±${S.tol} ms`;
  $('sIn').textContent = w.length ? Math.round((inside / w.length) * 100) + '%' : '—';
  setChip($('sInC'), w.length ? `${inside} of ${w.length}` : 'no strums yet', 'c-muted');

  $('sVsd').textContent = isNaN(vSd) ? '—' : fmt(vSd) + ' dB';
  if (isNaN(vSd)) setChip($('sVsdC'), 'Waiting', 'c-muted');
  else if (vSd < 1.5) setChip($('sVsdC'), 'Even', 'c-ok');
  else if (vSd < 3) setChip($('sVsdC'), 'Fair', 'c-ok');
  else setChip($('sVsdC'), 'Uneven', 'c-late');

  $('sVavg').textContent = isNaN(vAvg) ? '—' : fmt(vAvg) + ' dB';
  setChip(
    $('sVavgC'),
    dbs.length > 1 ? `range ${(Math.max(...dbs) - Math.min(...dbs)).toFixed(1)} dB` : '—',
    'c-muted',
  );
  const mw = measured(w),
    lens = mw.map((h) => h.noteLengthMs),
    pcts = mw.map(ringPct);
  const lAvg = mean(lens),
    lSd = sd(lens),
    throughShare = mw.length ? mw.filter((h) => h.rangIntoNext).length / mw.length : 0;
  $('sL').textContent = isNaN(lAvg) ? '—' : Math.round(lAvg) + ' ms';
  setChip(
    $('sLC'),
    isNaN(lAvg)
      ? 'Waiting'
      : throughShare > 0.7
        ? 'mostly ringing through'
        : `${Math.round(mean(pcts))}% of slot`,
    'c-muted',
  );
  $('sLsd').textContent = isNaN(lSd) ? '—' : Math.round(lSd) + ' ms';
  if (isNaN(lSd)) setChip($('sLsdC'), 'Waiting', 'c-muted');
  else if (throughShare > 0.7) setChip($('sLsdC'), 'Ringing chords', 'c-muted');
  else if (lSd < 15) setChip($('sLsdC'), 'Even', 'c-ok');
  else if (lSd < 30) setChip($('sLsdC'), 'Fair', 'c-ok');
  else setChip($('sLsdC'), 'Uneven', 'c-late');
  $('sN').textContent = session.hits.length;
  setChip($('sNC'), session.isExample ? 'example' : 'session', 'c-muted');

  // Last strum
  const last = session.hits[session.hits.length - 1];
  if (last) {
    const o = last.offsetMs;
    $('lastOff').textContent = fmtS(o, 0);
    const word =
      Math.abs(o) <= S.tol
        ? Math.abs(o) < 3
          ? 'on it'
          : o > 0
            ? 'a hair late'
            : 'a hair early'
        : o > 0
          ? 'late'
          : 'early';
    $('lastWord').textContent = 'ms · ' + word;
    $('lastOff').className = 'v ' + (Math.abs(o) <= S.tol ? 'c-ok' : o > 0 ? 'c-late' : 'c-early');
    $('lastWord').className = 'w ' + $('lastOff').className.slice(2);
    $('lastDb').textContent = fmt(last.levelDb) + ' dBFS';
    $('lastRel').textContent = isNaN(vAvg) ? '—' : fmtS(last.levelDb - vAvg) + ' dB';
    $('lastLen').textContent = lenText(last);
    $('lastLenSub').textContent = lenSub(last);
    $('lastPos').textContent =
      posName(last) + (last.grid > 1 ? (last.isDownstroke ? ' · down' : ' · up') : '');
  } else {
    $('lastOff').textContent = '—';
    $('lastOff').className = 'v';
    $('lastWord').textContent = 'waiting for a strum';
    $('lastWord').className = 'w c-muted';
    $('lastDb').textContent = '—';
    $('lastRel').textContent = '—';
    $('lastPos').textContent = '—';
    $('lastLen').textContent = '—';
    $('lastLenSub').textContent = '';
  }
  drawNeedle();
  drawTiming();
  drawVolume();
  drawLength();
  renderStrokes(w);
  renderBeats(w);
}

function renderStrokes(w) {
  const body = $('strokeBody');
  body.innerHTML = '';
  const groups = [
    ['Downstrokes', w.filter((h) => h.isDownstroke)],
    ['Upstrokes', w.filter((h) => !h.isDownstroke)],
  ];
  for (const [name, g] of groups) {
    const tr = document.createElement('tr');
    const o = g.map((h) => h.offsetMs),
      d = g.map((h) => h.levelDb),
      rp = measured(g).map(ringPct);
    [
      name,
      g.length,
      g.length ? fmtS(mean(o)) + ' ms' : '—',
      g.length > 1 ? fmt(sd(o)) + ' ms' : '—',
      g.length ? fmt(mean(d)) + ' dB' : '—',
      rp.length ? Math.round(mean(rp)) + '%' : '—',
    ].forEach((v) => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
  const dn = groups[0][1],
    up = groups[1][1];
  const ins = $('insight');
  ins.classList.toggle('c-muted', session.isRunning);
  if (session.isRunning) {
    ins.textContent = 'Insights appear when you stop the metronome.';
    return;
  }
  if (dn.length >= 4 && up.length >= 4) {
    const dt = mean(up.map((h) => h.offsetMs)) - mean(dn.map((h) => h.offsetMs));
    const dv = mean(up.map((h) => h.levelDb)) - mean(dn.map((h) => h.levelDb));
    const parts = [];
    if (Math.abs(dt) >= 4)
      parts.push(`land ${Math.abs(dt).toFixed(0)} ms ${dt > 0 ? 'later' : 'earlier'}`);
    if (Math.abs(dv) >= 1.5)
      parts.push(`are ${Math.abs(dv).toFixed(1)} dB ${dv < 0 ? 'quieter' : 'louder'}`);
    const rd = mean(measured(up).map(ringPct)) - mean(measured(dn).map(ringPct));
    if (Math.abs(rd) >= 10)
      parts.push(`ring ${Math.abs(rd).toFixed(0)}% of the slot ${rd < 0 ? 'less' : 'more'}`);
    ins.textContent = parts.length
      ? 'Compared with your downstrokes, your upstrokes ' +
        parts.join(', ').replace(/, ([^,]*)$/, ' and $1') +
        '.'
      : 'Your up and down strokes are well matched in timing, level and length.';
  } else if (S.grid === 1 && !session.isExample) {
    ins.textContent = 'Switch the grid to eighths or 16ths to compare up and down strokes.';
  } else ins.textContent = 'Play a few bars of alternate strumming to compare strokes.';
}

/* ---------- Beat by beat ---------- */
function barHTML(v, max, cls) {
  const c = Math.max(-1, Math.min(1, v / max)) * 50;
  const left = c < 0 ? 50 + c : 50,
    width = Math.abs(c);
  return `<div class="mbar"><div class="fill" style="left:${left}%;width:${width}%;background:var(--${cls})"></div><div class="mid"></div></div>`;
}

function pctBar(p, cls) {
  const v = isNaN(p) ? 0 : Math.max(0, Math.min(100, p));
  return `<div class="mbar"><div class="fill" style="left:0;width:${v}%;background:var(--${cls})"></div></div>`;
}

function renderBeats(w) {
  const { beats } = beatStats(w);
  const box = $('beats');
  box.innerHTML = '';
  for (const b of beats) {
    const col = document.createElement('div');
    col.className = 'bcol' + (b.beat === 2 || b.beat === 4 ? ' back' : '');
    const offCls = isNaN(b.offsetMs)
      ? 'muted'
      : Math.abs(b.offsetMs) <= S.tol / 2
        ? 'ok'
        : b.offsetMs > 0
          ? 'late'
          : 'early';
    const lenCls = isNaN(b.spacingMs)
      ? 'muted'
      : Math.abs(b.spacingMs) <= 4
        ? 'ok'
        : b.spacingMs > 0
          ? 'late'
          : 'early';
    col.innerHTML = `
      <div class="bnum">${b.beat}<small>${b.strumCount} strums</small></div>
      <div class="metric"><span class="label">Timing</span><span class="num c-${offCls}">${b.strumCount ? fmtS(b.offsetMs) + ' ms' : '—'}</span>${barHTML(b.offsetMs || 0, 25, offCls)}</div>
      <div class="metric"><span class="label">Level vs. avg</span><span class="num">${b.strumCount ? fmtS(b.relativeDb) + ' dB' : '—'}</span>${barHTML(b.relativeDb || 0, 4, 'ink')}</div>
      <div class="metric"><span class="label">Ring time</span><span class="num">${b.ringCount ? Math.round(b.ringMs) + ' ms · ' + Math.round(b.ringPercent) + '%' : '—'}</span>${pctBar(b.ringPercent, 'ink')}</div>
      <div class="metric"><span class="label">Time to next beat</span><span class="num c-${lenCls}">${b.spacingCount ? fmtS(b.spacingMs) + ' ms' : '—'}</span>${barHTML(b.spacingMs || 0, 25, lenCls)}</div>`;
    box.appendChild(col);
  }
  const ul = $('beatInsights');
  ul.innerHTML = '';
  const tips = session.isRunning ? null : beatInsights(beats);
  (tips || ['Insights appear when you stop the metronome.']).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    if (!tips) li.className = 'paused-note';
    ul.appendChild(li);
  });
}
