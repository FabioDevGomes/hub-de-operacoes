import {parseSmartAdvOffersClipboard} from './smartadv-offers-domain.mjs?v=3';

const rows = [
  ['17962', '! HOT OFFER - MeltPeak Weight Management [DE,AT,CH] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Diet'],
  ['17922', '! HOT OFFER - SodaPeak ME - DTC [US] (Native,Social,SEO,Search,Banner) - CPA {No BrandBidding}', 'Male Enhancement'],
  ['17897', '! HOT OFFER - MyoGlow Skin Tightener [US] (Social,Banner,Native,Push,SEO,Search) - CPA {No BrandBidding}', 'Beauty'],
  ['17896', '! HOT OFFER - Dr. Melasmin Calcium Stick [US] (Social,Banner,Native,Push,SEO,Search) - CPA {No BrandBidding}', 'Beauty'],
  ['17648', '! HOT OFFER - Kinzeno V2 Magnetic Gel Roller [INTL] (Banner,Native,Social,Search,SEO) - CPA {No BrandBidding}', 'Health'],
  ['17632', '! HOT OFFER - ForceVital ME [FR,LU,BE] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Male Enhancement'],
  ['17620', '! HOT OFFER - Katori Titanium Cutting Board - Product Page [INTL] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Ecommerce / Retail / Survival'],
  ['17583', '! HOT OFFER - HorseFil Male Vitality Formula DTC [US] (Native,Social,SEO,Search,Banner,Brand Bidding) - CPA', 'Male Enhancement'],
  ['17354', '! HOT OFFER - Wilder Leaf Organic Hemp [AU] (Banner,Native,Social,Search,SEO,PPC,Push,Brand Bidding,Shopping) - CPA', 'Health'],
  ['17353', '! HOT OFFER - AltBurn KETO Capsules [AU] (Banner,Native,Social,Search,SEO,PPC,Push,Brand Bidding,Shopping) - CPA', 'Health'],
  ['17139', '! HOT OFFER - ForceVital ME - VSL [DE,AT,CH] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Male Enhancement'],
  ['17131', '! HOT OFFER - Kinzeno Joint Pain Massage Gel [INTL] (Banner,Native,Social,Search,SEO) - CPA {No BrandBidding}', 'Ecommerce / Retail / Survival'],
  ['16847', '! HOT OFFER - Melara Air Pillow [INTL] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Ecommerce / Retail / Survival'],
  ['16690', '! HOT OFFER - Melara Max Pillow [INTL] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Ecommerce / Retail / Survival'],
  ['15501', '! HOT OFFER - Derila ERGO Memory Foam Pillow [INTL] (Banner,Native,Social,Search,SEO) - CPA {No BrandBidding}', 'Sleep & Productivity'],
  ['14697', '! HOT OFFER - Stopwatt Electricity-Saving Box [US,CA,AU,NZ,FR,MX,UK] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA', 'Ecommerce / Retail / Survival'],
];

const parsed = parseSmartAdvOffersClipboard([
  'ID\tName\tVertical',
  ...rows.map(row => row.join('\t')),
].join('\n'));

if (!parsed.valid || parsed.offers.length !== rows.length) {
  throw new Error('A captura inicial SmartAdv não passou pela validação do parser.');
}

export function createInitialCapture() {
  return {
    captureId: 'smartadv-user-provided-initial',
    capturedAt: new Date().toISOString(),
    sourceLabel: 'Lista enviada no pedido · data/hora original não informadas',
    sourceFormat: parsed.sourceFormat,
    coverage: parsed.coverage,
    offers: parsed.offers,
  };
}
