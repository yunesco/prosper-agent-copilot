import { chromium } from '../../frontend/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const audioDir = process.env.VOICE_AUDIO_DIR;
if (!audioDir) throw new Error('Set VOICE_AUDIO_DIR to a directory containing synthetic WAV utterances.');
const scenario = process.env.VOICE_SCENARIO || 'booking';
if (!['booking', 'correction'].includes(scenario)) throw new Error('Unknown VOICE_SCENARIO');
const attempt = `${new Date().toISOString().replaceAll(':', '-')}-${scenario}`;
fs.mkdirSync(`${root}/evals/results/voice-stability`, {recursive:true});
process.on('uncaughtException', error => {
 fs.writeFileSync(`${root}/evals/results/voice-stability/${attempt}-startup-error.json`, JSON.stringify({case:scenario,error:error.message},null,2), {flag:'wx'});
 process.exit(1);
});
const browser = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
const page = await browser.newPage();
page.setDefaultTimeout(12000);
const result = { case:scenario, scenario:'Original scheduler: manually add insurance, route record_details to insurance, then offer_times and confirm', input:'Synthetic English microphone audio, real WebRTC and configured STT/LLM/TTS providers', expected:'Ask for insurance after name/reason and before offering times; record insurance; confirm selected time', savedAgent:null, transcript:'', audio:[], error:null };
await page.addInitScript(() => {
 const Peer = window.RTCPeerConnection;
 window.livePeers = []; window.voiceTiming = []; window.botSpeaking = false;
 window.RTCPeerConnection = class extends Peer {
 constructor(...args){ super(...args); window.livePeers.push(this);
 this.addEventListener('track', event => {
  const ctx = new AudioContext(); ctx.resume();
  const source = ctx.createMediaStreamSource(new MediaStream([event.track]));
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize); let lastSound = 0;
  setInterval(() => { analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length); const now=Date.now(); if(rms>0.005){ if(now-lastSound>500) window.voiceTiming.push({type:'received-audio',at:now}); lastSound=now; } },10);
 });
 }
 createDataChannel(...args){ const channel=super.createDataChannel(...args); channel.addEventListener('message',event=>{try {const msg=JSON.parse(event.data); if(msg.type==='bot-started-speaking') window.botSpeaking=true; if(msg.type==='bot-stopped-speaking') window.botSpeaking=false; window.voiceTiming.push({at:Date.now(),...msg});}catch{}}); return channel; }
 };
 navigator.mediaDevices.getUserMedia = async () => {
   window.syntheticMic = new AudioContext({sampleRate:24000});
   window.micDestination = window.syntheticMic.createMediaStreamDestination();
   const silence = window.syntheticMic.createConstantSource();
   silence.offset.value = 0; silence.connect(window.micDestination); silence.start();
   window.microphoneSilence = silence;
   await window.syntheticMic.resume();
   return window.micDestination.stream;
 };
});
page.on('request', req => { if(req.url().endsWith('/api/runtime/call') && req.method()==='POST') { const body=req.postDataJSON(); result.savedAgent=body.agent; } });
const click = name => page.getByRole('button',{name,exact:true}).click();
async function speak(name) {
 const bytes = [...fs.readFileSync(`${audioDir}/${name}.wav`)];
 await page.evaluate(async bytes => {
   const buffer = await window.syntheticMic.decodeAudioData(new Uint8Array(bytes).buffer);
   const source = window.syntheticMic.createBufferSource(); source.buffer=buffer; source.connect(window.micDestination);
   const samples=buffer.getChannelData(0); let last=samples.length-1; while(last>0 && Math.abs(samples[last])<0.01) last--;
   window.voiceTiming.push({type:'caller-audio',at:Date.now(),speechEndsAt:Date.now()+last/buffer.sampleRate*1000});
   await new Promise(resolve => {source.onended=resolve; source.start();});
 }, bytes);
}
async function hear(pattern) {
 await page.getByRole('log').getByText(pattern).last().waitFor({timeout:45000});
 await page.waitForTimeout(1500);
 await page.waitForFunction(()=>!window.botSpeaking,{},{timeout:30000});
 await page.waitForTimeout(1000);
 console.log('Observed:',(await page.getByRole('log').innerText()).slice(-400));
}
try {
 await page.route('**/api/runtime/call',async route=>{const response=await route.fetch({url:process.env.VOICE_OFFER_URL || 'http://127.0.0.1:7860/test/offer'}); await route.fulfill({response});});
 await page.goto(process.env.VOICE_FRONTEND_URL || 'http://localhost:3000');
 await click('Add step');
 await page.getByLabel('Step name').fill('insurance');
 await page.getByLabel('Conversation goal',{exact:true}).fill('Ask which insurance provider the caller has. Wait for their answer. Once the insurance provider is known, call the available transition function to proceed to appointment times.');
 await page.getByRole('form',{name:'Add step',exact:true}).getByRole('button',{name:'Add step',exact:true}).click();
 await page.getByLabel('Message 1 instructions').fill('Ask which insurance provider the caller has. Wait for their answer. Once the insurance provider is known, call the available transition function to proceed to appointment times.');
 await click('Connections');
 await page.getByText('New transition',{exact:true}).click();
 await page.getByLabel('New transition condition',{exact:true}).fill('Once the caller has provided their insurance provider, record it and continue to appointment times.');
 await page.getByLabel('New transition target',{exact:true}).selectOption('offer_times');
 await click('Add transition');
 await page.getByText('Function details',{exact:true}).click();
 await page.getByText('Edit collected fields',{exact:true}).click();
 await page.getByLabel('Collected fields JSON').fill(JSON.stringify({properties:{insurance:{type:'string',description:'The caller insurance provider.'}},required:['insurance']}));
 await click('Agent overview');
 await page.getByRole('button',{name:/^Collect details /}).click();
 await click('Connections');
 await page.getByRole('combobox',{name:'Target node',exact:true}).selectOption('insurance');
 await click('Save');
 await page.getByRole('status').getByText('Changes saved',{exact:true}).waitFor();
 await click('Test Call'); await click('Start call');
 await page.getByText('Call connected',{exact:true}).waitFor({timeout:45000});
 await hear(/appointment.*\?|book.*\?|help.*\?/i);
 result.beforeSilence = await page.getByRole('log').innerText();
 await page.waitForTimeout(10000);
 result.afterSilence = await page.getByRole('log').innerText();
 result.waitedThroughSilence = result.beforeSilence === result.afterSilence;
 await speak('book');
 await hear(/name|full name/i);
 if (scenario === 'correction') {
   await speak('name');
   await hear(/reason|visit|bring/i);
   await speak('correction');
 } else await speak('details');
 await hear(/insurance.*\?/i); await speak('insurance');
 if (scenario === 'correction') {
   await page.waitForFunction(() => window.botSpeaking, {}, {timeout:45000});
   result.interruptionAt = Date.now();
   await speak('interrupt');
   await hear(/repeat|again|insurance|Tuesday|Thursday/i);
 }
 await hear(/Tuesday|Thursday/i);
 result.beforeSlotSelection = await page.getByRole('log').innerText();
 await page.waitForTimeout(8000);
 result.afterSlotSilence = await page.getByRole('log').innerText();
 result.waitedForSlot = result.beforeSlotSelection === result.afterSlotSilence;
 await speak('time');
 await hear(/confirmed|scheduled|booked/i);
 result.transcript = await page.getByRole('log').innerText();
 result.timing = await page.evaluate(()=>window.voiceTiming);
 result.audio = await page.evaluate(async () => [...(await window.livePeers.at(-1).getStats()).values()].filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({bytesReceived:s.bytesReceived,packetsReceived:s.packetsReceived,totalAudioEnergy:s.totalAudioEnergy})));
 result.passed = result.waitedThroughSilence && result.waitedForSlot && /insurance/i.test(result.transcript) && /Tuesday/i.test(result.transcript) && result.audio.some(s=>s.totalAudioEnergy>0);
 result.reviewRequired = 'Review corrections, routing and interruption timing in raw events; this flag checks only call completion and silence.';
} catch(error) { result.error=error.message; result.transcript=await page.getByRole('log').innerText().catch(()=> ''); result.screen=await page.locator('main').innerText().catch(()=> ''); }
finally {
 result.timing = await page.evaluate(()=>window.voiceTiming).catch(()=>[]);
 const turns = result.timing.filter(e=>e.type==='caller-audio');
 result.latency = turns.map((e,i)=>{
   const end = turns[i+1]?.at ?? Infinity;
   const events = result.timing.filter(a=>a.at>=e.at && a.at<end);
   const audio = events.find(a=>a.type==='received-audio' && a.at>e.speechEndsAt);
   const stt = events.find(a=>a.type==='user-transcription' && a.data?.final);
   return {callerText:stt?.data?.text, endToAudioMs:audio?Math.round(audio.at-e.speechEndsAt):null,
     endToFinalTranscriptMs:stt?Math.round(stt.at-e.speechEndsAt):null,
     modelCalls:events.filter(a=>['bot-llm-started','bot-llm-stopped'].includes(a.type)),
     providerMetrics:events.filter(a=>a.type==='metrics' && Object.keys(a.data||{}).length),
     caveat:'Received audio energy is a browser playback proxy; overlapping speech is not response latency.'};
 });
 await page.getByRole('button',{name:'End call',exact:true}).click().catch(()=>{});
 await browser.close();
 fs.writeFileSync(`${root}/evals/results/voice-stability/${attempt}.json`,JSON.stringify(result,null,2),{flag:'wx'});
 if (result.error || !result.passed) process.exitCode = 1;
 console.log(JSON.stringify({passed:result.passed,error:result.error,transcript:result.transcript,audio:result.audio,latency:result.latency},null,2));
}
