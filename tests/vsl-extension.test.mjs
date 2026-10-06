import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isVslRate, isVslPage, VSL_RATES } from '../extensions/mcc-d0-bridge/vsl-domain.mjs';
import { controlVslSpeed } from '../extensions/mcc-d0-bridge/vsl-controller.mjs';
import { mountVslSpeed } from '../extensions/mcc-d0-bridge/vsl-popup.mjs';

assert.deepEqual(VSL_RATES, [1,10,20,30]);
for (const rate of VSL_RATES) assert.ok(isVslRate(rate));
for (const rate of ['10', 16, 0, 100, NaN, null]) assert.equal(isVslRate(rate), false);
assert.ok(isVslPage('https://example.com/vsl'));
for (const url of ['chrome://extensions', 'file:///private.html', 'javascript:alert(1)', 'bad']) assert.equal(isVslPage(url),false);

const rect = () => ({ width:640, height:360 });
function nativeVideo(overrides = {}) {
  let rate = 1;
  return { tagName:'VIDEO', isConnected:true, duration:120, currentTime:5, paused:false, ended:false,
    muted:false, defaultPlaybackRate:1, readyState:4, seeking:false, getBoundingClientRect:rect,
    get playbackRate() { return rate; }, set playbackRate(value) {
      if (value > 16) throw new Error('NotSupportedError');
      rate = value;
    }, ...overrides };
}
function root(videos = [], players = [], extra = []) {
  return { querySelectorAll:selector => selector === 'video' ? videos : selector === 'vturb-smartplayer' ? players : [...videos,...players,...extra] };
}
function fixture(document) {
  let time = 0, sequence = 0;
  const intervals = new Map();
  const window = {};
  const context = vm.createContext({ document, window, performance:{now:()=>time},
    setTimeout, clearTimeout,
    setInterval:callback => { intervals.set(++sequence,callback); return sequence; },
    clearInterval:id => intervals.delete(id)
  });
  const run = vm.runInContext(`(${controlVslSpeed.toString()})`,context);
  return { run, window, intervals, tick:async ms => {
    time += ms;
    for (const callback of [...intervals.values()]) await callback();
  } };
}
const video = nativeVideo(), f = fixture(root([video]));
assert.equal((await f.run(10)).verified,true);
assert.equal(video.playbackRate,10);
assert.equal(video.defaultPlaybackRate,10);
assert.equal(f.intervals.size,0);
assert.equal((await f.run(20)).mode,'skip');
assert.equal(video.playbackRate,1,'20× não passa valor nativo inválido nem reduz silenciosamente para 16×');
assert.equal(video.muted,true);
await f.tick(500);
assert.equal(video.currentTime,14.5,'salto adiciona 19× 0,5s à reprodução base em 1×');
video.paused = true;
await f.tick(5000);
assert.equal(video.currentTime,14.5,'pausa não avança');
video.paused = false; video.seeking = true;
await f.tick(500);
assert.equal(video.currentTime,14.5,'não empilha saltos durante seek');
video.seeking = false;
await f.run(30);
assert.equal(f.intervals.size,1,'troca de velocidade não duplica timer');
await f.tick(500);
assert.equal(video.currentTime,29);
assert.equal((await f.run(null,'read')).rate,30,'reabrir popup consulta modo ativo');
await f.run(1);
assert.equal(f.intervals.size,0);
assert.equal(video.playbackRate,1);
assert.equal(video.muted,false,'restaura áudio anterior, inclusive ao trocar 20× por 30×');
await f.tick(500);
assert.equal(video.currentTime,29,'1× elimina futuros saltos');
await f.run(20);
await f.tick(10000);
assert.equal(video.currentTime,48,'aba em segundo plano não provoca salto gigante');
video.currentTime = 119;
await f.tick(500);
assert.equal(video.currentTime,120,'limite da duração');
await f.tick(500);
assert.equal(f.intervals.size,0);
assert.equal(video.muted,false);
const muted = nativeVideo({muted:true}), mutedFixture = fixture(root([muted]));
await mutedFixture.run(30); await mutedFixture.run(1);
assert.equal(muted.muted,true,'não ativa áudio que o usuário havia silenciado');
assert.equal((await fixture(root()).run(10)).ok,false);
assert.equal((await fixture(root([nativeVideo({duration:NaN})])).run(10)).ok,false);
assert.equal((await f.run(16)).ok,false);

