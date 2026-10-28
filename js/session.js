import { makeExample } from './example-take.js';

// State shared across modules for the current take.
export const session = {
  hits: makeExample(),
  example: true,
  running: false,
  level: 0,
  calRun: null,
  startOutLat: 0,
  anchorTime: 0,
  anchorBeat: 0,
  analyzeFrom: 0,
  visQueue: [],
};
