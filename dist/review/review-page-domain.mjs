import {COPY_SECTIONS,isPublicCtaUrl} from './review-copy-domain.mjs?v=1';
import {isPublicImageUrl} from './review-images-domain.mjs?v=1';

export const PAGE_SCHEMA='hub-review-page-v1';
export const PAGE_PREFIX='hub:review:page:v1:';
export const PAGE_TITLE_MAX=70;
export const PAGE_DESCRIPTION_MAX=160;
const emptyAlt=()=>({text:'',confirmed:false});

export function pageBinding(draft){return JSON.stringify({id:draft.id,product:draft.product,market:draft.market,language:draft.language,publicationUrl:draft.publicationUrl,portal:draft.portal})}
export function createPageState(draft){return{schema:PAGE_SCHEMA,reviewId:draft.id,binding:pageBinding(draft),sourceSnapshot:null,seoTitle:'',description:'',imageAlts:Object.fromEntries(COPY_SECTIONS.map(section=>[section.key,emptyAlt()])),reviewed:false}}

export function createPageSnapshot(source={}){
  const snapshot=item=>({revision:Number(item?.revision)||0,dirty:Boolean(item?.dirty),reviewed:Boolean(item?.reviewed),confirmed:Boolean(item?.confirmed),offerRevision:Number(item?.offerRevision)||0});
  return{materials:snapshot(source.materials),analysis:snapshot(source.analysis),reviewer:snapshot(source.reviewer),offer:snapshot(source.offer),images:snapshot(source.images),copy:snapshot(source.copy)};
}

export function findPagePlaceholders(value){
  const text=String(value||''),patterns=[/\b(?:TODO|TBD|TBC|LOREM\s+IPSUM|PLACEHOLDER|INSERT\s+HERE)\b/i,/\{\{[^}]+\}\}/,/\[(?:INSERT|PLACEHOLDER|YOUR\s+[^\]]+)\s*[^\]]*\]/i];
  return patterns.some(pattern=>pattern.test(text));
}

export function pageSourceGaps(draft,source){
  const gaps=[],materials=source.materials||{};
  if(!materials.revision||materials.dirty||materials.error)gaps.push('Passo 1: salve os materiais atuais antes de montar a página.');
  for(const [key,label] of [['analysis','análise do passo 2'],['reviewer','reviewer/depoimentos do passo 3'],['offer','oferta do passo 4'],['images','inventário de imagens do passo 5']]){
    const item=source[key]||{};
    if(!item.revision||item.dirty||item.error)gaps.push(`Passo ${key==='analysis'?2:key==='reviewer'?3:key==='offer'?4:5}: salve a versão atual da ${label}.`);
    else if(!item.reviewed)gaps.push(`A ${label} precisa estar revisada.`);
    if(key==='offer'&&item.revision&&!item.confirmed)gaps.push('Confirme os dados da oferta no passo 4.');
  }
  const copy=source.copy||{};
  if(!copy.revision||copy.dirty||copy.error)gaps.push('Salve a copy atual do passo 6.');
  if(!copy.reviewed||copy.state?.reviewed!==true)gaps.push('Marque a copy como revisada no passo 6.');
  if(source.copyQuality&&!source.copyQuality.ready)for(const gap of source.copyQuality.gaps)gaps.push(`Copy: ${gap}`);
  if(!String(draft.product||'').trim())gaps.push('Informe o produto no passo 1.');
  return gaps;
}

