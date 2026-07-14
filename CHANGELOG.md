# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- Suporte à seção `ai` no `zs.yaml` (`gpu`, `llm`, `video`, `audio`, `image`), validada por `parseManifest` e encaminhada para o backend no input de `deployApplication`.
- Testes unitários para parsing e validação dos requisitos de IA no manifesto.
- Criação do arquivo `CHANGELOG.md` para rastreamento de mudanças.
