# AGENTS.md: zsc-cli

> Veja o `AGENTS.md` da raiz para visao geral, glossario e time de agentes.

## Papel

Cliente de terminal para Developers controlarem suas aplicacoes na ZSC: login, deploy, listar, logs, parar/remover. Abstrai o `zsc-backend` (GraphQL) e o `zsc-maestro`. E a porta de entrada de devs que preferem terminal ao portal web.

## Decisao de stack

TypeScript/Node, conforme `documentation/Applications/zsc-tool/Architecture.md` (a doc usa o nome `zsc-tool-cli`). Distribuivel via npm. Compativel com zsh/bash/sh. Decisao confirmada com a diretoria; registre como ADR se mudar (skill `system-design-adr`).

## Stack alvo

Node + TypeScript; `commander` (parsing); `axios` (GraphQL/REST); JWT consumido do backend. Gerenciador: `pnpm`.

## Arquitetura

Clean Architecture adaptada para CLI (skill `clean-architecture-node`): `domain` (tipos e validacoes puras) -> `application` (casos de uso: `loginUser`, `deployApplication`, `listApplications`, `streamLogs`, `stopApplication`) -> `infrastructure` (cliente HTTP/GraphQL, store de sessao) -> `presentation` (definicao de comandos e formatacao de saida).

## Comandos implementados

- `zs login` / `zs logout`: autenticacao (usuario/senha ou token).
- `zs deploy`: sobe uma aplicacao (imagem de container) na malha; aceita preferencia geografica de node via `--country`/`--region` ou secao `placement:` no `zs.yaml` (preferencia suave, com fallback para qualquer node elegivel).
- `zs list`: lista aplicacoes e instancias.
- `zs logs`: logs de uma instancia.
- `zs stop`: para uma aplicacao.
- `zs remove`: remove uma aplicacao.
- `zs nodes`: inspeciona nos da malha.
- `zs node configure`: provedor define limites de CPU/memoria/storage compartilhados do node.
- `zs registry login/list/logout`: gerencia credenciais de registries privados.
- `zs config`: gerencia configuracao local (endpoint, profile).
- `zs upgrade`: auto-atualizacao do binario.

## Regras locais

- Token de sessao armazenado de forma segura (keytar quando disponivel). Nunca logar segredo.
- Mensagens de sucesso/erro/progresso claras; codigos de saida corretos para scripting.
- Consome o mesmo schema GraphQL do website; mantenha tipos sincronizados.
- Termo Developer no produto e na ajuda.

## Proximos passos

1. Expandir cobertura de testes (jest).
2. Implementar `zs deploy` com suporte a variaveis de ambiente e volumes.
3. Suporte a multiplos profiles/sessoes no `zs login`.

## Registro de mudanças

Ao final de cada ciclo de implementacao, atualize o `CHANGELOG.md` deste repositorio. Use a secao `[Unreleased]` e as categorias `Adicionado`, `Alterado`, `Corrigido`, `Removido`, `Depreciado` e `Seguranca`. Agrupe as entradas por tipo de mudanca, descreva o impacto em linguagem simples e faca o commit junto com as demais alteracoes. Nao registre mudancas puramente cosmeticas ou de formatacao, a menos que alterem comportamento observavel.

## Agentes responsaveis

`backend-engineer` (execucao), `head-engenharia` (DX/arquitetura).
