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
- [ ] `zs restart`
- [ ] `zs db` (managed databases: `create`, `list`, `connection`, `delete`, `restore`)

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

### API keys (CI and automation)

For CI/CD and scripts, create an API key in the portal (format `zsk_...`) and
log in with it instead of email/password:

```sh
# Interactive: hidden prompt for the key.
zs login --api-key

# Non-interactive: pipe the key on stdin, so it never lands in argv or shell history.
printf %s "$ZS_API_KEY" | zs login --api-key --token-stdin
```

API keys carry the scopes you grant them in the portal; a command that needs a
scope the key does not have fails with `Missing scope: <scope>`. Keys can also
expire or be revoked — in that case every command fails with an authentication
error and you must generate a new key in the portal and run `zs login
--api-key` again. Unlike JWT sessions, API key sessions are never refreshed
automatically: the key is used as-is until it stops working.

### Session profiles (multiple logins)

You can stay logged into several accounts at once. Each profile keeps its own
session under `~/.config/zsc/sessions/<profile>.json`; the active profile is
resolved in this order:

1. `--profile <name>` global flag
2. `ZS_PROFILE` environment variable
3. `session = "<name>"` in a `zs.toml` next to your `zs.yaml` (commit it to pin
   the project to the right account)
4. the global default set with `zs session use <name>`
5. the `default` profile

```sh
zs login --profile cliente-x     # log a second account into its own profile
zs session list                  # all profiles (* = active, with its source)
zs session use cliente-x         # make cliente-x the global default
zs logout --profile cliente-x    # end just that profile's session
```

Running any command with a profile that has no session yet authenticates on
the spot: interactively it asks for email/password (with the usual 2FA flow);
in CI it uses `ZS_ACCESS_TOKEN` (plus optional `ZS_REFRESH_TOKEN`), and with no
terminal available it fails with `Profile "X" has no session...`. A session
created before profiles existed is migrated automatically into the `default`
profile on the first run — nothing to do.

### Teams (acting as another account)

If you belong to teams, you can act as a team account instead of your own:

```sh
zs account              # shows the account you are currently acting as
zs account list         # all accounts you can act as (* = active)
zs account switch acme  # by exact username or unique id prefix
```

Switching re-issues your session tokens scoped to the target account and shows
a confirmation (`Now acting as @acme (team member)`). `zs whoami` also prints
the active account line. A fresh `zs login` always starts on your own account.
Account switching requires a session login — it is not available for API key
sessions, which are bound to the key's owner.

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
