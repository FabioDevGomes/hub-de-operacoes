import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const producer=await readFile(new URL('../presell-engine/tools/New-PresellFromFicha.ps1',import.meta.url),'utf8');
const rules=JSON.parse(await readFile(new URL('../presell-engine/config/presell-rules.json',import.meta.url),'utf8'));

assert.equal(rules.visualRules.preserveMobileBackgroundFramingWhenDetailsOpen,true);
assert.equal(rules.visualRules.mobileBackgroundSizing,'width-locked');
assert.equal(rules.visualRules.expandedDetailsSurface,'neutral-gray');
assert.match(producer,/@media \(max-width: 767px\)[\s\S]*background-size: 100% auto;/);
assert.equal(rules.templateIdentifiers.detailsId,'offer-details');
assert.match(producer,/#\$\{detailsId\} \.faq-content \{[\s\S]*background: rgba\(242, 244, 246, 0\.98\);[\s\S]*color: #1f2933;/);

console.log('presell responsive background ok');
