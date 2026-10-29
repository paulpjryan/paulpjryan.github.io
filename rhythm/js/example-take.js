function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
}

export function makeExample() {
  const r = seeded(7);
  const out = [];
  for (let i = 0; i < 48; i++) {
    const down = i % 2 === 0;
    const beat = (Math.floor(i / 2) % 4) + 1,
      back = beat === 2 || beat === 4;
    const off = down ? (beat === 4 ? -7 : 3) + gauss(r) * 6 : 10 + gauss(r) * 9;
    const db = (down ? -18.5 + gauss(r) * 1.2 : -21.6 + gauss(r) * 2) + (back && down ? 1.8 : 0);
    const lenMs = down ? (back ? 118 + gauss(r) * 14 : 196 + gauss(r) * 18) : 142 + gauss(r) * 30;
    out.push({
      offsetMs: off,
      levelDb: db,
      subdivision: i % 2,
      beat,
      beatNumber: Math.floor(i / 2),
      beatMs: 625,
      slotMs: 312.5,
      noteLengthMs: lenMs,
      rangIntoNext: false,
      isDownstroke: down,
      grid: 2,
    });
  }
  return out;
}
