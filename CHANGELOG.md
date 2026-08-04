# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.11.0] - 2026-08-04

### Adicionado
- Managed Databases (PostgreSQL/MySQL, Fase 2): novo grupo de comandos `zs db` para developers. `zs db create --engine <postgres|mysql> --name <nome>` provisiona um banco gerenciado pela plataforma e orienta o attach; `zs db list` mostra tabela com nome, engine, status, node e último dump; `zs db connection <nome-ou-id>` imprime a connection string (DATABASE_URL) com aviso de segredo; `zs db delete <nome-ou-id>` (destrutivo: dump final + teardown) e `zs db restore <nome-ou-id>` (sobrescreve os dados atuais pelo último dump) pedem confirmação interativa, pulável com `--yes`. Os comandos que recebem alvo aceitam nome exato ou prefixo único de id, no padrão do `zs account switch`, com erro claro em ambiguidade ou inexistência.
- O `zs.yaml` aceita o campo app-level `database: <nome-do-banco>`: no `zs deploy` o CLI resolve o nome para `databaseId` via `myDatabases` e o envia no input de `deployApplication`, atachando a app ao banco (colocation no node do banco e `DATABASE_URL` injetada pelo backend). Nome inexistente ou ambíguo falha o deploy com erro claro; sem o campo no manifesto o CLI não envia `databaseId`, preservando o attach persistido no backend.

## [0.10.0] - 2026-08-03

### Adicionado
- O `zs.yaml` aceita `envFile` por serviço (string ou lista, inspirado no docker-compose), apontando para arquivo(s) `.env` carregados durante o `zs deploy`. O parse segue o formato clássico: linhas `KEY=VALUE`, ignora linhas vazias e comentários (`#`), remove aspas simples/duplas ao redor do valor e não faz expansão de variáveis nem suporta `export ` (linhas fora do formato são ignoradas com warning). Caminhos relativos resolvem a partir do diretório do `zs.yaml`, não do diretório atual. Precedência: os envFiles são aplicados na ordem da lista (o último sobrescreve o anterior) e as entradas de `env` do `zs.yaml` sobrescrevem as do envFile; o backend recebe o env já mesclado em `createApplication`/`updateApplication`. Arquivo ausente emite um warning claro por arquivo (`zs.yaml: envFile '<arquivo>' not found for service '<serviço>'; skipping`) e o deploy continua normalmente, sem falhar.

## [0.9.1] - 2026-07-31

### Corrigido
- `zs deploy` não declara mais sucesso em re-deploy com falha: no modelo de instância estável a instância permanece RUNNING mesmo quando o novo deploy falha (ex.: imagem inválida), e o CLI só observava o status da instância. Agora o CLI acompanha o registro de deployment mais recente da aplicação: FAILED exibe a mensagem de erro do deploy, ROLLED_BACK informa que a imagem anterior foi restaurada e SUCCESS confirma o sucesso. Enquanto o deployment está PENDING o CLI continua aguardando, mesmo com a instância RUNNING. As mensagens de falha e de timeout passam a sugerir `zs deployments <app>` e `zs logs <instance-id>`.

## [0.9.0] - 2026-07-31

### Adicionado
- `zs deployments <app>`: histórico de deploys de uma aplicação (últimos 20), em tabela com status colorido (SUCCESS/FAILED/ROLLED_BACK/PENDING), imagem encurtada (prefixo de registry removido quando longa), duração (createdAt→finishedAt, `—` quando pendente), data de criação e erro truncado em 60 caracteres.

### Alterado
- `zs list` passa a exibir uma única linha por aplicação, seguindo o modelo de instância estável: se instâncias mortas históricas (STOPPED/ERROR/FAILED) ainda vierem do backend, o CLI mostra a instância viva mais recente; se todas estiverem mortas, mostra a mais recente (app parado continua visível).

## [0.8.0] - 2026-07-31

### Adicionado
- O `zs.yaml` aceita `command` por serviço (lista de strings), que sobrescreve o CMD da imagem: permite rodar processos alternativos da mesma imagem, como um worker (`command: [yarn, worker:prod]` no Twenty). O valor é validado no parse (rejeita string solta ou itens não-string com erro claro) e repassado ao backend em `createApplication`/`updateApplication`.
- Novo comando `zs restart <instance-id>`: reinicia uma instância de aplicação em execução via mutation `restartApplication`, exigindo role `developer` ou `admin` e exibindo o status da instância ao final, no mesmo formato do `zs stop`.

## [0.7.0] - 2026-07-31

### Corrigido
- `zs deploy` com `zs.yaml` não ignora mais mudanças na composição: antes, ao reutilizar um app existente pelo nome, o re-deploy subia com os `services` antigos salvos no backend. Agora o CLI chama `updateApplication` com os `services` do manifesto atual antes de disparar o deploy, então alterações de imagem, env, ports, volumes e `dependsOn` no `zs.yaml` passam a valer no re-deploy. O `config` do app não é tocado no update, preservando ajustes feitos pelo portal.

## [0.6.0] - 2026-07-30

