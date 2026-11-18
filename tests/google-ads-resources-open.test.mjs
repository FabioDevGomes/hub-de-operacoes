import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID,
  GOOGLE_ADS_RESOURCES_PILOT_URL,
  googleAdsResourcesPilotHref,
} from '../src/google-ads/google-ads-resources-pilot.mjs';
import { googleAdsAccountAssetsHref } from '../src/google-ads/google-ads-account-assets-link.mjs';
import {
  googleAdsResourcesUrlForAccount,
  retryGoogleAdsAccountSelection,
  selectGoogleAdsAccountFromChooser,
} from '../extensions/hub-2.0/google-ads-resources-page.mjs';

assert.equal(GOOGLE_ADS_RESOURCES_PILOT_ACCOUNT_ID, '7617569737');
assert.equal(GOOGLE_ADS_RESOURCES_PILOT_URL, 'https://ads.google.com/aw/assetreport/associations?ocid=8567605878&workspaceId=0&assetType=all&euid=1595241083&__u=7535994467&uscid=8567605878&__c=5126180422&authuser=4');
assert.equal(googleAdsResourcesPilotHref('7617569737'), GOOGLE_ADS_RESOURCES_PILOT_URL);
assert.equal(googleAdsResourcesPilotHref('761-756-9737'), GOOGLE_ADS_RESOURCES_PILOT_URL);
assert.equal(googleAdsResourcesPilotHref('8567605878'), '');
assert.equal(googleAdsResourcesPilotHref(''), '');
assert.equal(googleAdsResourcesUrlForAccount('7617569737'), GOOGLE_ADS_RESOURCES_PILOT_URL);
for (const accountId of ['4404265713', '7957548119', '1748218568']) {
  assert.equal(googleAdsResourcesUrlForAccount(accountId), googleAdsAccountAssetsHref(accountId), `usa a URL já gerada pelo Hub para ${accountId}`);
}
assert.equal(googleAdsResourcesUrlForAccount('not-an-account'), '');
{
  let now = 0;
  let attempts = 0;
  const result = await retryGoogleAdsAccountSelection(async () => {
    attempts += 1;
    return attempts < 3 ? { state: 'account-not-found' } : { state: 'selected', accountId: '4404265713' };
  }, {
    timeoutMs: 1000,
    intervalMs: 100,
    now: () => now,
    wait: async ms => { now += ms; },
  });
  assert.deepEqual(result, { state: 'selected', accountId: '4404265713' });
  assert.equal(attempts, 3, 'repete a busca enquanto a lista de contas ainda não foi renderizada');
}
{
  let now = 0;
  let attempts = 0;
  const result = await retryGoogleAdsAccountSelection(async () => {
    attempts += 1;
    return { state: 'account-not-found' };
  }, {
    timeoutMs: 250,
    intervalMs: 100,
    now: () => now,
    wait: async ms => { now += ms; },
  });
  assert.deepEqual(result, { state: 'account-not-found' });
  assert.equal(attempts, 3, 'encerra após o tempo limite sem continuar tentando');
}
assert.deepEqual([...new URL(GOOGLE_ADS_RESOURCES_PILOT_URL).searchParams.entries()], [
  ['ocid', '8567605878'], ['workspaceId', '0'], ['assetType', 'all'], ['euid', '1595241083'],
  ['__u', '7535994467'], ['uscid', '8567605878'], ['__c', '5126180422'], ['authuser', '4'],
]);

class FakeElement {
  constructor({ text = '', tag = 'button', role = '', onClick = null } = {}) {
    this.textContent = text;
    this.tagName = tag.toUpperCase();
    this.role = role;
    this.onClick = onClick;
  }
  getClientRects() { return [{}]; }
  closest(selector) {
    const selectors = selector.split(',').map(item => item.trim());
    return selectors.includes(this.tagName.toLowerCase()) || selectors.includes(`[role="${this.role}"]`) ? this : null;
  }
  click() { this.onClick?.(); }
}

