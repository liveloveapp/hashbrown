#!/usr/bin/env node

// Post-build script to add URL polyfill to audio worklet file
const fs = require('fs');
const path = require('path');

const awFile = path.join(__dirname, 'output', 'vad_audio_worklet.aw.js');

if (!fs.existsSync(awFile)) {
  console.error('vad_audio_worklet.aw.js not found');
  process.exit(1);
}

let originalContent = fs.readFileSync(awFile, 'utf8');

// URL polyfill for AudioWorkletGlobalScope
const polyfill = `(function(){if(typeof URL==="undefined"){const parseUrl=function(url){const m=url.match(/^(https?:\\/\\/([^\\/]+))?(\\/.*)?$/);return{origin:m?m[1]||"": "",pathname:m?m[3]||"/":url}};globalThis.URL=class URL{constructor(url,base){if(base){const b=parseUrl(base);if(url.startsWith("/")){this.href=(b.origin||"")+url}else if(url.startsWith("./")||!url.includes("://")){const p=(b.pathname||"/").substring(0,(b.pathname||"/").lastIndexOf("/")+1);this.href=(b.origin||"")+p+url.replace("./","")}else{this.href=url}}else{this.href=url}const parsed=parseUrl(this.href);this.origin=parsed.origin;this.pathname=parsed.pathname}static createObjectURL(b){return"blob:"+Math.random().toString(36)}static revokeObjectURL(u){}}};})();`;

// Only add polyfill if URL is not already defined (avoid duplicates)
if (!originalContent.includes('if(typeof URL==="undefined")')) {
  originalContent = polyfill + originalContent;
  console.log('Added URL polyfill to vad_audio_worklet.aw.js');
} else {
  console.log('URL polyfill already present in vad_audio_worklet.aw.js');
}

// Modify the message handler to forward custom integer messages
// The BootstrapMessages class receives messages on the audio worklet side
// When we post a message to globalThis.messagePort, it's received by p.onmessage
// We need to forward our custom messages so they reach the main thread handler
if (originalContent.includes('p.onmessage=msg=>{')) {
  // The message handler processes messages with _wpn or _wsc keys
  // We'll add code to forward messages with type 'integer' to the main thread
  // by posting them back through the port (which sends them to the main thread)

  // First, remove any existing patch to avoid duplicates
  originalContent = originalContent.replace(
    /p\.onmessage=msg=>\{let d=msg\.data;if\(d&&d\.type==='integer'\)\{p\.postMessage\(\{type:'integer',value:d\.value\}\);return;\}let d=msg\.data;/g,
    `p.onmessage=msg=>{let d=msg.data;`,
  );

  // Now add our patch
  originalContent = originalContent.replace(
    /p\.onmessage=msg=>\{let d=msg\.data;/g,
    `p.onmessage=msg=>{let d=msg.data;if(d&&d.type==='integer'){p.postMessage({type:'integer',value:d.value});return;}`,
  );

  console.log('Modified message handler to forward custom integer messages');
}

fs.writeFileSync(awFile, originalContent, 'utf8');
console.log('Patched vad_audio_worklet.aw.js successfully');
