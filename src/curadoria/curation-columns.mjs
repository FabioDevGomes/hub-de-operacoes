import {mountColumnPicker} from '../table-columns.mjs?v=1';

// Only presentation settings. No catalog/analysis writes or shared preferences.
export const CURATION_COLUMNS = {
  radar: {
    preferenceKey: 'hub:radar-spyhero:visible-columns:v1',
    required: ['product'],
    columns: [['product','Produto'],['niche','Nicho'],['network','Rede'],['clickbank','ClickBank'],
      ['trends','Trends'],['landing','Landing Pages'],['seen','Vistos'],['running','Ativos'],
      ['pages','Páginas'],['landers','Landers'],['movement','Movimento'],['delta','Δ ativos'],
      ['auto','Sinal automático'],['decision','Decisão manual'],['lastSeen','Última coleta']],
  },
  clickbank: {
    preferenceKey: 'hub:clickbank-top-offers:visible-columns:v1',
    required: ['offerName'],
    columns: [['rank','Posição'],['offerName','Oferta'],['seller','Vendedor'],['trends','Google Trends'],
      ['glimpse','Glimpse'],['images','Imagens'],['average','Avg $'],['initial','Initial $'],
      ['future','PAG.'],['epc','EPC'],['cvr','CVR'],['gravity','Gravity'],
      ['movement','Variação'],['decision','Decisão'],['lastSeen','Última coleta']],
  },
};

export function mountCurationColumns({root, screen, preferences}) {
  if (preferences === undefined) {
    try { preferences = root.ownerDocument.defaultView.localStorage; } catch {}
  }
  return mountColumnPicker({
    ...CURATION_COLUMNS[screen], preferences,
    picker: root.querySelector('[data-curation-columns]'),
    table: root.querySelector('.tablewrap table'),
  });
}
