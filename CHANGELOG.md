# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- Serviço de inferência gerenciado (AIaaS, Sprint 20): novo grupo de comandos `zs ai` para developers. `zs ai models` (alias `catalog`) mostra o catálogo público de modelos (id, nome, tamanho, VRAM mínima, contexto, backends cuda/rocm/cpu e licença); `zs ai list` (alias `ls`) lista os serviços de inferência do owner (nome, modelo, status, endpoint, node); `zs ai create --model <id> [--name <nome>]` provisiona um serviço de inferência e exibe o endpoint junto do token inicial de API, com aviso de que o valor só é mostrado uma única vez; `zs ai status [nome]` detalha um serviço, incluindo os metadados dos tokens (id, label, hint, createdAt — nunca o valor), e sem argumento lista os serviços como o `zs ai list`; `zs ai token add <nome> --label <l>` emite um novo token (valor exibido uma única vez), `zs ai token list <nome>` lista labels e hints, e `zs ai token revoke <nome> <tokenId>` revoga com confirmação interativa (pulável com `-y`), aceitando prefixo único de id; `zs ai delete <nome>` remove o serviço com confirmação. Os comandos que recebem alvo resolvem por nome exato ou prefixo único de id via `myInferenceServices`, com erro claro em ambiguidade ou inexistência. A negação pela allowlist do beta fechado é traduzida em mensagem clara orientando como pedir acesso, e as operações de token avisam que o serviço reinicia brevemente para aplicar a mudança.

### Alterado
- (a entrada `zs ai` acima já reflete a semântica final: o catálogo público saiu de `zs ai list` para `zs ai models`, e `zs ai list` passou a listar os serviços do owner, seguindo a convenção do `zs db list`.)
- `zs ai create --name` passa a validar o nome no cliente (regex DNS-safe, mesmo formato exigido pelo backend por virar parte do hostname público), falando cedo com erro claro em vez de depender da resposta do servidor.
- `zs ai token revoke` e `zs ai delete` sem `-y` em terminal não interativo (stdin sem TTY, ex.: CI) agora falham com erro claro orientando o uso de `-y`, em vez de travar indefinidamente ou sair com código 0 sem executar nada.

## [0.12.2] - 2026-08-19

### Adicionado
- Novo grupo de comandos `zs secrets` para gerenciar secrets por aplicação: `set <app> <KEY>` lê o valor por prompt oculto (TTY) ou stdin, nunca como argumento posicional (histórico do shell); `list <app>` mostra apenas chave, hint mascarado (`****xxxx`) e data de atualização (a API é write-only e nunca devolve o valor); `delete <app> <KEY>` pede confirmação interativa, pulável com `-y/--yes` para CI; `import <app> <arquivo.env>` faz upsert em lote reusando o parser de `.env` do deploy, reportando linhas malformadas sem abortar o lote e, ao final, lembra que o arquivo de origem segue com os valores em plaintext (remover ou manter fora do git). `set` e `delete` validam o formato da `KEY` localmente antes de qualquer chamada de rede. O argumento `<app>` aceita nome ou id da aplicação (o helper compartilhado `resolveApplicationByName` passou a aceitar id como fallback).

### Alterado
- O parser de `.env` (`parseEnvFile`, usado por `zs secrets import` e pelos `envFile` do `zs.yaml` no deploy) passa a aceitar o prefixo opcional `export ` (`export KEY=VALUE`), alinhando o comportamento com o parser do website. Antes essas linhas eram reportadas como malformadas.

### Seguranca
- `minimatch` 9.x pinado em `^9.0.7` via `pnpm.overrides` (Dependabot alert 11, ReDoS por backtracking combinatório em GLOBSTARs não adjacentes, GHSA; dependência dev transitiva do `@typescript-eslint`, resolvia 9.0.3). A linha 3.x não é afetada pelo advisory.

### Corrigido
- `pnpm lint` dentro de um worktree aninhado (`.worktrees/<branch>`) não falha mais com "couldn't determine the plugin @typescript-eslint uniquely": o `.eslintrc.js` agora tem `root: true`, impedindo que o eslint carregue também o config do checkout pai.

### Alterado
- Os artifacts intermediários do workflow de release (handoff de binários entre jobs) agora expiram em 1 dia (`retention-days: 1`), para limitar o storage de artifacts de Actions.

### Adicionado
- Setup de ESLint que faltava para o script `pnpm lint` (quebrava com `eslint: command not found` desde sempre): `.eslintrc.js` e `.prettierrc` no mesmo padrão do `zsc-backend` (eslint 8, `@typescript-eslint` 6, integração prettier) e step `Lint` no CI, entre build e testes. O código foi normalizado com `eslint --fix` (formatação prettier, sem mudança de comportamento) e os 5 erros reais foram corrigidos: import não usado em teste, destructure intencional coberto por `ignoreRestSiblings`/`varsIgnorePattern` e blocos `catch` vazios documentados. Restam 105 warnings de `no-explicit-any` (nível warn, mesmo padrão do backend).

