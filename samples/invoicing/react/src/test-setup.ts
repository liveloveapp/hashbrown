import '@testing-library/jest-dom/vitest';

// jsdom has no canvas implementation; Pretable supports null text measurement.
HTMLCanvasElement.prototype.getContext = () => null;
