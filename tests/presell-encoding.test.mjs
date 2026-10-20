import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const producer=await readFile(new URL('../presell-engine/tools/New-PresellFromFicha.ps1',import.meta.url),'utf8');
const server=await readFile(new URL('../scripts/serve-panel.ps1',import.meta.url),'utf8');
for(const relative of [
  '../presell-engine/modules/Presell.Validation.Common.psm1',
  '../presell-engine/tools/Invoke-PresellWorkflow.ps1',
  '../presell-engine/tools/Test-PresellAgainstFicha.ps1',
  '../presell-engine/tools/Test-PresellStructure.ps1',
  '../presell-engine/tools/New-PresellFromFicha.ps1',
  '../scripts/serve-panel.ps1'
]){
  const bytes=await readFile(new URL(relative,import.meta.url));
  assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf],`${relative} deve ter BOM UTF-8 para acentos no Windows PowerShell 5.1`);
}

assert.match(producer,/\[System\.IO\.File\]::ReadAllText\(\$FichaPath,\s*\[System\.Text\.Encoding\]::UTF8\)/,'o produtor deve decodificar a ficha explicitamente como UTF-8 no Windows PowerShell 5.1');
assert.doesNotMatch(producer,/Get-Content\s+-LiteralPath\s+\$FichaPath\s+-Raw/,'a leitura do JSON não pode depender da codificação padrão do PowerShell');
assert.match(server,/WriteAllText\(\$temporaryFicha,\s*\$fichaJson,\s*\[Text\.UTF8Encoding\]::new\(\$false\)\)/,'o servidor deve continuar gravando a ficha temporária como UTF-8 sem BOM');
assert.match(producer,/\$charsetMetaPattern\s*=\s*'[^']*charset[^']*'/,'a saída deve normalizar declarações de charset existentes no template');
assert.match(producer,/\$indexOutput\s*=\s*\$indexOutput\.Insert\([^\r\n]*<meta charset=`"UTF-8`">/,'a página gerada deve declarar UTF-8 no início do head');
assert.match(producer,/WriteAllText\(\(Join-Path \$stagingRoot 'index\.html'\),\s*\$indexOutput,\s*\[System\.Text\.UTF8Encoding\]::new\(\$false\)\)/,'o HTML gerado deve ser gravado em UTF-8 sem BOM');

console.log('presell UTF-8 input and output encoding ok');