// A função serializada tem acesso apenas aos DOMs abertos/same-origin.
const nested = nativeVideo();
const inaccessible = { tagName:'IFRAME', get contentDocument() { throw new Error('SecurityError'); } };
const frame = {tagName:'IFRAME',contentDocument:root([nested])};
const nestedFixture = fixture(root([],[],[inaccessible,{shadowRoot:root([],[],[frame])}]));
assert.equal((await nestedFixture.run(10)).ok,true);
assert.equal(nested.playbackRate,10);

const calls = [];
const vturb = { tagName:'VTURB-SMARTPLAYER', isConnected:true, duration:120, currentTime:2,
  paused:false, volume:.7, getBoundingClientRect:rect,
  speed:async rate => calls.push(['speed',rate]),
  seek:async time => { calls.push(['seek',time]); vturb.currentTime = time; },
  setVolume:volume => { calls.push(['volume',volume]); vturb.volume = volume; } };
const vt = fixture(root([],[vturb]));
assert.equal((await vt.run(10)).verified,false,'API sem getter não recebe confirmação falsa');
const jump = await vt.run(30);
assert.equal(jump.ok,true);
assert.equal(jump.mode,'skip');
assert.equal(vturb.volume,0);
await vt.tick(500);
assert.equal(vturb.currentTime,16.5);
await vt.run(1);
assert.equal(vturb.volume,.7);
assert.equal(vt.intervals.size,0);
vturb.seek = async () => { throw new Error('Denied'); };
await vt.run(20); await vt.tick(500);
assert.equal(vt.intervals.size,0);
assert.equal(vturb.volume,.7);
assert.equal((await vt.run(null,'read')).ok,false);
vturb.speed = async () => { throw new Error('Player refused'); };
assert.match((await vt.run(10)).message,/refused/);

function element() {
  const attrs = {}, classes = new Set();
  return { disabled:false, textContent:'', attrs, classes,
    setAttribute:(key,value) => { attrs[key]=value; },
    classList:{toggle:(name,on)=>on ? classes.add(name) : classes.delete(name)},
    addEventListener(type,handler) { this[type]=handler; } };
}
const nodes = Object.fromEntries([...VSL_RATES.map(rate=>[`#vsl-speed-${rate}`,element()]),['#vsl-status',element()]]);
let reply = {ok:true,result:{ok:true,rate:10,verified:true,message:'10× aplicado.'}}, resolveRead, resolveSet;
const requests = [], disabled = [];
mountVslSpeed({document:{querySelector:selector=>nodes[selector]}, setDisabled:value=>{
  disabled.push(value); for (const rate of VSL_RATES) nodes[`#vsl-speed-${rate}`].disabled=value;
}, sendMessage:message=>{
  requests.push(message);
  return message.type === 'READ_ACTIVE_VSL_SPEED' ? new Promise(resolve=>{resolveRead=resolve;}) : Promise.resolve(reply);
}});
await nodes['#vsl-speed-10'].click();
assert.equal(requests[1].rate,10);
assert.equal(nodes['#vsl-speed-10'].attrs['aria-pressed'],'true');
resolveRead({ok:true,result:{ok:true,rate:1,verified:true}});
await Promise.resolve();
assert.equal(nodes['#vsl-speed-10'].attrs['aria-pressed'],'true','consulta antiga não sobrepõe clique recente');
reply = {ok:false,result:{ok:false,message:'Bloqueado <b>texto</b>'}};
await nodes['#vsl-speed-20'].click();
assert.equal(nodes['#vsl-status'].textContent,'Bloqueado <b>texto</b>','erro não vira HTML');
assert.ok(nodes['#vsl-status'].classes.has('error'));
assert.equal(nodes['#vsl-speed-20'].attrs['aria-pressed'],'false');
reply = new Promise(resolve=>{resolveSet=resolve;});
const pending = nodes['#vsl-speed-30'].click();
await nodes['#vsl-speed-1'].click();
assert.equal(requests.at(-1).rate,30,'concorrência bloqueada');
resolveSet({ok:true,result:{ok:true,rate:30,verified:true,message:'Saltos 30×.'}});
await pending;
assert.equal(nodes['#vsl-speed-30'].attrs['aria-pressed'],'true');
assert.equal(disabled.at(-1),false);

