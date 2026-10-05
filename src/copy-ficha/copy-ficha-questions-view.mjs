import {formatOfferQuestionAnswers} from './copy-ficha-questions.mjs?v=3';

// Session-only presentation: never writes a draft or creates a Presell.
export function readOfferQuestionAnswers(root){
  return [...root.querySelectorAll('[data-offer-answer]')].map(field=>({question:field.dataset.offerQuestion,answer:field.value}));
}

export function resizeOfferAnswer(field){
  field.style.height='auto';field.style.height=`${field.scrollHeight}px`;
}

export function renderOfferQuestions(root,questions=[]){
  const host=root.querySelector('#copyOfferQuestions'),button=root.querySelector('#copyQuestionsCopy');
  if(!host||!button)return;
  button.disabled=!questions.length;host.replaceChildren();
  const doc=host.ownerDocument;
  if(!questions.length){
    const empty=doc.createElement('p');empty.className='copy-ficha-output-empty';empty.textContent='Clique em Gerar perguntas e respostas para preencher este quadro com os dados da oferta.';host.append(empty);return;
  }
  const list=doc.createElement('dl');list.className='copy-ficha-question-list';
  for(const {id,question,answer,pending} of questions){
    const row=doc.createElement('div');row.className=`copy-ficha-question${pending?' is-unidentified':''}`;
    const title=doc.createElement('dt');title.id=`copyQuestionLabel-${id}`;title.textContent=question;
    const value=doc.createElement('dd'),input=doc.createElement('textarea');
    input.className='copy-ficha-answer-input';input.rows=1;input.value=answer;input.setAttribute('aria-labelledby',title.id);
    input.dataset.offerAnswer=id;input.dataset.offerQuestion=question;value.append(input);
    row.append(title,value);list.append(row);
  }
  host.append(list);host.querySelectorAll('[data-offer-answer]').forEach(resizeOfferAnswer);
}

export async function copyOfferQuestions(root,toast,{writeText=text=>navigator.clipboard.writeText(text)}={}){
  const answers=readOfferQuestionAnswers(root);if(!answers.length)return;
  try{await writeText(formatOfferQuestionAnswers(answers));toast?.('Perguntas e respostas copiadas');return true}
  catch{toast?.('Não foi possível copiar. Selecione o texto manualmente.',true);return false}
}
