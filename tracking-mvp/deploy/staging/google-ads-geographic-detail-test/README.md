# Teste de localização detalhada por campanha

Pacote local, não publicado. Contém somente `hostinger-private-tools/google-ads-readonly-service.php`. Destino: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`. Antes de substituir, confira e preserve backup do arquivo instalado e compare sua versão e funcionalidades com este arquivo completo. Não altere o wrapper público, credenciais ou banco. Não há SQL.

O endpoint `geographic_detail_test` aceita uma campanha, conta, MCC e até 14 dias; executa duas consultas SearchStream somente de leitura, uma por país e outra segmentada por região e cidade. Recusa respostas acima do limite e mostra identificadores geográficos sem resolver nomes. Os resultados são transitórios na tela e não são salvos. Cobertura e aceitação da consulta pelo Google ainda exigem verificação após publicação. Erros e limitações devem ser apresentados sem presumir sucesso.