export function pageReadiness(state,draft,source={}){
  const gaps=pageSourceGaps(draft,source),snapshot=createPageSnapshot(source),snapshotMatches=Boolean(state.sourceSnapshot)&&JSON.stringify(state.sourceSnapshot)===JSON.stringify(snapshot);
  if(state.binding!==pageBinding(draft))gaps.push('A página pertence a outra identidade/URL; reconcilie as fontes.');
  if(!snapshotMatches)gaps.push(state.sourceSnapshot?'As fontes mudaram desde a conferência da página; reconcilie e revise novamente.':'Confirme as versões revisadas dos passos anteriores.');
  if(!String(state.seoTitle||'').trim())gaps.push('Informe um título SEO.');
  else if(state.seoTitle.trim().length>PAGE_TITLE_MAX)gaps.push(`O título SEO deve ter até ${PAGE_TITLE_MAX} caracteres.`);
  if(!String(state.description||'').trim())gaps.push('Informe uma descrição SEO.');
  else if(state.description.trim().length>PAGE_DESCRIPTION_MAX)gaps.push(`A descrição SEO deve ter até ${PAGE_DESCRIPTION_MAX} caracteres.`);
  if(findPagePlaceholders(state.seoTitle)||findPagePlaceholders(state.description))gaps.push('Remova placeholders do título e da descrição SEO.');
  if(!String(draft.publicationUrl||'').trim())gaps.push('Informe a URL final de publicação no passo 1.');
  else if(!isPublicCtaUrl(draft.publicationUrl)||new URL(draft.publicationUrl).protocol!=='https:')gaps.push('A URL de publicação/canonical deve ser HTTPS público, sem credenciais.');
  if(!String(draft.portal||'').trim())gaps.push('Informe o nome do portal editorial no passo 1.');
  if(!String(draft.language||'').trim())gaps.push('Informe o idioma da página no passo 1.');
  const copyState=source.copy?.state,assets=source.assets||{};
  if(copyState?.sections)for(const def of COPY_SECTIONS){const section=copyState.sections[def.key];if(!section||section.status==='omitted')continue;
    if(findPagePlaceholders(section.copy))gaps.push(`${def.number}. ${def.title}: remova placeholders do texto.`);
    if(findPagePlaceholders(section.ctaLabel))gaps.push(`${def.number}. ${def.title}: remova placeholders do texto do CTA.`);
    if(section.assetKey&&section.assetKey!=='none'){
      const alt=state.imageAlts?.[def.key]||{};
      if(!assets[section.assetKey]||!isPublicImageUrl(assets[section.assetKey]))gaps.push(`${def.number}. ${def.title}: o asset precisa ter URL HTTPS pública atual.`);
      if(!String(alt.text||'').trim())gaps.push(`${def.number}. ${def.title}: descreva a imagem no texto alternativo (alt).`);
      else if(findPagePlaceholders(alt.text))gaps.push(`${def.number}. ${def.title}: remova placeholders do texto alternativo.`);
      if(!alt.confirmed)gaps.push(`${def.number}. ${def.title}: confirme o texto alternativo da imagem.`);
    }
  }
  const unique=[...new Set(gaps)];
  return{gaps:unique,ready:unique.length===0,exportReady:state.reviewed===true&&unique.length===0,snapshot,snapshotMatches,label:unique.length?'Prévia com pendências':state.reviewed?'Página conferida para exportação':'Conteúdo pronto; revisão final pendente'};
}

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function plainCopy(value){return String(value||'').trim().split(/\n\s*\n/).filter(Boolean).map(paragraph=>`<p>${esc(paragraph).replace(/\r?\n/g,'<br>')}</p>`).join('')}
function jsonForScript(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}
const PAGE_CSS=`:root{color-scheme:light;--ink:#17212c;--muted:#526170;--line:#d9e0e7;--accent:#17365d;--paper:#f5f7f9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}.preview-banner{padding:10px 18px;background:#fff1c2;color:#503b00;text-align:center;font-weight:700}.site-header{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--line);box-shadow:0 2px 12px #17212c12}.header-inner{max-width:1120px;margin:auto;padding:12px 22px}.portal-name{font-size:.92rem;font-weight:750;color:var(--accent)}.section-nav{display:flex;gap:8px;overflow-x:auto;padding-top:8px;white-space:nowrap}.section-nav a{color:var(--muted);font-size:.75rem;text-decoration:none;padding:4px 7px;border-radius:5px}.section-nav a:hover{background:#edf2f7;color:var(--accent)}main{max-width:880px;margin:32px auto;padding:0 22px}.page-intro{padding:26px 28px;background:#fff;border:1px solid var(--line);border-radius:14px;margin-bottom:16px}.page-intro h1{font-size:clamp(1.65rem,4vw,2.4rem);line-height:1.2;margin:0 0 10px;color:var(--accent)}.page-intro p{color:var(--muted);margin:0}.review-section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:24px 28px;margin:14px 0;scroll-margin-top:115px}.review-section h2{font-size:1.32rem;line-height:1.3;margin:0 0 14px}.review-section p{margin:0 0 12px}.review-section p:last-child{margin-bottom:0}.review-section figure{margin:0 0 18px}.review-section img{display:block;max-width:100%;height:auto;max-height:620px;object-fit:contain;margin:0 auto;border-radius:10px}.review-cta{display:inline-flex;margin-top:14px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:8px}.review-cta:hover{filter:brightness(1.12)}footer{max-width:880px;margin:24px auto 0;padding:20px 22px 36px;color:var(--muted);font-size:.84rem;border-top:1px solid var(--line)}.draft-copy{padding:14px;background:#fff4d6;border-radius:8px;color:#624b12}@media(max-width:600px){.header-inner{padding:10px 14px}.section-nav{gap:4px}.section-nav a{font-size:.69rem}.site-header{position:static}main{margin:16px auto;padding:0 12px}.page-intro,.review-section{padding:19px 17px}.review-section{scroll-margin-top:12px}.review-section h2{font-size:1.18rem}footer{padding:18px 14px 28px}}@media print{.site-header{position:static}.section-nav{display:none}.page-intro,.review-section{break-inside:avoid;box-shadow:none}}`;