### Seguranca
- Dependências de desenvolvimento atualizadas para fechar 5 alertas de vulnerabilidade (nenhuma afeta o binário distribuído, que só carrega dependências de produção): `js-yaml` 3.14.2 -> 3.15.x (CVE-2026-59869 alto, CVE-2026-53550 médio; DoS por merge keys em YAML), `brace-expansion` 1.1.15 -> 1.1.16+ (CVE-2026-13149 alto; DoS por expansão exponencial de `{}`), `esbuild` 0.27.7 -> 0.28.x via bump do `@yao-pkg/pkg` 6.20 -> 6.22 (GHSA-g7r4-m6w7-qqqr baixo; path traversal do dev server no Windows, servidor que o CLI não usa) e `tar` 7.5.19 -> 7.5.21+ (GHSA-r292-9mhp-454m moderado). Fixos aplicados via `pnpm.overrides` no `package.json`; `pnpm audit` passa a reportar zero vulnerabilidades.

### Alterado
- Workflows de CI (`ci.yml` e `release.yml`) passam a cancelar runs obsoletos do mesmo ref (`concurrency` com `cancel-in-progress`, grupo por workflow+ref) e o CI deixa de disparar para mudanças apenas em arquivos Markdown (`paths-ignore: ['**.md']` no push/pull_request) e o trigger de push fica restrito à `main` (antes, pushes em branches `feature/**`/`fix/**` disparavam um run duplicado do mesmo trabalho do PR). Reduz o consumo de minutos do GitHub Actions.

## [0.12.1] - 2026-08-05

### Adicionado
- Múltiplas contas logadas (perfis de sessão): cada perfil vira uma sessão independente em `~/.config/zsc/sessions/<perfil>.json` (mode 0600), com usuário/email gravados no login. O perfil ativo é resolvido por precedência: flag global `--profile` > env `ZS_PROFILE` > campo `session` do `zs.toml` (ao lado do `zs.yaml`, commitável) > default global definido por `zs session use <perfil>` > perfil `default`. Novos comandos `zs session list` (lista perfis com usuário/email, marcando o ativo e a origem da seleção) e `zs session use <perfil>`. `zs login`/`zs logout` aceitam `--profile`; `zs whoami` passa a exibir o perfil ativo e sua origem. Ao rodar um comando com um perfil sem sessão, o CLI autentica na hora (via `ZS_ACCESS_TOKEN`/`ZS_REFRESH_TOKEN` em CI, ou prompt interativo de login com 2FA); sem TTY, falha com erro claro (`Profile "X" has no session. Run "zs login --profile X" first.`).

### Alterado
- A sessão que vivia em `~/.config/zsc/config.json` migra transparentemente para o perfil `default` (`sessions/default.json`) na primeira execução, sem perder o login atual. O `config.json` passa a guardar apenas configurações globais (`backendUrl`, `lastUpdateCheck`, `activeProfile`).

### Corrigido
- Migração da sessão legada não perde mais os tokens quando dois processos `zs` rodam ao mesmo tempo na primeira execução após o upgrade: as escritas de configuração passam a ser atômicas (arquivo temporário + rename), eliminando leituras de arquivo parcialmente escrito que faziam um processo sobrescrever a sessão migrada pelo outro.

### Seguranca
- O `activeProfile` gravado no `config.json` passa por a mesma validação de nome de perfil das demais fontes (`--profile`, `ZS_PROFILE`, `zs.toml`): um valor com `..` ou separadores de caminho deixava a resolução de sessão ler/gravar arquivos fora de `~/.config/zsc/sessions/`. Valor inválido agora falha com erro claro orientando a correção (`zs session use default`).
- Arquivos de sessão pré-existentes com permissão aberta (ex.: 0644) voltam para 0600 na próxima escrita, e os diretórios `~/.config/zsc` e `~/.config/zsc/sessions` são criados/ajustados para 0700.
- Nomes de perfil com mais de 64 caracteres são rejeitados na validação, em vez de explodir com um erro cru de `ENAMETOOLONG` no meio do login.

## [0.12.0] - 2026-08-05

### Adicionado
- Replicação multi-node de Managed Databases (Fase 2): `zs db create` ganha a flag `--replicas <0|1|2>`, que define quantas réplicas de leitura em outros nodes o banco terá (failover automático; `0` = single-node, sem HA). Sem a flag o CLI não envia o campo e vale o default do backend (1 réplica). Valores fora de 0-2 são rejeitados com erro claro.
- `zs db list` passa a exibir a coluna `Replicas`, com o resumo das réplicas de leitura vivas (ex.: `1 streaming`, `2 syncing`, `1 failed`, `0` para single-node); réplica com falha domina o resumo para se destacar na tabela.
- `zs db create` imprime o resumo de réplicas logo após a criação, e `zs db connection` menciona a `DATABASE_READ_URL` quando o banco tem réplica streaming: apps atachadas via `database:` no `zs.yaml` recebem a variável apontando para a réplica quando uma divide o node da app (senão ela aponta para o primário).

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
