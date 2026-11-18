# Google Ads — duplicação de campanha Search

Pacote incremental para a operação de duplicação de campanha Search pelo Hub. A interface local e o serviço privado precisam estar atualizados para usar esse recurso.

## Arquivos para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local que contém os dois arquivos PHP:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-duplication\hostinger-private-tools
```

1. `google-ads-campaign-duplication-service.php` — novo serviço privado, incluído pelo endpoint de ações.
2. `google-ads-campaign-action-service.php` — endpoint de ações atualizado para carregar o serviço e encaminhar as operações de duplicação.

Faça backup dos dois arquivos atuais no servidor. Envie primeiro o serviço novo e depois substitua o endpoint de ações atualizado. Os dois ficam juntos na pasta de destino acima. Não envie este README, wrapper público, `trackingConfig.php`, credenciais, SQL, serviços de e-mail ou outros arquivos.

## Configuração e comportamento

Não há alteração SQL ou novo campo de configuração. A duplicação usa a autorização MCC/conta e o flag de criação de campanha que já existem. A MCC de origem e cada destino precisam pertencer à allowlist de criação ativa; contas destino também precisam estar habilitadas e usar a mesma moeda da comissão da campanha.

A validação e a criação são ações explícitas da interface. No fluxo em lote, cada cópia é criada pausada; o servidor valida a operação antes, envia os recursos da cópia numa mutação atômica e relê os dados principais para confirmar o resultado. Para reservar a numeração global do mesmo padrão de campanha, a prévia consulta nomes Search somente na conta de origem e nas contas destino marcadas (até 21 contas, uma consulta por conta). Essas consultas acontecem somente ao clicar em **Validar duplicações**; abrir a tela não consulta a API. A faixa gerada fica reservada por 30 minutos para impedir que prévias concorrentes recebam os mesmos números; sem criação, a reserva expira automaticamente. O arquivo de plano temporário fica fora da pasta pública do site, no diretório temporário do PHP, por até 30 minutos. A operação **Pausar e duplicar como B** no Diário de campanha usa estes mesmos dois arquivos PHP, mas um plano e uma operação dedicados.

## Pausar e duplicar como B

Depois que a interface local do Hub e estes arquivos estiverem atualizados, abra o Diário de uma campanha API. O botão aparece para uma campanha mapeada e ativa; o serviço ainda restringe a ação a campanhas Search padrão com CPA direto, nome no padrão do Hub e recursos compatíveis. A prévia consulta o Google Ads, valida a cópia com `validateOnly` e expira em 30 minutos, sem criar ou pausar nada. A confirmação final apresenta o nome, CPA, orçamento e recursos que serão copiados.

Ao confirmar, o servidor envia a criação da variante `B` ativa e a pausa da campanha original numa única chamada, com `partialFailure: false`. Se o Google Ads rejeitar o conjunto, a transação inteira é rejeitada. Depois, o servidor relê as campanhas para verificar status, nome, CPA, orçamento e recursos. Uma resposta incerta bloqueia nova tentativa com o mesmo plano; confira as duas campanhas na conta antes de outra ação. O serviço não transfere histórico de métricas nem aprendizado.

A mutação é real e pode começar a veicular a variante assim que o Google Ads a aceitar. O primeiro uso deve ser revisado com cuidado na prévia antes de confirmar. Esta alteração do pacote apenas habilita o fluxo; a publicação continua manual pelo usuário.
## Conferência após o envio

1. Confira se os dois arquivos foram colocados juntos no destino indicado e se o endpoint atualizado inclui `google-ads-campaign-duplication-service.php`.
2. Atualize a distribuição local do Hub para a versão que contém **Criação de ofertas → Duplicar campanha**.
3. Abra a tela, carregue campanhas da origem e escolha uma campanha compatível; só essa ação consulta a lista de campanhas.
4. Analise os recursos, escolha as contas destino, informe uma URL HTTPS por conta, marque as faixas de CPA e clique **Validar duplicações**. A prévia não cria campanhas.
5. Confira cada conta, nome, CPA, URL e recurso. **Criar cópias pausadas** pede confirmação antes da gravação. Faça o primeiro uso com um lote pequeno e confira cada campanha no Google Ads antes de ampliar o lote.

Se a campanha usar recursos que o MVP não copia fielmente, a inspeção bloqueia a cópia e informa o motivo. Critérios de exclusão por palavra-chave, posicionamento e tópico são recriados quando a API aceita o critério para a campanha Search. Listas compartilhadas de palavras-chave negativas são recriadas no destino, com os mesmos termos e correspondências, e anexadas somente à campanha duplicada. Segmentos `USER_LIST` são reutilizados quando a mesma lista está compartilhada, ativa e elegível para Pesquisa na conta destino; o Hub copia somente o vínculo da campanha, nunca os membros da lista. Outros tipos de lista compartilhada continuam bloqueados. A inspeção também rejeita campanhas de rascunho/experimento e sinaliza etiquetas de critérios, grupos ou anúncios que ainda não são recriadas no destino.

A variante `B` está disponível como operação separada no Diário de campanha, para campanhas API Search elegíveis: a prévia copia o CPA direto atual, orçamento diário, URLs e recursos suportados; após confirmação explícita, cria a B ativa e pausa a original na mesma mutação, sem `partialFailure`. A verificação relê as duas campanhas antes de confirmar. A operação não transfere métricas nem aprendizado. Se o resultado ficar incerto, confira o Google Ads antes de repetir; não existe repetição automática. A numeração do fluxo em lote continua considerando o maior número encontrado para o mesmo padrão de campanha na origem e nos destinos marcados; não altera números existentes nem consulta outras contas do diretório. As URLs finais dos recursos são substituídas pela Pre-Sell de destino; referências completas ao domínio de origem em templates de acompanhamento, sufixos e parâmetros personalizados também são substituídas, incluindo o caminho e a query antigos. A verificação pós-criação não informa sucesso se ainda encontrar um domínio de origem nesses campos.

O bloqueio também cobre campanhas que sejam rascunhos/experimentos, etiquetas em critérios, AI Max, automações de assets, ajustes de lance e outros recursos ligados que ainda não são preservados. A API atual permite AI Max ativar expansão de URL, personalização de texto e controles de marca; a duplicação não os desativa silenciosamente. Esses casos precisam ser tratados numa evolução específica antes de permitir a cópia.
