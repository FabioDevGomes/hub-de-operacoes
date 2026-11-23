# Base central: inicialização e cópia

Estado em 18/11/2026: preparação para futura migração. A base em uso continua no navegador. Não crie o arquivo de ativação nem copie dados reais até a carga inicial ser preparada e conferida.

O destino reservado é `data-local/base-central-compartilhada.sqlite`; ele deve ser criado pela etapa de migração, não pelo inicializador. Foi verificado que esse caminho e `data-local/central-compartilhada.flag` não existiam na preparação. O arquivo preexistente `data-local/base-central-inicial.sqlite` é outro banco e deve ser preservado.

Depois da migração e verificação, a ativação explícita consiste em criar `data-local/central-compartilhada.flag` com o texto exato `hub-central-write-v1`. Com a base de escrita reconhecida no destino reservado e a flag presente, `iniciar-painel.cmd` inicia o serviço central junto com o Hub. Sem a flag, o funcionamento anterior é mantido. A base deve conter o marcador de ativação próprio e passar nas verificações do serviço; a flag sozinha não cria nem autoriza uma base inválida. Se já houver uma instância do Hub ativa sem o modo de escrita, ela deve ser encerrada antes de iniciar o modo central.

## Backup e recuperação

Com Node compatível com `node:sqlite`, a rotina abaixo faz cópia SQLite consistente, mesmo com o serviço ativo. O destino deve ser um caminho novo, em uma pasta já existente. Ela verifica a base e a cópia e não sobrescreve arquivos existentes. Se falhar, pode deixar um arquivo incompleto no destino: preserve-o para diagnóstico e escolha outro nome para uma nova tentativa.

```powershell
node scripts/central-isolada/backup-central.mjs "data-local/base-central-compartilhada.sqlite" "CAMINHO-DA-PASTA-DE-BACKUP/backup-central.sqlite"
```

Para conferir uma recuperação sem alterar o banco ativo, copie o backup para um segundo caminho novo com a mesma rotina e abra essa cópia em ambiente isolado:

```powershell
node scripts/central-isolada/backup-central.mjs "CAMINHO-DA-PASTA-DE-BACKUP/backup-central.sqlite" "CAMINHO-ISOLADO/base-recuperada.sqlite"
```

A troca de uma base ativa pela cópia recuperada é uma operação posterior: encerre o Hub e o serviço, preserve a base existente e confirme a cópia antes de qualquer substituição. A rotina não agenda backups automaticamente. Dados reais e ZIPs originais não foram importados nem alterados nesta preparação.
