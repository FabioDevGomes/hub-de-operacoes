# Google Ads — destino geográfico Mundo

Pacote incremental para permitir que campanhas Search da entrega do Hub usem o modo `WORLD`. Nesse modo, o serviço aceita uma lista vazia de países e cria a campanha pausada sem operações de critério geográfico positivo. A API confirma no retorno que o modo é `WORLD` e que nenhum país foi resolvido. O modo por países continua compatível com o formato de requisição anterior.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-worldwide-targeting\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Faça backup do serviço atual e substitua somente esse arquivo. Não envie o README, credenciais, wrappers públicos ou arquivos de outros pacotes. O serviço deve permanecer fora de `public_html`.

Esta alteração não exige SQL nem mudança de configuração. O pacote é local e ainda não foi publicado no servidor. O Hub local também precisa estar atualizado para enviar a intenção `WORLD`.

## Conferência após publicar

1. Na Curadoria Guru Media, marque `Mundo` e abra a entrega vinculada.
2. Na criação de campanhas, confirme que o destino aparece como “Mundo — sem país específico”.
3. Valide a prévia. Ela deve confirmar `WORLD`, lista de países vazia e campanha pausada; a validação não cria a campanha.
4. Só confirme a criação depois de revisar conta, campanha e prévia.
