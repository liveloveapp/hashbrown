var createAudioWorkletModule = (() => {
  var _scriptDir = import.meta.url;

  return async function (moduleArg = {}) {
    function GROWABLE_HEAP_I8() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAP8;
    }
    function GROWABLE_HEAP_U8() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPU8;
    }
    function GROWABLE_HEAP_I32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAP32;
    }
    function GROWABLE_HEAP_U32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPU32;
    }
    function GROWABLE_HEAP_F32() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPF32;
    }
    function GROWABLE_HEAP_F64() {
      if (wasmMemory.buffer != HEAP8.buffer) {
        updateMemoryViews();
      }
      return HEAPF64;
    }
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    Module['ready'] = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = './this.program';
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = typeof window == 'object';
    var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
    var ENVIRONMENT_IS_NODE =
      typeof process == 'object' &&
      typeof process.versions == 'object' &&
      typeof process.versions.node == 'string';
    var ENVIRONMENT_IS_WASM_WORKER = Module['$ww'];
    var scriptDirectory = '';
    function locateFile(path) {
      if (Module['locateFile']) {
        return Module['locateFile'](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_, readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      const { createRequire: createRequire } = await import('module');
      var require = createRequire(import.meta.url);
      var fs = require('fs');
      var nodePath = require('path');
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = nodePath.dirname(scriptDirectory) + '/';
      } else {
        scriptDirectory = require('url').fileURLToPath(
          new URL('./', import.meta.url),
        );
      }
      read_ = (filename, binary) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        return fs.readFileSync(filename, binary ? undefined : 'utf8');
      };
      readBinary = (filename) => {
        var ret = read_(filename, true);
        if (!ret.buffer) {
          ret = new Uint8Array(ret);
        }
        return ret;
      };
      readAsync = (filename, onload, onerror, binary = true) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        fs.readFile(filename, binary ? undefined : 'utf8', (err, data) => {
          if (err) onerror(err);
          else onload(binary ? data.buffer : data);
        });
      };
      if (!Module['thisProgram'] && process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, '/');
      }
      arguments_ = process.argv.slice(2);
      quit_ = (status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      };
      Module['inspect'] = () => '[Emscripten Module object]';
      let nodeWorkerThreads;
      try {
        nodeWorkerThreads = require('worker_threads');
      } catch (e) {
        console.error(
          'The "worker_threads" module is not supported in this node.js build - perhaps a newer version is needed?',
        );
        throw e;
      }
      global.Worker = nodeWorkerThreads.Worker;
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != 'undefined' && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptDir) {
        scriptDirectory = _scriptDir;
      }
      if (scriptDirectory.indexOf('blob:') !== 0) {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/') + 1,
        );
      } else {
        scriptDirectory = '';
      }
      {
        read_ = (url) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          xhr.send(null);
          return xhr.responseText;
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
    } else {
    }
    var out = Module['print'] || console.log.bind(console);
    var err = Module['printErr'] || console.error.bind(console);
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module['arguments']) arguments_ = Module['arguments'];
    if (Module['thisProgram']) thisProgram = Module['thisProgram'];
    if (Module['quit']) quit_ = Module['quit'];
    var wasmBinary;
    if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
    if (typeof WebAssembly != 'object') {
      abort('no native wasm support detected');
    }
    var wasmMemory;
    var wasmModule;
    var ABORT = false;
    var EXITSTATUS;
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module['HEAP8'] = HEAP8 = new Int8Array(b);
      Module['HEAP16'] = HEAP16 = new Int16Array(b);
      Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
      Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
      Module['HEAP32'] = HEAP32 = new Int32Array(b);
      Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
      Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
      Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
    }
    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 16777216;
    if (Module['wasmMemory']) {
      wasmMemory = Module['wasmMemory'];
    } else {
      wasmMemory = new WebAssembly.Memory({
        initial: INITIAL_MEMORY / 65536,
        maximum: 2147483648 / 65536,
        shared: true,
      });
      if (!(wasmMemory.buffer instanceof SharedArrayBuffer)) {
        err(
          'requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag',
        );
        if (ENVIRONMENT_IS_NODE) {
          err(
            '(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)',
          );
        }
        throw Error('bad memory');
      }
    }
    updateMemoryViews();
    INITIAL_MEMORY = wasmMemory.buffer.byteLength;
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATMAIN__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module['preRun']) {
        if (typeof Module['preRun'] == 'function')
          Module['preRun'] = [Module['preRun']];
        while (Module['preRun'].length) {
          addOnPreRun(Module['preRun'].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      if (ENVIRONMENT_IS_WASM_WORKER) return _wasmWorkerInitializeRuntime();
      callRuntimeCallbacks(__ATINIT__);
    }
    function preMain() {
      callRuntimeCallbacks(__ATMAIN__);
    }
    function postRun() {
      if (Module['postRun']) {
        if (typeof Module['postRun'] == 'function')
          Module['postRun'] = [Module['postRun']];
        while (Module['postRun'].length) {
          addOnPostRun(Module['postRun'].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function addRunDependency(id) {
      runDependencies++;
      if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
      }
    }
    function removeRunDependency(id) {
      runDependencies--;
      if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      if (Module['onAbort']) {
        Module['onAbort'](what);
      }
      what = 'Aborted(' + what + ')';
      err(what);
      ABORT = true;
      EXITSTATUS = 1;
      what += '. Build with -sASSERTIONS for more info.';
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = 'data:application/octet-stream;base64,';
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
    var isFileURI = (filename) => filename.startsWith('file://');
    var wasmBinaryFile;
    if (Module['locateFile']) {
      wasmBinaryFile = 'vad_audio_worklet.wasm';
      if (!isDataURI(wasmBinaryFile)) {
        wasmBinaryFile = locateFile(wasmBinaryFile);
      }
    } else {
      wasmBinaryFile = new URL('vad_audio_worklet.wasm', import.meta.url).href;
    }
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw 'both async and sync fetching of the wasm failed';
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch == 'function' && !isFileURI(binaryFile)) {
          return fetch(binaryFile, { credentials: 'same-origin' })
            .then((response) => {
              if (!response['ok']) {
                throw "failed to load wasm binary file at '" + binaryFile + "'";
              }
              return response['arrayBuffer']();
            })
            .catch(() => getBinarySync(binaryFile));
        } else if (readAsync) {
          return new Promise((resolve, reject) => {
            readAsync(
              binaryFile,
              (response) => resolve(new Uint8Array(response)),
              reject,
            );
          });
        }
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile)
        .then((binary) => WebAssembly.instantiate(binary, imports))
        .then((instance) => instance)
        .then(receiver, (reason) => {
          err(`failed to asynchronously prepare wasm: ${reason}`);
          abort(reason);
        });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (
        !binary &&
        typeof WebAssembly.instantiateStreaming == 'function' &&
        !isDataURI(binaryFile) &&
        !isFileURI(binaryFile) &&
        !ENVIRONMENT_IS_NODE &&
        typeof fetch == 'function'
      ) {
        return fetch(binaryFile, { credentials: 'same-origin' }).then(
          (response) => {
            var result = WebAssembly.instantiateStreaming(response, imports);
            return result.then(callback, function (reason) {
              err(`wasm streaming compile failed: ${reason}`);
              err('falling back to ArrayBuffer instantiation');
              return instantiateArrayBuffer(binaryFile, imports, callback);
            });
          },
        );
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function createWasm() {
      var info = { a: wasmImports };
      function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        wasmTable = wasmExports['y'];
        Module['wasmTable'] = wasmTable;
        addOnInit(wasmExports['l']);
        wasmModule = module;
        removeRunDependency('wasm-instantiate');
        return wasmExports;
      }
      addRunDependency('wasm-instantiate');
      function receiveInstantiationResult(result) {
        receiveInstance(result['instance'], result['module']);
      }
      if (Module['instantiateWasm']) {
        try {
          return Module['instantiateWasm'](info, receiveInstance);
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`);
          readyPromiseReject(e);
        }
      }
      instantiateAsync(
        wasmBinary,
        wasmBinaryFile,
        info,
        receiveInstantiationResult,
      ).catch(readyPromiseReject);
      return {};
    }
    var ASM_CONSTS = {
      1340: ($0) => {
        window.logVADDecisionFromWorklet($0);
      },
      1382: ($0, $1) => {
        try {
          if (typeof EmAudio !== 'undefined' && EmAudio[$0]) {
            window.audioWorkletNativeContext = EmAudio[$0];
          }
          window.audioWorkletReady = true;
          window._emscriptenWorkletNode = $1;
          window._emscriptenAudioContextHandle = $0;
        } catch (e) {
          window.audioWorkletReady = true;
          window._emscriptenWorkletNode = $1;
          window._emscriptenAudioContextHandle = $0;
        }
      },
      1734: ($0, $1) => {
        try {
          var ctx = null;
          if (typeof EmAudio !== 'undefined') {
            if (EmAudio[$0]) ctx = EmAudio[$0];
            else if (EmAudio[$1] && EmAudio[$1].context)
              ctx = EmAudio[$1].context;
          }
          if (ctx) window.audioWorkletNativeContext = ctx;
          window.audioWorkletReady = true;
          window._emscriptenWorkletNode = $1;
          window._emscriptenAudioContextHandle = $0;
        } catch (e) {
          window.audioWorkletReady = true;
          window._emscriptenWorkletNode = $1;
          window._emscriptenAudioContextHandle = $0;
        }
      },
      2196: ($0) => {
        window._emscriptenAudioContextHandle = $0;
        if (typeof EmAudio !== 'undefined') {
          Module.EmAudio = EmAudio;
        }
      },
    };
    function ExitStatus(status) {
      this.name = 'ExitStatus';
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
    var _wasmWorkerDelayedMessageQueue = [];
    var wasmTableMirror = [];
    var wasmTable;
    var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length)
          wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      return func;
    };
    var _wasmWorkerRunPostMessage = (e) => {
      let data = ENVIRONMENT_IS_NODE ? e : e.data;
      let wasmCall = data['_wsc'];
      wasmCall && getWasmTableEntry(wasmCall)(...data['x']);
    };
    var _wasmWorkerAppendToQueue = (e) => {
      _wasmWorkerDelayedMessageQueue.push(e);
    };
    var _wasmWorkerInitializeRuntime = () => {
      let m = Module;
      _emscripten_wasm_worker_initialize(m['sb'], m['sz']);
      if (typeof AudioWorkletGlobalScope === 'undefined') {
        removeEventListener('message', _wasmWorkerAppendToQueue);
        _wasmWorkerDelayedMessageQueue = _wasmWorkerDelayedMessageQueue.forEach(
          _wasmWorkerRunPostMessage,
        );
        addEventListener('message', _wasmWorkerRunPostMessage);
      }
    };
    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    };
    var noExitRuntime = Module['noExitRuntime'] || true;
    var readEmAsmArgsArray = [];
    var readEmAsmArgs = (sigPtr, buf) => {
      readEmAsmArgsArray.length = 0;
      var ch;
      while ((ch = GROWABLE_HEAP_U8()[sigPtr++])) {
        var wide = ch != 105;
        wide &= ch != 112;
        buf += wide && buf % 8 ? 4 : 0;
        readEmAsmArgsArray.push(
          ch == 112
            ? GROWABLE_HEAP_U32()[buf >> 2]
            : ch == 105
              ? GROWABLE_HEAP_I32()[buf >> 2]
              : GROWABLE_HEAP_F64()[buf >> 3],
        );
        buf += wide ? 8 : 4;
      }
      return readEmAsmArgsArray;
    };
    var runEmAsmFunction = (code, sigPtr, argbuf) => {
      var args = readEmAsmArgs(sigPtr, argbuf);
      return ASM_CONSTS[code].apply(null, args);
    };
    var _emscripten_asm_const_int = (code, sigPtr, argbuf) =>
      runEmAsmFunction(code, sigPtr, argbuf);
    var _emscripten_audio_context_state = (contextHandle) =>
      ['suspended', 'running', 'closed', 'interrupted'].indexOf(
        EmAudio[contextHandle].state,
      );
    var emscripten_audio_worklet_post_function_1 = (
      audioContext,
      funcPtr,
      arg0,
    ) => {
      (audioContext
        ? EmAudio[audioContext].audioWorklet.bootstrapMessage.port
        : globalThis['messagePort']
      ).postMessage({ _wsc: funcPtr, x: [arg0] });
    };
    function _emscripten_audio_worklet_post_function_vi(
      audioContext,
      funcPtr,
      arg0,
    ) {
      emscripten_audio_worklet_post_function_1(audioContext, funcPtr, arg0);
    }
    var EmAudio = {};
    var EmAudioCounter = 0;
    var emscriptenRegisterAudioObject = (object) => {
      EmAudio[++EmAudioCounter] = object;
      return EmAudioCounter;
    };
    var UTF8Decoder =
      typeof TextDecoder != 'undefined' ? new TextDecoder('utf8') : undefined;
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(
          heapOrArray.buffer instanceof SharedArrayBuffer
            ? heapOrArray.slice(idx, endPtr)
            : heapOrArray.subarray(idx, endPtr),
        );
      }
      var str = '';
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u0 =
            ((u0 & 7) << 18) |
            (u1 << 12) |
            (u2 << 6) |
            (heapOrArray[idx++] & 63);
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        }
      }
      return str;
    };
    var UTF8ToString = (ptr, maxBytesToRead) =>
      ptr ? UTF8ArrayToString(GROWABLE_HEAP_U8(), ptr, maxBytesToRead) : '';
    var _emscripten_create_audio_context = (options) => {
      let ctx = window.AudioContext || window.webkitAudioContext;
      options >>= 2;
      let opts = options
        ? {
            latencyHint: GROWABLE_HEAP_U32()[options]
              ? UTF8ToString(GROWABLE_HEAP_U32()[options])
              : void 0,
            sampleRate: GROWABLE_HEAP_I32()[options + 1] || void 0,
          }
        : void 0;
      return ctx && emscriptenRegisterAudioObject(new ctx(opts));
    };
    var _emscripten_create_wasm_audio_worklet_node = (
      contextHandle,
      name,
      options,
      callback,
      userData,
    ) => {
      options >>= 2;
      function readChannelCountArray(heapIndex, numOutputs) {
        let channelCounts = [];
        while (numOutputs--)
          channelCounts.push(GROWABLE_HEAP_U32()[heapIndex++]);
        return channelCounts;
      }
      let opts = options
        ? {
            numberOfInputs: GROWABLE_HEAP_I32()[options],
            numberOfOutputs: GROWABLE_HEAP_I32()[options + 1],
            outputChannelCount: GROWABLE_HEAP_U32()[options + 2]
              ? readChannelCountArray(
                  GROWABLE_HEAP_U32()[options + 2] >> 2,
                  GROWABLE_HEAP_I32()[options + 1],
                )
              : void 0,
            processorOptions: { cb: callback, ud: userData },
          }
        : void 0;
      return emscriptenRegisterAudioObject(
        new AudioWorkletNode(EmAudio[contextHandle], UTF8ToString(name), opts),
      );
    };
    var _emscripten_create_wasm_audio_worklet_processor_async = (
      contextHandle,
      options,
      callback,
      userData,
    ) => {
      options >>= 2;
      let audioParams = [],
        numAudioParams = GROWABLE_HEAP_U32()[options + 1],
        audioParamDescriptors = GROWABLE_HEAP_U32()[options + 2] >> 2,
        i = 0;
      while (numAudioParams--) {
        audioParams.push({
          name: i++,
          defaultValue: GROWABLE_HEAP_F32()[audioParamDescriptors++],
          minValue: GROWABLE_HEAP_F32()[audioParamDescriptors++],
          maxValue: GROWABLE_HEAP_F32()[audioParamDescriptors++],
          automationRate:
            ['a', 'k'][GROWABLE_HEAP_U32()[audioParamDescriptors++]] + '-rate',
        });
      }
      EmAudio[contextHandle].audioWorklet.bootstrapMessage.port.postMessage({
        _wpn: UTF8ToString(GROWABLE_HEAP_U32()[options]),
        audioParams: audioParams,
        contextHandle: contextHandle,
        callback: callback,
        userData: userData,
      });
    };
    var _emscripten_get_now;
    if (typeof performance != 'undefined' && performance.now) {
      _emscripten_get_now = () => performance.now();
    } else {
      _emscripten_get_now = Date.now;
    }
    var getHeapMax = () => 2147483648;
    var growMemory = (size) => {
      var b = wasmMemory.buffer;
      var pages = (size - b.byteLength + 65535) / 65536;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {}
    };
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = GROWABLE_HEAP_U8().length;
      requestedSize >>>= 0;
      if (requestedSize <= oldSize) {
        return false;
      }
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      var alignUp = (x, multiple) =>
        x + ((multiple - (x % multiple)) % multiple);
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(
          overGrownHeapSize,
          requestedSize + 100663296,
        );
        var newSize = Math.min(
          maxHeapSize,
          alignUp(Math.max(requestedSize, overGrownHeapSize), 65536),
        );
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    };
    var _emscripten_resume_audio_context_sync = (contextHandle) => {
      EmAudio[contextHandle].resume();
    };
    var _wasmWorkersID = 1;
    var _EmAudioDispatchProcessorCallback = (e) => {
      let data = e.data,
        wasmCall = data['_wsc'];
      wasmCall && getWasmTableEntry(wasmCall)(...data['x']);
    };
    var _emscripten_start_wasm_audio_worklet_thread_async = (
      contextHandle,
      stackLowestAddress,
      stackSize,
      callback,
      userData,
    ) => {
      let audioContext = EmAudio[contextHandle],
        audioWorklet = audioContext.audioWorklet;
      let audioWorkletCreationFailed = () => {
        getWasmTableEntry(callback)(contextHandle, 0, userData);
      };
      if (!audioWorklet) {
        return audioWorkletCreationFailed();
      }
      audioWorklet
        .addModule('vad_audio_worklet.aw.js')
        .then(() => {
          audioWorklet.bootstrapMessage = new AudioWorkletNode(
            audioContext,
            'message',
            {
              processorOptions: {
                $ww: _wasmWorkersID++,
                wasm: wasmModule,
                wasmMemory: wasmMemory,
                sb: stackLowestAddress,
                sz: stackSize,
              },
            },
          );
          audioWorklet.bootstrapMessage.port.onmessage =
            _EmAudioDispatchProcessorCallback;
          return audioWorklet.addModule(
            Module['mainScriptUrlOrBlob'] || _scriptDir,
          );
        })
        .then(() => {
          getWasmTableEntry(callback)(contextHandle, 1, userData);
        })
        .catch(audioWorkletCreationFailed);
    };
    var runtimeKeepaliveCounter = 0;
    var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
    var SYSCALLS = {
      varargs: undefined,
      get() {
        var ret = GROWABLE_HEAP_I32()[+SYSCALLS.varargs >> 2];
        SYSCALLS.varargs += 4;
        return ret;
      },
      getp() {
        return SYSCALLS.get();
      },
      getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
    };
    var _proc_exit = (code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        if (Module['onExit']) Module['onExit'](code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    };
    var exitJS = (status, implicit) => {
      EXITSTATUS = status;
      _proc_exit(status);
    };
    var handleException = (e) => {
      if (e instanceof ExitStatus || e == 'unwind') {
        return EXITSTATUS;
      }
      quit_(1, e);
    };
    var getCFunc = (ident) => {
      var func = Module['_' + ident];
      return func;
    };
    var writeArrayToMemory = (array, buffer) => {
      GROWABLE_HEAP_I8().set(array, buffer);
    };
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | (u >> 6);
          heap[outIdx++] = 128 | (u & 63);
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | (u >> 12);
          heap[outIdx++] = 128 | ((u >> 6) & 63);
          heap[outIdx++] = 128 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 240 | (u >> 18);
          heap[outIdx++] = 128 | ((u >> 12) & 63);
          heap[outIdx++] = 128 | ((u >> 6) & 63);
          heap[outIdx++] = 128 | (u & 63);
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) =>
      stringToUTF8Array(str, GROWABLE_HEAP_U8(), outPtr, maxBytesToWrite);
    var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
    var ccall = (ident, returnType, argTypes, args, opts) => {
      var toC = {
        string: (str) => {
          var ret = 0;
          if (str !== null && str !== undefined && str !== 0) {
            ret = stringToUTF8OnStack(str);
          }
          return ret;
        },
        array: (arr) => {
          var ret = stackAlloc(arr.length);
          writeArrayToMemory(arr, ret);
          return ret;
        },
      };
      function convertReturnValue(ret) {
        if (returnType === 'string') {
          return UTF8ToString(ret);
        }
        if (returnType === 'boolean') return Boolean(ret);
        return ret;
      }
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func.apply(null, cArgs);
      function onDone(ret) {
        if (stack !== 0) stackRestore(stack);
        return convertReturnValue(ret);
      }
      ret = onDone(ret);
      return ret;
    };
    var cwrap = (ident, returnType, argTypes, opts) => {
      var numericArgs =
        !argTypes ||
        argTypes.every((type) => type === 'number' || type === 'boolean');
      var numericRet = returnType !== 'string';
      if (numericRet && numericArgs && !opts) {
        return getCFunc(ident);
      }
      return function () {
        return ccall(ident, returnType, argTypes, arguments, opts);
      };
    };
    var wasmImports = {
      c: _emscripten_asm_const_int,
      h: _emscripten_audio_context_state,
      k: _emscripten_audio_worklet_post_function_vi,
      f: _emscripten_create_audio_context,
      j: _emscripten_create_wasm_audio_worklet_node,
      i: _emscripten_create_wasm_audio_worklet_processor_async,
      b: _emscripten_get_now,
      d: _emscripten_resize_heap,
      g: _emscripten_resume_audio_context_sync,
      e: _emscripten_start_wasm_audio_worklet_thread_async,
      a: wasmMemory,
    };
    var wasmExports = createWasm();
    var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports['l'])();
    var _OnMessageFromAudioThread = (Module['_OnMessageFromAudioThread'] = (
      a0,
    ) =>
      (_OnMessageFromAudioThread = Module['_OnMessageFromAudioThread'] =
        wasmExports['m'])(a0));
    var _AudioProcess = (Module['_AudioProcess'] = (
      a0,
      a1,
      a2,
      a3,
      a4,
      a5,
      a6,
    ) =>
      (_AudioProcess = Module['_AudioProcess'] = wasmExports['n'])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5,
        a6,
      ));
    var _WebRtcVad_Process = (Module['_WebRtcVad_Process'] = (a0, a1, a2, a3) =>
      (_WebRtcVad_Process = Module['_WebRtcVad_Process'] = wasmExports['o'])(
        a0,
        a1,
        a2,
        a3,
      ));
    var _ResumeAudioContext = (Module['_ResumeAudioContext'] = () =>
      (_ResumeAudioContext = Module['_ResumeAudioContext'] =
        wasmExports['p'])());
    var _GetAudioContextHandle = (Module['_GetAudioContextHandle'] = () =>
      (_GetAudioContextHandle = Module['_GetAudioContextHandle'] =
        wasmExports['q'])());
    var _SetVADMode = (Module['_SetVADMode'] = (a0) =>
      (_SetVADMode = Module['_SetVADMode'] = wasmExports['r'])(a0));
    var _WebRtcVad_set_mode = (Module['_WebRtcVad_set_mode'] = (a0, a1) =>
      (_WebRtcVad_set_mode = Module['_WebRtcVad_set_mode'] = wasmExports['s'])(
        a0,
        a1,
      ));
    var _CleanupVAD = (Module['_CleanupVAD'] = () =>
      (_CleanupVAD = Module['_CleanupVAD'] = wasmExports['t'])());
    var _WebRtcVad_Free = (Module['_WebRtcVad_Free'] = (a0) =>
      (_WebRtcVad_Free = Module['_WebRtcVad_Free'] = wasmExports['u'])(a0));
    var _WebRtcVad_Create = (Module['_WebRtcVad_Create'] = () =>
      (_WebRtcVad_Create = Module['_WebRtcVad_Create'] = wasmExports['v'])());
    var _WebRtcVad_Init = (Module['_WebRtcVad_Init'] = (a0) =>
      (_WebRtcVad_Init = Module['_WebRtcVad_Init'] = wasmExports['w'])(a0));
    var _main = (Module['_main'] = (a0, a1) =>
      (_main = Module['_main'] = wasmExports['x'])(a0, a1));
    var _malloc = (Module['_malloc'] = (a0) =>
      (_malloc = Module['_malloc'] = wasmExports['z'])(a0));
    var _free = (Module['_free'] = (a0) =>
      (_free = Module['_free'] = wasmExports['A'])(a0));
    var _WebRtcVad_ValidRateAndFrameLength = (Module[
      '_WebRtcVad_ValidRateAndFrameLength'
    ] = (a0, a1) =>
      (_WebRtcVad_ValidRateAndFrameLength = Module[
        '_WebRtcVad_ValidRateAndFrameLength'
      ] =
        wasmExports['B'])(a0, a1));
    var ___errno_location = () =>
      (___errno_location = wasmExports['__errno_location'])();
    var _emscripten_wasm_worker_initialize = (Module[
      '_emscripten_wasm_worker_initialize'
    ] = (a0, a1) =>
      (_emscripten_wasm_worker_initialize = Module[
        '_emscripten_wasm_worker_initialize'
      ] =
        wasmExports['C'])(a0, a1));
    var stackSave = () => (stackSave = wasmExports['D'])();
    var stackRestore = (a0) => (stackRestore = wasmExports['E'])(a0);
    var stackAlloc = (a0) => (stackAlloc = wasmExports['F'])(a0);
    Module['stackAlloc'] = stackAlloc;
    Module['stackSave'] = stackSave;
    Module['stackRestore'] = stackRestore;
    Module['ccall'] = ccall;
    Module['cwrap'] = cwrap;
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function callMain() {
      var entryFunction = _main;
      var argc = 0;
      var argv = 0;
      try {
        var ret = entryFunction(argc, argv);
        exitJS(ret, true);
        return ret;
      } catch (e) {
        return handleException(e);
      }
    }
    function run() {
      if (runDependencies > 0) {
        return;
      }
      if (ENVIRONMENT_IS_WASM_WORKER) {
        readyPromiseResolve(Module);
        return initRuntime();
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module['calledRun'] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        readyPromiseResolve(Module);
        if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();
        if (shouldRunNow) callMain();
        postRun();
      }
      if (Module['setStatus']) {
        Module['setStatus']('Running...');
        setTimeout(function () {
          setTimeout(function () {
            Module['setStatus']('');
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    if (Module['preInit']) {
      if (typeof Module['preInit'] == 'function')
        Module['preInit'] = [Module['preInit']];
      while (Module['preInit'].length > 0) {
        Module['preInit'].pop()();
      }
    }
    var shouldRunNow = true;
    if (Module['noInitialRun']) shouldRunNow = false;
    run();

    return moduleArg.ready;
  };
})();
globalThis.AudioWorkletModule = createAudioWorkletModule;
export default createAudioWorkletModule;
