import { makeExample } from './example-take.js';

// State shared across modules for the current take.
export const session = {
  hits: makeExample(),
  isExample: true,
  isRunning: false,
  inputLevel: 0,
  calibrationRun: null,
  estimatedLatency: 0,
  takeId: 0,
  beatTimes: [],
  analyzeFrom: 0,
  beatLightQueue: [],
};
