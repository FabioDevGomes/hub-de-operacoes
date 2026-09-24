const LANGUAGE_BY_COUNTRY={US:'en',GB:'en',IE:'en',CA:'en',AU:'en',NZ:'en',DE:'de',AT:'de',CH:'de',FR:'fr',BE:'fr',NL:'nl',ES:'es',MX:'es',IT:'it',PT:'pt',BR:'pt',PL:'pl',CZ:'cs',SK:'sk',HU:'hu',RO:'ro',BG:'bg',GR:'el',DK:'da',SE:'sv',NO:'no',FI:'fi',EE:'et',LV:'lv',LT:'lt',SI:'sl',HR:'hr',RS:'sr',UA:'uk',IL:'he',TR:'tr',JP:'ja',KR:'ko'};
const LABELS={dominant:'Dominante',mixed:'Mista',scarce:'Escassa',absent:'Ausente',ambiguous:'Ambígua',inconclusive:'Inconclusiva'};
const RANK={dominant:6,mixed:5,scarce:4,absent:3,ambiguous:2,inconclusive:1};

export function languageForCountry(country){return LANGUAGE_BY_COUNTRY[String(country||'').toUpperCase()]||'en'}
function buildImageSearchUrl(query,country,language){const code=String(country||'US').toLowerCase(),hl=language||languageForCountry(country),params=new URLSearchParams({q:String(query||'').trim(),udm:'2',gl:code,hl});return `https://www.google.com/search?${params.toString()}`}
export function imageSearchUrl(term,country,language){return buildImageSearchUrl(term,country,language)}
export function imageSearchUrlExcluding(term,country,excludedKeywords,language){const candidates=(Array.isArray(excludedKeywords)?excludedKeywords:[excludedKeywords]).map(value=>String(value||'').trim().replace(/"/g,'')).filter(Boolean);const exclusions=candidates.map(candidate=>/\s/.test(candidate)?`-"${candidate}"`:`-${candidate}`);return buildImageSearchUrl([String(term||'').trim(),...exclusions].filter(Boolean).join(' '),country,language)}
export function resultLabel(status){return LABELS[status]||'Não verificado'}
export function resultRank(status){return RANK[status]||0}
export function latestByCountry(assessments=[]){const result=new Map();for(const item of [...assessments].sort((a,b)=>String(a.capturedAt||a.date||'').localeCompare(String(b.capturedAt||b.date||''))))if(item?.country)result.set(item.country,item);return result}
export function progress(assessments=[],countries=[]){const latest=latestByCountry(assessments),explicit=[...new Set(countries.filter(Boolean))];return {done:explicit.filter(code=>latest.has(code)).length,total:explicit.length,latest}}
export function appendAssessment(history=[],entry){return [...history,entry]}
