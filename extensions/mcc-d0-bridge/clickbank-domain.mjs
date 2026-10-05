export const CLICKBANK_COLUMNS = [
  { key:'rank', label:'Rank', aliases:['rank', 'position'] },
  { key:'name', label:'Offer Name', aliases:['offername', 'title', 'name'] },
  { key:'seller', label:'Seller', aliases:['seller', 'vendor', 'nickname'] },
  { key:'avg', label:'Avg $', aliases:['avg', 'avgsale', 'avgsaleamount', 'average'] },
  { key:'initial', label:'Initial $', aliases:['initial', 'initialsale', 'initialsaleamount'] },
  { key:'future', label:'Future $', aliases:['future', 'futuresale', 'futuresaleamount'] },
  { key:'epc', label:'EPC', aliases:['epc'] },
  { key:'cvr', label:'CVR', aliases:['cvr', 'conversionrate'] },
  { key:'gravity', label:'Gravity', aliases:['gravity'] }
];

export function isClickBankMarketplace(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'accounts.clickbank.com'
      && /^\/master\/dashboard\/affiliate-marketplace\/?$/.test(parsed.pathname);
  } catch { return false; }
}

export function productsToTsv(rows) {
  const cell = (value, key) => {
    const text = String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
    // Protect text columns; ordinary negative numeric metrics remain numeric.
    return /^[=+\-@]/.test(text) && ['name','seller'].includes(key) ? `'${text}` : text;
  };
  return [CLICKBANK_COLUMNS.map(column => column.label).join('\t'),
    ...rows.map(row => CLICKBANK_COLUMNS.map(column => cell(row[column.key], column.key)).join('\t'))].join('\n');
}
