# Busca agrupada de nomes na prévia de campanhas

Pacote local, ainda não publicado. Agrupa consultas de nomes de campanha em blocos de até 40 nomes por conta durante a prévia. O resultado é assinado e temporário; cada `validateOnly` continua individual. Na confirmação, o serviço consulta o nome novamente antes de criar.

## Arquivos para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta de upload local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-preview-name-lookup-batching\hostinger-private-tools
```

Faça uma cópia privada dos arquivos atuais antes de substituir. Envie os dois arquivos abaixo para o destino indicado, nesta ordem:

1. `google-ads-readonly-service.php`
2. `google-ads-campaign-action-service.php`

O `google-ads-readonly-service.php` está incluído para manter os helpers de telemetria v2 compatíveis com o serviço de ações. Ele é idêntico ao arquivo do pacote `google-ads-quota-operations-v2`. Não há SQL, alteração de configuração nem credenciais neste pacote.

## Comportamento e conferência

- O serviço agrupa até 40 nomes distintos por consulta `SearchStream` e conta cada busca como uma operação Google Ads.
- A prévia reutiliza o resultado assinado por campanha e continua validando individualmente os itens `validateOnly`.
- A criação confirmada sempre faz uma busca nova de nome antes de gravar.
- Se o Hub encontrar um serviço privado antigo, ele recua para o preparo anterior e mantém a consulta individual de nomes.
- O painel local precisa estar na versão 1.285.8 ou superior para enviar os nomes agrupados e mostrar quantas buscas foram feitas.
- Não faça uma chamada extra de teste. Na próxima prévia que já faria parte do trabalho, o status do Hub informa se houve agrupamento. Isso confirma a resposta do serviço, não substitui a métrica de uso do projeto no Google Cloud.

Nenhum acesso a conta ou chamada Google Ads foi feito para esta entrega. A publicação continua manual e este pacote permanece local até o envio.
