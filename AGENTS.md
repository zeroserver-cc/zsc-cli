# AGENTS.md: zsc-cli

> Veja o `AGENTS.md` da raiz para visao geral, glossario e time de agentes. Repositorio **a construir**; este arquivo define o alvo.

## Papel

Cliente de terminal para Developers controlarem suas aplicacoes na ZSC: login, deploy, listar, logs, parar/remover. Abstrai o `zsc-backend` (GraphQL) e o `zsc-maestro`. E a porta de entrada de devs que preferem terminal ao portal web.

## Decisao de stack

TypeScript/Node, conforme `documentation/Applications/zsc-tool/Architecture.md` (a doc usa o nome `zsc-tool-cli`). Distribuivel via npm. Compativel com zsh/bash/sh. Decisao confirmada com a diretoria; registre como ADR se mudar (skill `system-design-adr`).

## Stack alvo

Node + TypeScript; `yargs` ou `commander` (parsing); `axios`/`node-fetch` (GraphQL/REST); `conf` ou `keytar` (sessao/token seguro); `inquirer` (prompts); JWT consumido do backend. Gerenciador: `yarn`.

## Arquitetura

Clean Architecture adaptada para CLI (skill `clean-architecture-node`): `domain` (tipos e validacoes puras) -> `application` (casos de uso: `loginUser`, `deployApplication`, `listApplications`, `streamLogs`, `stopApplication`) -> `infrastructure` (cliente HTTP/GraphQL, store de sessao) -> `presentation` (definicao de comandos e formatacao de saida).

## Comandos da CLI (MVP)

- `zs login`: autenticacao (usuario/senha ou token), suporte a multiplas sessoes/profiles.
- `zs deploy`: sobe uma aplicacao (imagem de container) na malha.
- `zs list`: lista aplicacoes e instancias.
- `zs logs`: logs de uma instancia.
- `zs stop`: para uma aplicacao.

## Regras locais

- Token de sessao armazenado de forma segura (keytar quando disponivel). Nunca logar segredo.
- Mensagens de sucesso/erro/progresso claras; codigos de saida corretos para scripting.
- Consome o mesmo schema GraphQL do website; mantenha tipos sincronizados.
- Termo Developer no produto e na ajuda.

## Proximos passos para iniciar

1. `yarn init` e configurar TypeScript + ESLint + Jest seguindo o padrao dos outros repos.
2. Esqueleto de pastas Clean Architecture.
3. Implementar `zs login` ponta a ponta primeiro (desbloqueia os demais).

## Agentes responsaveis

`backend-engineer` (execucao), `head-engenharia` (DX/arquitetura).
