# Smoke test sintético de HopLink ClickBank

**Estado:** fixture preparada localmente; ainda não publicada. Este pacote substitui somente a página pública de QA `test.html`. Não altera o rastreador, o coletor, banco, ClickBank, Google Ads ou páginas de oferta.

## Arquivo e destino

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/test.html` | `/home/u572283517/domains/travenzo.shop/public_html/track/test.html` |

Não há SQL nem configuração adicional. Faça backup da página `test.html` atual antes de substituí-la.

## O que a fixture faz

- A visita à página envia `page_view`, como antes.
- O botão cria um HopLink fictício `hop.clickbank.net` com `affiliate=qa_test`, `vendor=qa_test` e `tid=qa_phase1`.
- O rastreador deve gerar um `extclid` próprio, incluí-lo no destino e enviar um evento `outbound_click` com o mesmo valor em `clickbank_extclid`, mais os identificadores Google e UTMs fictícios da URL de QA.
- A fixture cancela a navegação do navegador após o rastreador capturar o clique. Nenhuma página ClickBank, oferta ou checkout é aberta.
- A mensagem na página confirma somente que o navegador enfileirou o evento. A gravação deve ser confirmada no banco.

## Validação

1. Substitua somente `test.html` no destino listado acima.
2. Abra a página com parâmetros sintéticos únicos, por exemplo:
   `https://travenzo.shop/track/test.html?gclid=QA-CLICKBANK-GCLID-UNICO&utm_source=google&utm_medium=cpc&utm_campaign=QA-CLICKBANK-CAMPAIGN-UNICA`
3. Aguarde `Visita recebida pelo endpoint` e clique uma vez em `Registrar HopLink ClickBank sintético`.
4. Confirme no banco `u572283517_track`, tabela `tracking_events`, que há um `page_view` e um `outbound_click` com o GCLID/campanha sintéticos. No `outbound_click`, `clickbank_extclid` deve ser igual ao `click_id` e ao parâmetro `extclid` do link capturado.
5. Não gere evento `SALE`, não acesse oferta real e não use clique de anúncio.

Os eventos sintéticos permanecem no banco para auditoria; não os remova como parte deste teste. O pacote local não comprova publicação nem gravação no servidor.
