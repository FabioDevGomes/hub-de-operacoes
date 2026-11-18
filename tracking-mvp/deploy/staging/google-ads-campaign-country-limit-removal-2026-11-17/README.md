# Google Ads — remover teto local de 20 países

Pacote incremental do endpoint privado de criação Google Ads. O Hub mantinha um teto local de 20 países na entrega, na tela/serviço do navegador e no serviço PHP. A correção preserva os códigos distintos de duas letras, exige ao menos um país no modo `COUNTRIES`, verifica se cada destino é aceito pelo Google e mantém o modo `WORLD` sem lista de países. As listas completas seguem para a prévia e criação via API.

## Importante: publicação necessária

**Este PHP precisa ser publicado para que entregas com mais de 20 países funcionem via API.** O Hub local e o serviço privado validam em camadas separadas; atualizar somente o Hub deixa o servidor rejeitando listas acima de 20. O pacote está preparado para publicação manual e ainda não foi enviado.

O limite de 20 não é um limite documentado do Google Ads. A documentação oficial informa até 10.500 critérios de localização por campanha, entre locais incluídos e excluídos. Para esta alteração, o Hub não impõe novo teto de países; a API continua responsável por validar cada destino e os limites reais da conta/campanha.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-country-limit-removal-2026-11-17\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Faça backup do arquivo instalado e substitua somente esse PHP. Não envie o README, wrapper público, SQL, configurações privadas ou credenciais. O pacote está preparado localmente; **não foi enviado nem validado no servidor**. Não exige SQL nem alteração de configuração.

## Validação após publicação

1. Confirme que o arquivo foi substituído no destino privado.
2. No Hub atualizado, abra **Integrações → Criar campanha**, preencha uma entrega com mais de 20 países válidos e clique em **Validar prévia**. A prévia é `validateOnly` e não cria campanha; ainda consome as consultas normais da API.
3. Confira a quantidade e a lista de destinos resolvidos na prévia. Não clique em **Criar campanha pausada** durante essa validação.
4. Para confirmar criação real, revise a prévia e siga o procedimento normal de criação pausada da campanha.
