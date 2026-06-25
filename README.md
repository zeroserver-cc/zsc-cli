# zsc-cli

Cliente de linha de comando da **ZeroServer Community Cloud** para Developers. Permite autenticar, fazer deploy, listar, ver logs e parar aplicações na nuvem comunitária, direto do terminal.

> Repositório em estágio inicial (scaffold). Ver `CLAUDE.md` para a especificação alvo e os próximos passos. Arquitetura de referência em `../documentation/Applications/zsc-tool/Architecture.md`.

## Status

- [ ] Setup TypeScript + ESLint + Jest
- [ ] Esqueleto Clean Architecture
- [ ] `zs login`
- [ ] `zs deploy`
- [ ] `zs list`
- [ ] `zs logs`
- [ ] `zs stop`

## Stack alvo

TypeScript/Node, yargs/commander, axios, conf/keytar, inquirer. Distribuição via npm. Compatível com zsh/bash/sh.
