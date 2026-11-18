# Auditoria de rastreamento por campanha

**Status:** pacote local, ainda não publicado. Atualiza a operação somente de leitura do serviço Google Ads já usado pelo Hub.

## Arquivo e destino

Faça backup do arquivo atual e substitua somente este arquivo:

| Arquivo local | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-readonly-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php` |

Não é necessário alterar o wrapper público `public_html/track/google-ads-readonly.php`, `tracking-config.php`, credenciais, banco, cron ou os scripts `track.js`/`collect.php`. Não há migração SQL.

## O que a operação acrescenta

O Hub poderá consultar, sob demanda, até seis consultas GAQL somente de leitura por conta selecionada. A operação avalia campanhas `ENABLED`, rotas de anúncios e critérios ativos e sitelinks ativos. Resolve a herança de sufixo e modelo de acompanhamento da conta, campanha, grupo, anúncio, critério e sitelink; procura `utm_campaign={campaignid}` e informa onde há configurações inferiores.

O serviço devolve totais e evidências resumidas, sem enviar URLs completas ao Hub. A cobertura configura somente o parâmetro na rota avaliada: ela não confirma clique, chegada do parâmetro ao Track, venda nem vínculo ao GCLID. Canais com rotas dinâmicas e resultados acima do limite ficam inconclusivos.

## Publicação e validação

1. Faça uma cópia de segurança privada do PHP existente.
2. Envie apenas o arquivo listado para o destino privado acima.
3. Atualize o Hub local para a versão correspondente e abra **Integrações → Google Ads API**.
4. Selecione as contas necessárias e clique **Consultar cobertura**. Cada conta selecionada consome cota da API; a tela não consulta automaticamente.

O pacote não faz upload nem altera campanhas. Verifique a resposta do Hub após a publicação; não trate o arquivo local como prova de instalação no servidor.
