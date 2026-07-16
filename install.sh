#!/bin/sh
# ZeroServer Community Cloud CLI installer (ZSC-117).
#
#   curl -fsSL https://raw.githubusercontent.com/zeroserver-cc/zsc-cli/main/install.sh | sh
#
# Downloads the standalone `zs` binary for this OS/arch from the GitHub Releases
# of zeroserver-cc/zsc-cli, verifies its checksum, and installs it to
# /usr/local/bin/zs. No Node.js required. Idempotent.
#
# Runs without sudo when the install directory is writable by the current user;
# otherwise it automatically prefixes the necessary commands with sudo so the
# user does not have to re-run the whole script as root.
#
# Env overrides:
#   ZS_VERSION       release tag to install (default: latest)
#   ZS_INSTALL_DIR   install directory (default: /usr/local/bin)
set -eu

REPO="zeroserver-cc/zsc-cli"
BIN_NAME="zs"
INSTALL_DIR="${ZS_INSTALL_DIR:-/usr/local/bin}"

info() { printf '\033[0;36m==>\033[0m %s\n' "$1"; }
err() { printf '\033[0;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# --- pick a downloader -------------------------------------------------------
if command -v curl >/dev/null 2>&1; then
  dl() { curl -fsSL "$1" -o "$2"; }
  dl_stdout() { curl -fsSL "$1"; }
elif command -v wget >/dev/null 2>&1; then
  dl() { wget -qO "$2" "$1"; }
  dl_stdout() { wget -qO- "$1"; }
else
  err "neither curl nor wget found"
fi

# --- run a command with sudo only when the target directory is not writable --
# $1 = directory that must be writable; remaining args = command to run
sudo_if_needed() {
  dir="$1"
  shift
  if [ -w "$dir" ] 2>/dev/null; then
    "$@"
  else
    if command -v sudo >/dev/null 2>&1; then
      sudo "$@"
    else
      err "no write permission for ${dir} and sudo is not available; run as root or set ZS_INSTALL_DIR to a writable directory"
    fi
  fi
}

# --- detect OS/arch ----------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) plat="linux" ;;
  Darwin) plat="macos" ;;
  *) err "unsupported OS: $os" ;;
esac
case "$arch" in
  x86_64 | amd64) a="x64" ;;
  arm64 | aarch64) a="arm64" ;;
  *) err "unsupported arch: $arch" ;;
esac
asset="${BIN_NAME}-${plat}-${a}"

# --- resolve version ---------------------------------------------------------
version="${ZS_VERSION:-}"
if [ -z "$version" ]; then
  info "Resolving latest release of ${REPO}..."
  version="$(dl_stdout "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
  [ -n "$version" ] || err "could not resolve latest release tag (set ZS_VERSION)"
fi
info "Installing $REPO $version ($asset)"

base="https://github.com/${REPO}/releases/download/${version}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- download binary + checksum ---------------------------------------------
dl "${base}/${asset}" "${tmp}/${BIN_NAME}" || err "failed to download ${asset} (is it published for ${plat}-${a}?)"
if dl "${base}/${asset}.sha256" "${tmp}/${asset}.sha256" 2>/dev/null; then
  info "Verifying checksum..."
  expected="$(awk '{print $1}' "${tmp}/${asset}.sha256")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "${tmp}/${BIN_NAME}" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "${tmp}/${BIN_NAME}" | awk '{print $1}')"
  fi
  [ "$expected" = "$actual" ] || err "checksum mismatch (expected $expected, got $actual)"
else
  info "No checksum published; skipping verification."
fi
chmod +x "${tmp}/${BIN_NAME}"

# --- ad-hoc codesign on Apple Silicon ---------------------------------------
# Apple Silicon refuses to run unsigned arm64 Mach-O binaries: the kernel sends
# SIGKILL at exec ("zsh: killed"). The pkg-built binary ships unsigned, so
# ad-hoc sign it here, while it still lives in the writable temp dir (in-place
# codesign in a root-owned install dir would fail). Intel macOS runs unsigned
# binaries fine, so this is gated on arm64. Best-effort: warn, not fail.
if [ "$plat" = "macos" ] && [ "$a" = "arm64" ] && command -v codesign >/dev/null 2>&1; then
  info "Ad-hoc signing the binary for Apple Silicon..."
  xattr -c "${tmp}/${BIN_NAME}" 2>/dev/null || true
  if ! codesign -s - -f "${tmp}/${BIN_NAME}" >/dev/null 2>&1; then
    # We can't sign in place here (the install dir may be root-owned and the
    # binary carries a com.apple.provenance xattr), so print the manual recipe
    # instead: sign a temp copy in a writable dir, then copy it back with sudo.
    info "codesign failed. If 'zs' is killed on launch, run:"
    info "  c=\$(mktemp) && cp \"${INSTALL_DIR}/${BIN_NAME}\" \"\$c\" && xattr -c \"\$c\" && codesign -s - -f \"\$c\" && sudo cp \"\$c\" \"${INSTALL_DIR}/${BIN_NAME}\""
  fi
fi

# --- install (sudo only if needed) ------------------------------------------
target="${INSTALL_DIR}/${BIN_NAME}"

# Try to create the install directory without sudo first; this gives the user a
# clear, folder-specific error if neither the directory nor sudo are available.
if [ ! -d "$INSTALL_DIR" ]; then
  if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
    if ! command -v sudo >/dev/null 2>&1; then
      err "cannot create ${INSTALL_DIR} (permission denied) and sudo is not available; run as root or set ZS_INSTALL_DIR to a writable directory"
    fi
    info "Creating ${INSTALL_DIR} with sudo..."
    sudo mkdir -p "$INSTALL_DIR" || err "failed to create ${INSTALL_DIR} even with sudo"
  fi
fi

# Move the binary into place, elevating only when the install dir is not writable.
if ! sudo_if_needed "$INSTALL_DIR" mv "${tmp}/${BIN_NAME}" "$target"; then
  err "failed to write ${target}: no write permission for ${INSTALL_DIR} and sudo failed"
fi
if ! sudo_if_needed "$INSTALL_DIR" chmod +x "$target"; then
  err "failed to make ${target} executable: no write permission for ${INSTALL_DIR} and sudo failed"
fi

info "Installed $("$target" --version 2>/dev/null || echo "$BIN_NAME") to $target"
printf '\nNext: \033[1mzs login\033[0m, then \033[1mzs deploy\033[0m in a folder with a zs.yaml.\n'
