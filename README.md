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

## Authentication

```sh
zs login                 # interactive: prompts for email and password
zs login -e you@example.com -p <password>
```

### Two-factor authentication (TOTP)

If your account has 2FA enabled, the CLI asks for the code after the password:

```sh
zs login -e you@example.com -p <password>
# 2FA code: 123456
```

The prompt accepts the current TOTP from your authenticator app or one of your
recovery codes (`xxxx-xxxx-xxxx-xxxx`). A wrong code can be retried up to 3 times before
the login fails.

In non-interactive environments (CI, pipelines), the prompt is never shown;
pass the code with `--otp` instead:

```sh
zs login -e "$ZS_EMAIL" -p "$ZS_PASSWORD" --otp "$ZS_OTP"
```

## Private images (registry credentials)

To pull private images (e.g. GitHub Container Registry) the backend needs a
registry credential stored for your account:

```sh
# Interactive: prompts for the token with echo off.
zs registry login ghcr.io --username <user>

zs registry list            # shows stored hosts (only a masked hint of the token, e.g. ****ab12)
zs registry logout ghcr.io  # removes a stored credential
```

### Non-interactive (CI)

Use `--token-stdin` to read the token from stdin, so it never lands in the
process arguments or shell history. The registry host (positional argument) and
`--username` must be provided:

```sh
printf %s "$REGISTRY_TOKEN" | zs registry login ghcr.io --username "$USER" --token-stdin
```

This is what a deploy pipeline runs to (re)store the credential before `zs deploy`.

## Stack alvo

TypeScript/Node, yargs/commander, axios, conf/keytar, inquirer. Distribuição via npm. Compatível com zsh/bash/sh.
