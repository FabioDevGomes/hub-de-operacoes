# Staging — validação da associação de venda ClickBank à campanha

**Status:** preparado localmente; não enviado nem validado na Hostinger. Este pacote atualiza somente o endpoint privado que o Hub consulta. A validação com uma venda futura depende de existir uma SALE afiliada não-teste depois da publicação.

## Arquivo e destino

Antes de substituir, faça backup privado do serviço atual. Envie somente:

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-sales-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-sales-api-service.php` |

A pasta `hostinger-private-tools` contém apenas esse arquivo. O README permanece na raiz do pacote e não deve ser enviado.

## Finalidade e contrato

- Mantém a consulta paginada e somente leitura de transações `source=clickbank_ins_v8`, `role=AFFILIATE`, `transaction_type=SALE` e `is_test=0`.
- Mantém a associação venda→clique por igualdade exata entre `extclid` e `clickbank_extclid`; UUIDs legados também podem corresponder exatamente a `click_id`.
- Retorna schema 4 com diagnóstico reduzido do vínculo com o clique e candidato de campanha derivado de `utm_campaign` dos cliques exatos. O Hub resolve o candidato para MCC/conta/campanha por igualdade de ID e dados locais confiáveis.
- Candidato de campanha não equivale a identidade confirmada. Venda sem clique, IDs conflitantes/ambíguos ou origem local não confiável permanecem sem resolução; não se usa nome de campanha nem associação à Track para adivinhar.
- Não retorna identificadores brutos de clique, GCLID/GBRAID/WBRAID, recibo ou dados pessoais do comprador.

## Dependências e escopo

- O Hub deve estar atualizado para interpretar schema 4 e calcular a resolução local; a validação sintética dessa compatibilidade passou na versão local `1.371.0` (atual Hub: `1.371.1`, documentação).
- O serviço depende de `clickbank-ins-v8-api-service.php`, `tracking-config.php` e das tabelas existentes já instaladas em `private-tools`/banco de Tracking.
- Não exige SQL, configuração, token, wrapper público, receptor INS, `track.js` ou mudança no domínio da Pre-Sell.
- Não chama a Google Ads API, não envia conversões, não escreve no banco, não pausa nem altera campanhas.
- Este pacote é a versão atual da fonte `tools/clickbank-ins-v8-sales-api-service.php`; não combine com arquivos de pacotes de staging anteriores para o mesmo serviço.

## Publicação manual

1. Confirme que o Hub em uso aceita schema 4 e que o serviço auxiliar e a configuração privada existentes permanecem instalados.
2. Faça uma cópia de segurança do arquivo atual no destino acima.
3. Envie o arquivo da pasta `hostinger-private-tools` para `private-tools`, substituindo apenas `clickbank-ins-v8-sales-api-service.php`.
4. Não execute SQL e não altere tokens, configuração, receptor ou tag da Pre-Sell.

## Validação após publicação

1. No Hub atualizado, use **Atualizar vendas**. Confirme que a resposta é aceita e que o diagnóstico e o candidato continuam disponíveis.
2. O Test IPN da ClickBank não serve para validar uma venda elegível: eventos `is_test=1` são excluídos pela consulta.
3. Para confirmar a cadeia futura, aguarde uma SALE real de afiliado originada por um clique registrado na Pre-Sell. Não clique em anúncio ativo apenas para testar.
4. No diagnóstico da venda, confira o vínculo exato com o clique/Track, o candidato de ID da campanha e a resolução local completa e única: MCC, conta cliente e campanha.
5. Se o clique estiver ausente, ambíguo ou sem ID confiável, confirme que o Hub deixa a venda sem campanha associada; não deduza por nome.

A publicação e a validação remota são etapas manuais. Não copie tokens, identificadores completos de clique, recibos nem dados de comprador para logs ou para a conversa.

## Rollback

Se o endpoint falhar após a substituição, restaure somente o backup do arquivo privado no mesmo destino e repita a consulta no Hub. Nenhuma alteração de banco precisa ser revertida.

## Validação local já executada

Os testes sintéticos do serviço cobrem autenticação, origem/CORS, validação do corpo, filtros de SALE, paginação e estabilidade do snapshot. O teste cruzado chama o handler PHP com repositório em memória e percorre a resposta no Hub. Não há conexão MySQL, acesso à Hostinger ou uso de vendas reais nesta validação.
