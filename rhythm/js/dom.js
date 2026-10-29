export const $ = (id) => document.getElementById(id);

export function setBanner(msg, isErr) {
  const b = $('banner');
  if (!msg) {
    b.hidden = true;
    return;
  }
  b.hidden = false;
  b.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = msg;
  if (isErr) s.className = 'err';
  b.appendChild(s);
}
