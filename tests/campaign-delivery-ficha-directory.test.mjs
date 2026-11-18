import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canApplyDetectedValue} from '../src/copy-ficha/copy-ficha-view.mjs';

const view=await readFile(new URL('../src/copy-ficha/copy-ficha-view.mjs',import.meta.url),'utf8');
assert.ok(view.includes('getCampaignDeliveryAssetStudioPageDirectory(delivery)'),'a Ficha lê o diretório persistido no registro da Entrega');
assert.ok(view.includes('delivery:${id}:${assetStudioDirectory}'),'o handoff persistido recebe identidade estável por entrega e diretório');
assert.ok(view.includes('normalizeProduct(handoff.productName)!==normalizeProduct(delivery.productName)'),'a Ficha rejeita o handoff temporário de outro produto');
assert.ok(view.includes('applyAssetStudioPageDirectory(root,{id:`delivery:${id}:${assetStudioDirectory}`,directory:assetStudioDirectory,productName:deliveryProduct})'),'o caminho persistido segue a mesma rotina que atualiza e salva o campo de destino');

const manualDestination={id:'copyDestination',value:'C:\\presell\\manual\\pag01',dataset:{},classList:{add(){}}};
assert.equal(canApplyDetectedValue(manualDestination,'C:\\presell\\VenoPlus 8\\pag01'),false,'preserva um destino editado manualmente');
manualDestination.dataset.autoFilled='true';
assert.equal(canApplyDetectedValue(manualDestination,'C:\\presell\\VenoPlus 8\\pag01'),true,'permite atualizar um destino anterior que ainda era automático');

const publishedView=await readFile(new URL('../dist/copy-ficha/copy-ficha-view.mjs',import.meta.url),'utf8');
const publishedDirectoryStore=await readFile(new URL('../dist/campaign-delivery/delivery-store.mjs',import.meta.url),'utf8');
const publishedShell=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const sourceShell=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
assert.ok(publishedView.includes('getCampaignDeliveryAssetStudioPageDirectory(delivery)'),'a Ficha publicada consulta o diretório persistido');
assert.ok(publishedDirectoryStore.includes('export function getCampaignDeliveryAssetStudioPageDirectory'),'o build publica a leitura do diretório da entrega');
const viewImport=sourceShell.match(/copy-ficha\/copy-ficha-view\.mjs\?v=\d+/)?.[0];
assert.ok(viewImport && publishedShell.includes(viewImport),'a página principal publica a versão atual da view');

console.log('campaign-delivery-ficha-directory.test.mjs: ok');
