import {buildStructuredFicha} from './copy-ficha-structured.mjs?v=1';
import {createPresellFromFicha} from '../presell/presell-service.mjs?v=1';

// One workflow boundary: validation must finish before confirmation or production.
export async function createFromStructuredContent(source,data,{create=createPresellFromFicha}={}){
  const {ficha,warnings}=buildStructuredFicha(source,data);
  const result=await create(ficha);
  return {ficha,warnings,...result};
}
