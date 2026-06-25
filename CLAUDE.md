# CLAUDE.md: zsc-cli

> Veja o `CLAUDE.md` da raiz para visão geral, glossário e time de agentes. Repositório **a construir**; este arquivo define o alvo.

## Papel

Cliente de terminal para Developers controlarem suas aplicações na ZSC: login, deploy, listar, logs, parar/remover. Abstrai o `zsc-backend` (GraphQL) e o `zsc-maestro`. É a porta de entrada de devs que preferem terminal ao portal web.

## Decisão de stack

TypeScript/Node, conforme `documentation/Applications/zsc-tool/Architecture.md` (a doc usa o nome `zsc-tool-cli`). Distribuível via npm. Compatível com zsh/bash/sh. Decisão confirmada com a diretoria; registre como ADR se mudar (skill `system-design-adr`).

## Stack alvo

Node + TypeScript; `yargs` ou `commander` (parsing); `axios`/`node-fetch` (GraphQL/REST); `conf` ou `keytar` (sessão/token seguro); `inquirer` (prompts); JWT consumido do backend. Gerenciador: `yarn`.

## Arquitetura

Clean Architecture adaptada para CLI (skill `clean-architecture-node`): `domain` (tipos e validações puras) → `application` (casos de uso: `loginUser`, `deployApplication`, `listApplications`, `streamLogs`, `stopApplication`) → `infrastructure` (cliente HTTP/GraphQL, store de sessão) → `presentation` (definição de comandos e formatação de saída).

## Comandos da CLI (MVP)

- `zs login`: autenticação (usuário/senha ou token), suporte a múltiplas sessões/profiles.
- `zs deploy`: sobe uma aplicação (imagem de container) na malha.
- `zs list`: lista aplicações e instâncias.
- `zs logs`: logs de uma instância.
- `zs stop`: para uma aplicação.

## Regras locais

- Token de sessão armazenado de forma segura (keytar quando disponível). Nunca logar segredo.
- Mensagens de sucesso/erro/progresso claras; códigos de saída corretos para scripting.
- Consome o mesmo schema GraphQL do website; mantenha tipos sincronizados.
- Termo Developer no produto e na ajuda.

## Próximos passos para iniciar

1. `yarn init` e configurar TypeScript + ESLint + Jest seguindo o padrão dos outros repos.
2. Esqueleto de pastas Clean Architecture.
3. Implementar `zs login` ponta a ponta primeiro (desbloqueia os demais).

## Agentes responsáveis

`backend-engineer` (execução), `head-engenharia` (DX/arquitetura).
