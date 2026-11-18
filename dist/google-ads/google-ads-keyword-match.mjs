export function parseKeywordLine(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return {ok:true, empty:true, raw, text:'', matchType:'', label:''};
  let text = raw, matchType = 'BROAD';
  const exact = /^\[([^\[\]"]*)\]$/u.exec(raw);
  const phrase = /^"([^\[\]"]*)"$/u.exec(raw);
  if (exact) { text = exact[1].trim(); matchType = 'EXACT'; }
  else if (phrase) { text = phrase[1].trim(); matchType = 'PHRASE'; }
  else if (/[\[\]"]/u.test(raw)) return {ok:false, raw, error:'Feche os colchetes ou as aspas da palavra-chave.'};
  if (!text || Array.from(text).length > 80 || /[\u0000-\u001f\u007f]/u.test(text)) return {ok:false, raw, error:'Cada palavra-chave precisa ter de 1 a 80 caracteres.'};
  return {ok:true, empty:false, raw, text, matchType, label:({EXACT:'Exata',PHRASE:'Frase',BROAD:'Ampla'})[matchType]};
}

export function keywordListError(value, {required = false, label = 'palavras-chave'} = {}) {
  const lines = String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if ((required && !lines.length) || lines.length > 100) return 'Informe '+(required?'de 1 a 100':'até 100')+' '+label+', uma por linha.';
  const seen = new Set();
  for (const [index,line] of lines.entries()) {
    const parsed = parseKeywordLine(line);
    if (!parsed.ok) return 'Linha '+(index+1)+': '+parsed.error;
    const key = parsed.matchType+'\0'+parsed.text.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) return 'A lista de '+label+' contém uma palavra repetida com a mesma correspondência.';
    seen.add(key);
  }
  return '';
}

export function migrateLegacyKeywordText(value, matchType) {
  const type = String(matchType || '').toUpperCase();
  if (!['EXACT','PHRASE'].includes(type)) return String(value ?? '');
  return String(value ?? '').split(/\r?\n/).map(line => {
    const parsed = parseKeywordLine(line);
    if (!parsed.ok || parsed.empty || parsed.matchType !== 'BROAD') return line;
    return type === 'EXACT' ? '['+parsed.text+']' : '"'+parsed.text+'"';
  }).join('\n');
}