const originalDocument = globalThis.document;
const originalLocation = globalThis.location;
try {
  const chooserClicks = [];
  const chooserElements = [
    new FakeElement({ tag: 'a', text: '8119 - 2ª nutra .zinvero.shop 795-754-8119', onClick: () => chooserClicks.push('7957548119') }),
    new FakeElement({ tag: 'a', text: '1ª da MCC nutra .voltreva.shop 761-756-9737', onClick: () => chooserClicks.push('7617569737') }),
  ];
  globalThis.location = { pathname: '/nav/selectaccount' };
  globalThis.document = {
    body: { innerText: 'Selecionar uma conta do Google Ads' },
    querySelectorAll(selector) {
      if (selector === '*') return chooserElements;
      return chooserElements.filter(element => selector.split(',').some(candidate => candidate.trim() === element.tagName.toLowerCase()));
    },
  };
  assert.deepEqual(selectGoogleAdsAccountFromChooser('7617569737'), { state: 'selected', accountId: '7617569737' });
  assert.deepEqual(chooserClicks, ['7617569737'], 'seleciona somente a conta aprovada do piloto');
  assert.deepEqual(selectGoogleAdsAccountFromChooser('7957548119'), { state: 'selected', accountId: '7957548119' });
  assert.deepEqual(chooserClicks, ['7617569737', '7957548119'], 'nas outras contas, seleciona o ID do cartão clicado');

  globalThis.location = { pathname: '/aw/assetreport/associations' };
  globalThis.document = { ...globalThis.document, body: { innerText: 'Google Ads Recursos' } };
  assert.deepEqual(selectGoogleAdsAccountFromChooser('7617569737'), { state: 'not-account-chooser' });

  const delegatedRow = new FakeElement({ tag: 'div', text: '1ª da MCC nutra .voltreva.shop 761-756-9737', onClick: () => chooserClicks.push('delegated-7617569737') });
  globalThis.location = { pathname: '/nav/selectaccount' };
  globalThis.document = {
    body: { innerText: 'Select a Google Ads account' },
    querySelectorAll(selector) { return selector === '*' ? [delegatedRow] : []; },
  };
  assert.deepEqual(selectGoogleAdsAccountFromChooser('7617569737'), { state: 'selected', accountId: '7617569737' });
  assert.deepEqual(chooserClicks, ['7617569737', '7957548119', 'delegated-7617569737'], 'também aciona texto exato da linha com clique delegado');
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
}

const background = await readFile(new URL('../extensions/hub-2.0/background.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../extensions/hub-2.0/tab-bridge.js', import.meta.url), 'utf8');
const popup = await readFile(new URL('../extensions/hub-2.0/popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../extensions/hub-2.0/popup.html', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
assert.match(background, /OPEN_GOOGLE_ADS_RESOURCES/);
assert.match(background, /ensureGoogleAdsBookmarkedPage/);
assert.match(background, /validatedGoogleAdsResourceUrl/);
assert.ok(background.includes('aw\\/campaigns'), 'a extensão aceita favoritos que apontam para Campanhas');
assert.match(background, /googleAdsResourcesUrlForAccount/);
assert.match(background, /retryGoogleAdsAccountSelection/);
assert.match(background, /após aguardar o carregamento da lista/);
assert.match(background, /args: \[accountId\]/);
assert.match(background, /selectGoogleAdsAccountFromChooser/);
assert.doesNotMatch(background, /applyGoogleAdsCampaignNameFilter|filterTerm/);
assert.match(bridge, /GOOGLE_ADS_RESOURCES_RESULT/);
assert.match(bridge, /campaignBookmarks/);
assert.match(bridge, /OPEN_GOOGLE_ADS_RESOURCES/);
assert.match(bridge, /accountId/);
assert.match(popup, /chrome\.permissions\.request\(\{ origins: \[googleAdsHostPermission\] \}, granted =>/);
assert.match(popup, /https:\/\/ads\.google\.com\/\*/);
assert.ok(popup.indexOf("authorizeGoogleAdsButton.addEventListener('click'") < popup.indexOf('chrome.permissions.contains('), 'o clique de autorização precede a consulta de estado');
assert.match(popup, /O Chrome não respondeu à solicitação/);
assert.match(popupHtml, /padding:\s*18px\s+18px\s+36px/);
assert.match(view, /createGoogleAdsResourcesBookmarkControl/);
assert.match(view, /openGoogleAdsResourcesViaExtension/);
assert.match(view, /resourceUrl: match\.bookmark\.url/);
assert.match(view, /Abrir recursos no Google Ads ↗/);
assert.match(view, /event\.preventDefault\(\)/, 'o clique normal mantém o encaminhamento pela extensão, sem navegação direta');
assert.match(view, /createGoogleAdsCampaignBookmarkControl/);
assert.match(view, /Link de campanhas não salvo para esta MCC\./);
assert.match(view, /actions\.append\(createGoogleAdsCampaignBookmarkControl\(group\?\.managerCustomerId\), downloadButton, expandButton\)/);
assert.match(view, /actions\.append\(createGoogleAdsCampaignBookmarkControl\(group\.managerCustomerId\), button\)/);
assert.doesNotMatch(view, /Abrir recursos da conta pelo Hub|Abrir recursos com filtro do produto/);

console.log('Google Ads resource links keep their supplied destinations and open through the extension, which selects the corresponding account when Google Ads shows its chooser.');
