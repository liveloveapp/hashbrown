// URL polyfill for AudioWorkletGlobalScope
// AudioWorkletGlobalScope doesn't have URL constructor, so we provide a minimal polyfill
if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(url, base) {
      if (base) {
        // Simple relative URL resolution
        const baseUrl = new URL(base);
        if (url.startsWith('/')) {
          this.href = baseUrl.origin + url;
        } else if (url.startsWith('./') || !url.includes('://')) {
          const basePath = baseUrl.pathname.substring(
            0,
            baseUrl.pathname.lastIndexOf('/') + 1,
          );
          this.href = baseUrl.origin + basePath + url.replace('./', '');
        } else {
          this.href = url;
        }
      } else {
        this.href = url;
      }
      const match = this.href.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
      if (match) {
        this.origin = match[1];
        this.pathname = match[2] || '/';
      } else {
        this.origin = '';
        this.pathname = this.href;
      }
    }
    static createObjectURL(blob) {
      return URL.createObjectURL
        ? URL.createObjectURL(blob)
        : 'blob:' + Math.random().toString(36);
    }
    static revokeObjectURL(url) {
      // No-op for polyfill
    }
  };
}
