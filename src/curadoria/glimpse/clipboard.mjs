export async function readClipboardText(clipboard=globalThis.navigator?.clipboard){
  if(typeof clipboard?.readText!=='function'){
    const error=new Error('A leitura da área de transferência não está disponível neste navegador.');
    error.code='clipboard-unavailable';
    throw error;
  }
  const text=await clipboard.readText();
  if(typeof text!=='string'||!text.trim()){
    const error=new Error('A área de transferência está vazia.');
    error.code='clipboard-empty';
    throw error;
  }
  return text;
}