### Adicionado
- `zs login` suporta contas com 2FA (TOTP): nova flag `--otp <code>` para login não interativo; sem ela, o CLI pede `2FA code:` quando o backend exige o código e permite até 3 tentativas em caso de código inválido antes de falhar.
- Códigos de recuperação (formato `xxxx-xxxx`) são aceitos no lugar do TOTP, tanto na flag `--otp` quanto no prompt interativo.
- `zs login --api-key`: autenticação por API key do portal (formato `zsk_...`), para CI/CD e automação. A chave é lida por prompt oculto ou por stdin com `--token-stdin`, validada via `me` e persistida sem refresh token (`authType: apikey`). Chaves sem o prefixo `zsk_` são rejeitadas antes de chamar o backend.
- Em sessão de API key, erro de autenticação não tenta refresh nem limpa a sessão silenciosamente: o CLI informa que a chave está inválida/expirada/revogada e orienta gerar uma nova no portal, saindo com código não-zero. Comportamento JWT inalterado.
- `zs whoami` indica sessões de API key com o sufixo `(api key)`.
- Suporte a teams: novo comando `zs account` (`list`, `switch <id-ou-username>` e bare) para agir como uma conta de time. `list` marca a conta ativa; `switch` aceita username exato ou prefixo único de id, reemite os tokens da sessão no contexto da conta alvo e persiste `activeAccountId`. Troca de conta não está disponível em sessões de API key (falha cedo com mensagem clara).
- `zs whoami` e `zs account` exibem a linha da conta ativa (`Account: own` ou `Account: @time (team role: member)`).
- Todo login novo (senha, token ou API key) limpa o `activeAccountId`: sessões novas sempre começam na conta própria; `zs logout` e a limpeza de sessão também removem o campo.

## [0.5.0] - 2026-07-27

### Adicionado
- Suporte a múltiplas roles por usuário: o CLI passa a pedir `roles` (conjunto de papéis) nas operações `login`, `refreshToken` e `me`, além da role ativa (`role`), e persiste ambas na sessão local (`~/.config/zsc/config.json`).
- `zs whoami` exibe todas as roles do usuário, com a role ativa destacada em verde.
- Nota de release: como as queries GraphQL passam a pedir `roles` incondicionalmente, esta versão do CLI só pode ser publicada depois que o backend com suporte a `roles` estiver em produção; contra um backend antigo as queries de auth falham por erro de validação.

### Alterado
- A verificação de permissão dos comandos (`requireRole`) agora aceita qualquer role do conjunto do usuário: um usuário provider+developer roda `zs deploy` e `zs node list` na mesma sessão, sem trocar de papel. Sessões criadas antes desta versão (sem `roles` salvo) continuam funcionando pelo fallback para a role única.
- `zs logout` e a limpeza de sessão também removem as `roles` persistidas.

## [0.4.0] - 2026-07-17

### Adicionado
- `zs node configure <id>` permite ao provedor definir limites de recursos compartilhados do node (`--vcpu`, `--memory-mb`, `--storage-mb`) ou removê-los com `--clear` (ZSC-192).
- `zs node list` e `zs node status` passam a exibir os limites de recursos configurados em cada node.
- `zs deploy` aceita preferência geográfica de node: flags `--country` (código ISO 3166-1 alpha-2, ex. `BR`) e `--region` (ex. `RS`), ou a seção `placement:` no `zs.yaml` com os campos `country` e `region` (ZSC-194).
- A preferência é suave: quando não há node na região pedida, o deploy cai para qualquer node elegível. No modo `zs.yaml`, as flags sobrescrevem o `placement:` do manifesto campo a campo.
- Deploy bem-sucedido exibe a preferência enviada (`Placement: BR/RS (preferred)`) quando definida.

## [0.3.5] - 2026-07-16

### Adicionado
- `zs upgrade` solicita elevação automática com `sudo` quando o binário instalado não pode ser sobrescrito por falta de permissão, evitando que o usuário precise executar o comando manualmente como root.

### Alterado
- `install.sh` detecta permissão de escrita no diretório de destino e usa `sudo` apenas quando necessário; mensagens de erro agora indicam a pasta específica e a causa quando não é possível instalar.

## [0.3.4] - 2026-07-15

### Alterado
- Mensagens de erro de deploy propagadas pelo backend (incluindo incompatibilidade de arquitetura da imagem com nodes disponíveis) são exibidas integralmente no terminal.

## [0.3.3] - 2026-07-15

### Corrigido
- `zs deploy` agora mapeia corretamente os requisitos de IA do manifesto (`ai.gpu`, `ai.llm`, etc.) para os campos esperados pelo backend (`requiresGpu`, `requiresLlm`, etc.), permitindo deploys em nodes AI-enabled.

## [0.3.2] - 2026-07-15

### Alterado
- `MY_APPLICATIONS_QUERY`, `DEPLOY_APPLICATION_MUTATION` e `APPLICATION_INSTANCE_QUERY` passam a trazer `publicUrl`/`address` da aplicação.
- `zs deploy` exibe o endereço público estável da aplicação ao final de deploys bem-sucedidos.
- `zs list` exibe o endereço da aplicação quando disponível, mantendo o fallback para o endereço da instância.

## [0.3.1] - 2026-07-15

### Adicionado
- `zs deploy <image>` usa o nome do `app` definido no `zs.yaml` quando ele existe no diretório (a opção `--name` continua tendo prioridade).
- `zs deploy` (modo manifesto) reutiliza a aplicação existente pelo nome do `zs.yaml`, evitando criar apps duplicados a cada deploy.
- Testes unitários para `DeployManifestUseCase` cobrindo criação, reutilização por nome e encaminhamento de requisitos de IA.
- Suporte à seção `ai` no `zs.yaml` (`gpu`, `llm`, `video`, `audio`, `image`), validada por `parseManifest` e encaminhada para o backend no input de `deployApplication`.
- Testes unitários para parsing e validação dos requisitos de IA no manifesto.
- Criação do arquivo `CHANGELOG.md` para rastreamento de mudanças.
