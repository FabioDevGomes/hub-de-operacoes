import assert from 'node:assert/strict';
import {test} from 'node:test';
import {productNameFromOfferTitle as productName} from '../src/curadoria/clickbank-top-offers/product-name.mjs';

test('extrai o produto de títulos promocionais sem um catálogo de nomes conhecido', () => {
  const examples = [
    ['NEW : Aurora Power System - Conversions Monster !', 'Aurora Power System'],
    ['LUNA SLEEP - The #1 Sleep Offer! Make upto $5 EPC', 'LUNA SLEEP'],
    ['DeltaCore - $4 EPC Doctor-Endorsed Formula', 'DeltaCore'],
    ['The Memory Song (Killer NEW Memory Offer)', 'The Memory Song'],
    ['Pure Water System: The 2026 Water Converter Breakthrough', 'Pure Water System'],
    ['FreshDrop - The Biggest Monster In The Niche', 'FreshDrop'],
    ['New Water Offer:ClearWaterBox-10%+ New VSL Killing It!!!', 'ClearWaterBox'],
    ['ClearSkin - Unique Dropper Offer', 'ClearSkin'],
    ['Mind One: New Memory Offer', 'Mind One'],
    ['Sound Plus - Top Brain and Hearing', 'Sound Plus'],
    ['The Focus Switch (BRAND-NEW!)', 'The Focus Switch'],
    ['Fresh Alpha [Best Converting] [Rebill] [2026 Updated]', 'Fresh Alpha'],
    ['Fresh Alpha - [2026 Updated]', 'Fresh Alpha'],
    ['Core Guard - Powerhouse Health Offer', 'Core Guard'],
    ['NEW All Day Herbal Tea - Our Top Affs Make $200 Per Sale!', 'All Day Herbal Tea'],
    ['CORE BOOST-New Explosive Health Offer-Crazy High CVR & AOV', 'CORE BOOST'],
    ['Core6 - Now Open To Everyone!', 'Core6'],
    ['Core Guard - New Monster In The Health Niche', 'Core Guard'],
    ['PrimeCore - Doctor-Endorsed Skin-Gut Gummies', 'PrimeCore'],
    ['NewEra Core – Diamond Seller for Women 40+ | $275 AOV', 'NewEra Core'],
    ["Aria Lunar's Bond Sketch BRAND NEW", "Aria Lunar's Bond Sketch"],
    ['Core Burn 2.0 now LIVE!', 'Core Burn 2.0'],
    ['Moon Guide - Interactive Reading that converts like CRAZY!', 'Moon Guide'],
    ['Shifting Paths: Manifestation Offer From CB Platinum Plus Vendor', 'Shifting Paths'],
    ['Core Guard| Heart Health Offer | Huge Market', 'Core Guard'],
    ['Hidden Wealth - Brand-New Wealth Angle CB TOP Performer', 'Hidden Wealth'],
    ['City Wealth Secret - Brand-New Forbidden Wealth Angle Going Viral', 'City Wealth Secret'],
  ];
  for (const [input, expected] of examples) assert.equal(productName(input), expected, input);
});

test('nome após criador exige evidência do vendedor e da categoria do produto', () => {
  assert.equal(productName('Aria Vale | Bond Sketch [Best Converting] [Rebill]', 'ARIAVS'), 'Bond Sketch');
  assert.equal(productName('Aria Vale | Bond Sketch', 'UNRELATED'), 'Aria Vale | Bond Sketch');
  assert.equal(productName('Alpha System | Extra Strength', 'ALPHASYS'), 'Alpha System | Extra Strength');
});

test('preserva nomes desconhecidos, variantes e pontuação própria sem inventar produto', () => {
  for (const input of ['New Balance', 'NewEra Support', 'Alpha-Beta Support', 'CoQ10 200 mg (60 capsules)', 'Core Alpha - Extra Strength', 'Core Alpha: Classic Edition', 'System 360 [Model B]', 'Dr. Élan 2.0', 'Produto <teste>', '9x Platinum Vendor Wants To Share Profits With You']) {
    assert.equal(productName(input), input);
  }
  assert.equal(productName('  Core\nAlpha\u00a0 '), 'Core Alpha');
  assert.equal(productName('NEW : [Best Converting]'), 'NEW : [Best Converting]', 'sem nome remanescente conserva a fonte');
  assert.equal(productName(null), '');
});
