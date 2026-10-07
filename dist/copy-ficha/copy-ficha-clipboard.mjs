export async function readClipboardText(clipboard=globalThis.navigator?.clipboard){
  if(typeof clipboard?.readText!=='function'){
    const error=new Error('clipboard-unavailable');
    error.code='clipboard-unavailable';
    throw error;
  }
  const text=await clipboard.readText();
  if(typeof text!=='string'||!text.trim()){
    const error=new Error('clipboard-empty');
    error.code='clipboard-empty';
    throw error;
  }
  return text;
}
