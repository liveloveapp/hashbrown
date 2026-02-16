#!/usr/bin/env node

// Post-build patcher for generated audio worklet artifacts.
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');
const awFile = path.join(outputDir, 'vad_audio_worklet.aw.js');
const loaderFile = path.join(outputDir, 'vad_audio_worklet.js');

if (!fs.existsSync(awFile)) {
  console.error('vad_audio_worklet.aw.js not found');
  process.exit(1);
}

if (!fs.existsSync(loaderFile)) {
  console.error('vad_audio_worklet.js not found');
  process.exit(1);
}

const awPolyfill = `(function(){if(typeof URL==="undefined"){const parseUrl=function(url){const m=url.match(/^(https?:\\/\\/([^\\/]+))?(\\/.*)?$/);return{origin:m?m[1]||"": "",pathname:m?m[3]||"/":url}};globalThis.URL=class URL{constructor(url,base){if(base){const b=parseUrl(base);if(url.startsWith("/")){this.href=(b.origin||"")+url}else if(url.startsWith("./")||!url.includes("://")){const p=(b.pathname||"/").substring(0,(b.pathname||"/").lastIndexOf("/")+1);this.href=(b.origin||"")+p+url.replace("./","")}else{this.href=url}}else{this.href=url}const parsed=parseUrl(this.href);this.origin=parsed.origin;this.pathname=parsed.pathname}static createObjectURL(b){return"blob:"+Math.random().toString(36)}static revokeObjectURL(u){}}};})();`;

function patchAudioWorkletBootstrap(filePath) {
  let originalContent = fs.readFileSync(filePath, 'utf8');

  const hasUrlPolyfill = /globalThis\.URL\s*=\s*class URL/.test(
    originalContent,
  );

  if (!hasUrlPolyfill) {
    originalContent = awPolyfill + originalContent;
    console.log('Added URL polyfill to vad_audio_worklet.aw.js');
  } else {
    console.log('URL polyfill already present in vad_audio_worklet.aw.js');
  }

  const integerMessagePattern =
    /postMessage\(\{\s*type\s*:\s*['"]integer['"]\s*,\s*value\s*:\s*d\.value\s*\}\)/;
  const onMessagePattern =
    /p\.onmessage\s*=\s*\(?\s*msg\s*\)?\s*=>\s*\{\s*(?:let|var|const)\s+d\s*=\s*msg\.data\s*;/;

  if (!integerMessagePattern.test(originalContent)) {
    if (!onMessagePattern.test(originalContent)) {
      console.error('Could not find expected onmessage handler in worklet');
      process.exit(1);
    }

    originalContent = originalContent.replace(
      onMessagePattern,
      "p.onmessage=msg=>{let d=msg.data;if(d&&d.type==='integer'){p.postMessage({type:'integer',value:d.value});return;}",
    );

    console.log('Modified message handler to forward custom integer messages');
  } else {
    console.log('Integer message forward already present in worklet handler');
  }

  fs.writeFileSync(filePath, originalContent, 'utf8');
  console.log('Patched vad_audio_worklet.aw.js successfully');
}

function patchLoaderAwResolution(filePath) {
  let loaderContent = fs.readFileSync(filePath, 'utf8');
  const patchedLiteral =
    /\.addModule\(locateFile\((['"])vad_audio_worklet\.aw\.js\1\)\)/;
  const expectedLiteral =
    /\.addModule\(\s*(['"])vad_audio_worklet\.aw\.js\1\s*\)/;

  if (patchedLiteral.test(loaderContent)) {
    console.log(
      'Loader already resolves vad_audio_worklet.aw.js through locateFile',
    );
    return;
  }

  if (!expectedLiteral.test(loaderContent)) {
    console.error(
      'Could not find expected addModule literal for vad_audio_worklet.aw.js in loader output',
    );
    process.exit(1);
  }

  loaderContent = loaderContent.replace(
    expectedLiteral,
    (_match, quote) =>
      `.addModule(locateFile(${quote}vad_audio_worklet.aw.js${quote}))`,
  );
  fs.writeFileSync(filePath, loaderContent, 'utf8');
  console.log(
    'Patched loader to resolve vad_audio_worklet.aw.js via locateFile',
  );
}

patchAudioWorkletBootstrap(awFile);
patchLoaderAwResolution(loaderFile);
