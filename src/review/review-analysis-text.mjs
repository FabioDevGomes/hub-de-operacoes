// Text extraction only: never evaluates HTML or loads external resources.
const ENTITIES=Object.freeze({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',copy:'©',reg:'®',trade:'™',eacute:'é',Eacute:'É',aacute:'á',Aacute:'Á',iacute:'í',oacute:'ó',uacute:'ú',atilde:'ã',otilde:'õ',acirc:'â',ecirc:'ê',ocirc:'ô',ccedil:'ç',Ccedil:'Ç',auml:'ä',ouml:'ö',uuml:'ü'});
export function readableHtml(value){
  let text=String(value??'');
  if(/<\/?[a-z][^>]*>/i.test(text)){
    text=text.replace(/<!--[\s\S]*?(?:-->|$)/g,' ')
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
      .replace(/<(?:script|style|noscript|template|svg)\b[^>]*>[\s\S]*$/gi,' ')
      .replace(/<[^>]*>/g,' ');
  }
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi,(original,entity)=>{
    if(entity.startsWith('#')){const number=entity[1]?.toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):original}
    return ENTITIES[entity]??original;
  }).replace(/\s+/g,' ').trim();
}
