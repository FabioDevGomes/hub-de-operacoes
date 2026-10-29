---
name: google-ads-api-quota
description: Mapear e diagnosticar as chamadas Google Ads API do Hub, estimar consumo de operações e orientar melhorias de performance sem confundir requests do proxy com cota Google.
---

# Cota e desempenho da Google Ads API no Hub

Use esta skill quando a tarefa envolver consumo de cota, volume de chamadas, lentidão, limite Explorer/Basic, retries, concorrência, frequência de captura ou novas operações Google Ads no Hub.

## Procedimento

1. Leia o [inventário de chamadas](references/call-inventory.md) e confirme os caminhos atuais no código antes de sugerir números. O inventário é um mapa revisável, não uma garantia de que o deploy remoto contém exatamente o mesmo PHP.
2. Separe três contagens: POST do navegador ao proxy PHP, chamadas HTTP de autenticação OAuth e operações Google Ads contabilizadas na cota. Uma chamada do Hub pode se expandir em várias operações Google Ads.
3. Conte no servidor cada `hub_google_ads_search` como uma operação `SearchStream`; conte cada item de `mutateOperations` como uma operação mutável. Respostas com muitas linhas ou vários chunks não multiplicam a cota de um único `SearchStream`.
4. Diferencie operação estimada pelo código de uso real medido no projeto. Não afirme que a cota está folgada ou perto do limite sem consultar as métricas/quota do projeto Google Cloud.
5. Ao propor redução, preserve cobertura, completude, fuso, moeda, configuração, conferência de status e verificações antes de escrever. Remover uma consulta complementar exige demonstrar que os dados continuam corretos.

## Restrições deste projeto

- Não enviar conversões: a implementação inventariada não contém `UploadClickConversions`, `UploadCallConversions` ou outra chamada de upload de conversões.
- A regra de decisão que usa os últimos dados já guardados no Hub deve trabalhar com o histórico local existente; o usuário pediu explicitamente que não seja adicionada uma consulta Google Ads extra para avaliar a janela de 24 horas.
- A captura diária persiste um snapshot por conta/data e substitui nova captura da mesma data. Ela não conserva uma série horária imutável. Se uma regra futura precisar de janela móvel de 24 horas, preservar snapshots recebidos pelas consultas existentes é uma mudança de retenção local; não acrescente polling à API sem autorização explícita.
- Não mostrar tokens, chaves privadas, payloads de clientes ou dados financeiros em logs ou documentação. Para medir chamadas, prefira contadores agregados por operação, horário, latência e resultado, sem IDs de conta nem payload.
- Não alterar a integração, agendamento, credenciais, política de cache ou frequência da captura apenas por estar fazendo o inventário. Apresente a estimativa e o efeito de cada opção antes de uma mudança funcional.
- Não executar testes ou operações reais contra contas Ads sem solicitação. O serviço tem operações de mutação; o diagnóstico de cota deve começar em código e métricas do projeto.

## Referência

- [Mapa de chamadas, custo estimado e recomendações](references/call-inventory.md)
- Skill canônica do Hub: [painel-operacao-google-ads](../painel-operacao-google-ads/SKILL.md)

