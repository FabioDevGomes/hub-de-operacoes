import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const engine=process.env.PRESELL_TEST_ENGINE || fileURLToPath(new URL('../presell-engine/',import.meta.url));
const rules=JSON.parse(readFileSync(join(engine,'config/presell-rules.json'),'utf8'));

test('pre-sell normalizes legacy technical identifiers without changing offer content', {skip:process.platform!=='win32'},()=>{
  assert.equal(rules.templateIdentifiers.detailsId,'offer-details');
  const root=mkdtempSync(join(tmpdir(),'presell-identifiers-test-'));
  // All destinations are new, synthetic fixtures; no existing product is touched.
  try {
    const ficha={
      htmlLanguage:'en-US',countryCode:'US',pageTitle:'ExampleBoard offer',
      affiliateUrl:'https://example.com/offer',assetFolder:'background',
      cookieTitle:'Offer',cookieText:'Read the offer details.',acceptLabel:'Accept',declineLabel:'Decline',
      closeAriaLabel:'Close',detailsLabel:'View Offer Details',faqTitle:'Frequently Asked Questions',
      offerMainTitle:'ExampleBoard',offerIntro:'Confirmed offer text stays unchanged.',
      offerOverviewTitle:'Offer overview',offerOverviewText:'An example with no health claims.',
      priceTitle:'Discount details',priceText:'Save 50%.',
      shippingGuaranteeTitle:'Shipping and guarantee',shippingGuaranteeText:'30-Day Guarantee.',
      faqs:Array.from({length:4},(_,i)=>({question:`Question ${i+1}?`,answer:`Answer ${i+1}.`})),
      mustContain:['ExampleBoard','Save 50%.','30-Day Guarantee.'],mustNotContain:[],pending:[]
    };
    const fichaPath=join(root,'ficha.json');
    writeFileSync(fichaPath,JSON.stringify(ficha));
    const templates={
      'index.html':`<!doctype html><html lang="{{HTML_LANG}}"><head><title>{{PAGE_TITLE}}</title><link rel="icon" href="./background/03.png"><link rel="stylesheet" href="./styles.css"></head><body data-country="{{COUNTRY_CODE}}"><a href="{{AFFILIATE_URL}}">{{COOKIE_TITLE}}</a><p>{{COOKIE_TEXT}}</p><a href="#glp-faq" aria-controls="glp-faq">Offer section</a><details id="glp-faq"><summary class="faq-link">{{DETAILS_LABEL}}</summary><div class="faq-content"><h1>{{OFFER_MAIN_TITLE}}</h1><p>{{OFFER_INTRO}}</p><h2>{{OFFER_OVERVIEW_TITLE}}</h2><p>{{OFFER_OVERVIEW_TEXT}}</p><h2>{{PRICE_TITLE}}</h2><p>{{PRICE_TEXT}}</p><h2>{{SHIPPING_GUARANTEE_TITLE}}</h2><p>{{SHIPPING_GUARANTEE_TEXT}}</p><h2>{{FAQ_TITLE}}</h2>${Array.from({length:4},(_,i)=>`<h3>{{FAQ_${i+1}_QUESTION}}</h3><p>{{FAQ_${i+1}_ANSWER}}</p>`).join('')}</div></details><script src="./scripts.js"></script></body></html>`,
      'styles.css':'#glp-faq .faq-content{display:none} #glp-faq[open] .faq-content{display:block} #glp-faq .faq-link{cursor:pointer}',
      'scripts.js':`const details=document.getElementById('glp-faq'); const content=document.querySelector('#glp-faq .faq-content'); details.addEventListener('toggle',()=>{content.dataset.expanded=String(details.open);});`
    };
    function run(script,args){
      return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(engine,'tools',script),...args],{encoding:'utf8'}).trim();
    }
    function generate(name,neutral=false){
      const template=join(root,`${name}-template`),destination=join(root,name);
      mkdirSync(template);mkdirSync(join(destination,'background'),{recursive:true});
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
      for(const asset of ['01.png','02.png','03.png'])writeFileSync(join(destination,'background',asset),png);
      for(const [file,content] of Object.entries(templates))writeFileSync(join(template,file),neutral?content.replaceAll('glp-faq','offer-details'):content);
      // An empty destination is expected to fail initial structural validation.
      let initial;
      try { run('Test-PresellStructure.ps1',['-Destination',destination,'-Json']); }
      catch(error){ initial=JSON.parse(error.stdout); }
      assert.equal(initial?.overall,'BLOCKED');
      run('New-PresellFromFicha.ps1',['-Destination',destination,'-FichaPath',fichaPath,'-TemplateRoot',template]);
      return destination;
    }
    const legacy=generate('legacy'),neutral=generate('neutral',true);
    for(const file of Object.keys(templates)){
      const actual=readFileSync(join(legacy,file),'utf8');
      assert.doesNotMatch(actual,/glp/i);
      assert.match(actual,/offer-details/);
      assert.equal(actual,readFileSync(join(neutral,file),'utf8'),`${file}: only technical identifiers should differ in source templates`);
    }
    assert.match(readFileSync(join(legacy,'index.html'),'utf8'),/href="#offer-details" aria-controls="offer-details"/);
    assert.match(readFileSync(join(legacy,'styles.css'),'utf8'),/#offer-details\[open\] \.faq-content/);
    for(const [script,args] of [
      ['Test-PresellStructure.ps1',[]],
      ['Test-PresellAgainstFicha.ps1',['-FichaPath',fichaPath]]
    ]){
      const report=JSON.parse(run(script,['-Destination',legacy,...args,'-Json']));
      assert.equal(report.overall,'PASS',JSON.stringify(report));
    }
    // Factual text is inserted AFTER normalization, not filtered or concealed.
    ficha.offerIntro='A literal glp-faq reference supplied in factual content.';
    writeFileSync(fichaPath,JSON.stringify(ficha));
    const factual=generate('factual');
    assert.match(readFileSync(join(factual,'index.html'),'utf8'),/A literal glp-faq reference supplied in factual content\./);
    assert.match(readFileSync(join(factual,'index.html'),'utf8'),/<details id="offer-details">/);
    // Three FAQs omit the fourth placeholder pair; legacy four-FAQ fichas still render.
    assert.deepEqual(rules.acceptedFaqCounts,[3,4]);
    ficha.faqs=ficha.faqs.slice(0,3);
    writeFileSync(fichaPath,JSON.stringify(ficha));
    const three=generate('three-faqs');
    const html=readFileSync(join(three,'index.html'),'utf8');
    assert.equal((html.match(/<h3>/g)||[]).length,3);
    assert.doesNotMatch(html,/Question 4|Answer 4|\{\{FAQ_/);
    for(const [script,args] of [
      ['Test-PresellStructure.ps1',[]],
      ['Test-PresellAgainstFicha.ps1',['-FichaPath',fichaPath]]
    ])assert.equal(JSON.parse(run(script,['-Destination',three,...args,'-Json'])).overall,'PASS');
  } finally {
    assert.equal(resolve(root).startsWith(resolve(tmpdir())+'\\'),true);
    assert.match(root,/presell-identifiers-test-[^\\/]+$/);
    rmSync(root,{recursive:true,force:true});
  }
});