// Abrir o popup numa aba sem player não mostra alerta; ao solicitar velocidade,
// o mesmo problema continua sendo informado como feedback da ação explícita.
const passiveNodes = Object.fromEntries([...VSL_RATES.map(rate=>[`#vsl-speed-${rate}`,element()]),['#vsl-status',element()]]);
const noPlayer = {ok:false,result:{ok:false,message:'Nenhuma VSL acessível nesta aba.'}};
mountVslSpeed({document:{querySelector:selector=>passiveNodes[selector]},setDisabled:()=>{},sendMessage:()=>Promise.resolve(noPlayer)});
await Promise.resolve();
assert.equal(passiveNodes['#vsl-status'].textContent,'','não avisa automaticamente em páginas sem VSL');
assert.equal(passiveNodes['#vsl-status'].classes.has('error'),false);
await passiveNodes['#vsl-speed-10'].click();
assert.equal(passiveNodes['#vsl-status'].textContent,'Nenhuma VSL acessível nesta aba.','avisa após pedido explícito de velocidade');
assert.equal(passiveNodes['#vsl-status'].classes.has('error'),true);

// Roteamento real do service worker, API Chrome simulada sem conta/dados.
const extension = new URL('../extensions/mcc-d0-bridge/',import.meta.url);
const worker = await readFile(new URL('background.js',extension),'utf8');
let listener, injection, active = {id:99,url:'https://example.com/vsl'};
const context = vm.createContext({URL,isVslRate,isVslPage,controlVslSpeed,
  chrome:{runtime:{onMessage:{addListener:fn=>{listener=fn;}}},
    tabs:{query:async()=>[active]}, scripting:{executeScript:async options=>{
      injection=options; return [{result:{ok:true,rate:options.args[0],verified:true}}];
    }} }
});
vm.runInContext(worker.replace(/^import .*?;\s*/gm,''),context);
const request = message => new Promise(resolve=>assert.equal(listener(message,null,resolve),true));
assert.ok((await request({type:'SET_ACTIVE_VSL_SPEED',rate:20})).ok);
assert.equal(injection.world,'MAIN');
assert.equal(injection.target.tabId,99);
assert.equal(injection.func,controlVslSpeed);
assert.deepEqual([...injection.args],[20,'set']);
injection = null;
assert.equal((await request({type:'SET_ACTIVE_VSL_SPEED',rate:'30'})).ok,false);
assert.equal(injection,null);
active = {id:99,url:'chrome://extensions'};
assert.equal((await request({type:'SET_ACTIVE_VSL_SPEED',rate:10})).ok,false);
assert.equal(injection,null);
const manifest = JSON.parse(await readFile(new URL('manifest.json',extension),'utf8'));
assert.deepEqual(manifest.permissions,['scripting','activeTab','clipboardWrite']);
assert.deepEqual(manifest.host_permissions,['http://127.0.0.1:8765/preparador-MCC/*','http://127.0.0.1:8765/curadoria/clickbank-top-offers/*']);
console.log('VSL extension: velocidades, saltos autorizados, pausa, fim, áudio, frames, VTurb, popup e worker em memória.');
