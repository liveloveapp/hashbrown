import '@testing-library/jest-dom/vitest';

// jsdom has no canvas implementation; Pretable supports null text measurement.
// Node-environment tests (dev-proxy.test.ts) have no HTMLCanvasElement at all.
if (typeof HTMLCanvasElement !== 'undefined')
  HTMLCanvasElement.prototype.getContext = () => null;
