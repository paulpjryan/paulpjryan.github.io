import { makeExample } from './example-take.js';

// State shared across modules for the current take.
export const session = {
  hits: makeExample(),
  isExample: true,
  isRunning: false,
  inputLevel: 0,
  calibrationRun: null,
  startOutputLatency: 0,
  anchorTime: 0,
  anchorBeat: 0,
  analyzeFrom: 0,
  beatLightQueue: [],
};
