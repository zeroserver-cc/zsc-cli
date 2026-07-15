# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

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