export function renderReviewHtml(pageState,draft,source={}, {preview=false}={}){
  const copy=source.copy?.state,assets=source.assets||{},language=String(draft.language||'und').trim()||'und',title=String(pageState.seoTitle||draft.product||'Review').trim(),description=String(pageState.description||'').trim(),canonical=String(draft.publicationUrl||'').trim(),portal=String(draft.portal||'').trim();
  const definitions=COPY_SECTIONS.filter(def=>{const item=copy?.sections?.[def.key];return item&&(item.status!=='omitted')&&(preview||item.status==='reviewed')});
  const heroImage=copy?.sections?.hero?.assetKey&&copy.sections.hero.assetKey!=='none'?assets[copy.sections.hero.assetKey]:'';
  const nav=definitions.map(def=>`<a href="#review-${def.key}">${esc(def.title)}</a>`).join('');
  const sections=definitions.map(def=>{const item=copy.sections[def.key],imageUrl=item.assetKey&&item.assetKey!=='none'?assets[item.assetKey]:'',alt=pageState.imageAlts?.[def.key]?.text||'';const image=imageUrl&&isPublicImageUrl(imageUrl)?`<figure><img src="${esc(imageUrl)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>`:'';const content=item.status==='draft'?`<div class="draft-copy">Copy ainda não revisada nesta prévia.</div>${plainCopy(item.copy)}`:plainCopy(item.copy);const cta=item.ctaLabel&&isPublicCtaUrl(item.ctaUrl)?`<a class="review-cta" href="${esc(item.ctaUrl)}" target="_blank" rel="${item.ctaUrl===draft.affiliateUrl?'sponsored nofollow noopener noreferrer':'noopener noreferrer'}">${esc(item.ctaLabel)}</a>`:'';return`<section class="review-section" id="review-${def.key}"><h2>${esc(def.title)}</h2>${image}${content}${cta}</section>`}).join('\n');
  const previewBanner=preview?'<div class="preview-banner">PRÉVIA INTERNA — ainda não aprovada para publicação</div>':'';
  const canonicalTag=!preview&&isPublicCtaUrl(canonical)&&new URL(canonical).protocol==='https:'?`<link rel="canonical" href="${esc(canonical)}">`:'';
  const robots=preview?'noindex,nofollow':'index,follow';
  const openGraphImage=heroImage&&isPublicImageUrl(heroImage)?`<meta property="og:image" content="${esc(heroImage)}">`:'';
  const canonicalIsPublicHttps=isPublicCtaUrl(canonical)&&new URL(canonical).protocol==='https:';
  const schema=!preview&&canonicalIsPublicHttps&&title&&description?`<script type="application/ld+json">${jsonForScript({'@context':'https://schema.org','@type':'WebPage',name:title,description,url:canonical,inLanguage:language,publisher:portal?{'@type':'Organization',name:portal}:undefined})}</script>`:'';
  const footer=portal?`<footer>Conteúdo editorial de ${esc(portal)}.</footer>`:'';
  return`<!doctype html>
<html lang="${esc(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="${robots}">
<title>${esc(title)}</title>
${description?`<meta name="description" content="${esc(description)}">`:''}
${canonicalTag}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
${description?`<meta property="og:description" content="${esc(description)}">`:''}
${!preview&&canonicalIsPublicHttps?`<meta property="og:url" content="${esc(canonical)}">`:''}
${portal?`<meta property="og:site_name" content="${esc(portal)}">`:''}
${openGraphImage}
<style>${PAGE_CSS}</style>
${schema}
</head>
<body>
${previewBanner}
<header class="site-header" id="top"><div class="header-inner"><div class="portal-name">${esc(portal||'Portal editorial')}</div><nav class="section-nav" aria-label="Navegação da review">${nav}</nav></div></header>
<main><header class="page-intro"><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</header>
${sections||'<section class="review-section"><h2>Prévia</h2><p>A copy revisada aparecerá aqui.</p></section>'}
</main>
${footer}
</body>
</html>`;
}

export function exportReviewHtml(pageState,draft,source={}){
  const readiness=pageReadiness(pageState,draft,source);
  if(!readiness.exportReady)throw new Error(readiness.gaps.length?readiness.gaps.slice(0,10).join('\n'):'Confirme a revisão final da página antes de exportar.');
  return renderReviewHtml(pageState,draft,source,{preview:false});
}
