import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('Asset Studio validates the favicon while Ficha and Pre-Sell trust that check',async()=>{
  const server=await readFile(new URL('../scripts/serve-panel.ps1',import.meta.url),'utf8');
  const plan=server.slice(server.indexOf('function Get-PresellBatchPlan'),server.indexOf('function Invoke-PresellBatchValidation'));
  assert.match(plan,/foreach\s*\(\$asset in @\('01\.png','02\.png'\)\)/,'o pré-voo do lote só checa os assets de página 01 e 02');
  assert.doesNotMatch(plan,/03\.png/,'o pré-voo não duplica a checagem do favicon na origem');
  const producer=await readFile(new URL('../presell-engine/tools/New-PresellFromFicha.ps1',import.meta.url),'utf8');
  assert.match(producer,/if \(-not \$skipFavicon -and -not \$AssetStudioValidated\) \{ \$requiredAssetNames \+= '03\.png' \}/,'o motor só deixa de exigir 03.png quando o Hub recebe a confirmação do Asset Studio');
  assert.match(producer,/if \(\$skipFavicon\) \{/,'a escolha Sem favicon continua sendo respeitada na geração');
  const workflow=await readFile(new URL('../presell-engine/tools/Invoke-PresellWorkflow.ps1',import.meta.url),'utf8');
  assert.match(workflow,/Get-AssetStudioValidatedArguments/,'o fluxo de validação propaga a confirmação recebida do Asset Studio');
  assert.match(workflow,/\$productionArgs = .*Get-AssetStudioValidatedArguments/,'a geração pelo workflow também recebe essa confirmação');
  const assetStudio=await readFile(new URL('../src/asset-studio/app.js',import.meta.url),'utf8');
  assert.match(assetStudio,/\(state\.favicon \|\| state\.skipFavicon\)/,'o Asset Studio continua exigindo favicon escolhido ou a opção explícita Sem favicon');
  assert.match(assetStudio,/if \(!state\.skipFavicon\) outputs\.push\(\{ spec: specs\.favicon/,'o Asset Studio continua salvando o favicon quando selecionado');
  for(const call of [
    /-ValidateOnly\s+-AssetStudioValidated/,
    /-TemplateRoot \$templateRoot\s+-AssetStudioValidated/,
    /-AssetFolder \$assetFolder\s+-AssetStudioValidated\s+-Json/
  ])assert.match(server,call,'as rotas da Ficha e Pre-Sell devem confiar na validação do Asset Studio');
});
