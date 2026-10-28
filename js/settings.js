export const S = { bpm:96, pattern:'all', grid:2, countIn:1, accent:true, vol:0.6, trigDb:-42, latMs:0, tol:20, win:32, device:'', sink:'', cal:null, calPrev:null };
try { Object.assign(S, JSON.parse(localStorage.getItem('pocket-meter') || '{}')); } catch(e) {}
if (typeof S.countIn === 'boolean') S.countIn = S.countIn ? 1 : 0; // older saved setting
export const save = () => { try { localStorage.setItem('pocket-meter', JSON.stringify(S)); } catch(e) {} };
