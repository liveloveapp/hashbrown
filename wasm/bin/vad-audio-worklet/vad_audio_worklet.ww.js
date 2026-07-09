'use strict';
var ENVIRONMENT_IS_NODE =
  typeof process == 'object' &&
  typeof process.versions == 'object' &&
  typeof process.versions.node == 'string';
if (ENVIRONMENT_IS_NODE) {
  var nodeWorkerThreads = require('worker_threads');
  var parentPort = nodeWorkerThreads.parentPort;
  parentPort.on(
    'message',
    (data) => typeof onmessage === 'function' && onmessage({ data: data }),
  );
  var fs = require('fs');
  Object.assign(global, {
    self: global,
    require: require,
    location: { href: __filename },
    Worker: nodeWorkerThreads.Worker,
    importScripts: (f) =>
      (0, eval)(fs.readFileSync(f, 'utf8') + '//# sourceURL=' + f),
    postMessage: (msg) => parentPort.postMessage(msg),
    performance: global.performance || { now: Date.now },
    addEventListener: (name, handler) => parentPort.on(name, handler),
    removeEventListener: (name, handler) => parentPort.off(name, handler),
  });
}
self.onmessage = function (d) {
  self.onmessage = null;
  d = d.data;
  d['instantiateWasm'] = (info, receiveInstance) => {
    var instance = new WebAssembly.Instance(d['wasm'], info);
    return receiveInstance(instance, d['wasm']);
  };
  importScripts(d.js);
  createAudioWorkletModule(d);
  d.wasm = d.mem = d.js = 0;
};
