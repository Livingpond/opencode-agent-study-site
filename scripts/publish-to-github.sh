#!/usr/bin/env bash
set -euo pipefail

# Publish this compiled study site by committing to GitHub. Cloudflare Pages then
# builds and deploys automatically from the GitHub main branch.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

GITHUB_OWNER="${GITHUB_OWNER:-Livingpond}"
REPO_NAME="${REPO_NAME:-opencode-agent-study-site}"
BRANCH="${BRANCH:-main}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
REMOTE_URL="${REMOTE_URL:-https://github.com/${GITHUB_OWNER}/${REPO_NAME}.git}"
PAGES_URL="${PAGES_URL:-https://opencode-study.korah-group.top}"

INIT_REPO=0
ALLOW_EMPTY=0
DRY_RUN=0
SKIP_BUILD=0
VISIBILITY="public"
COMMIT_MESSAGE=""

usage() {
  cat <<EOF
Usage:
  scripts/publish-to-github.sh "Update study site"

Common examples:
  scripts/publish-to-github.sh "Update chapter 10"
  scripts/publish-to-github.sh --allow-empty "Trigger Cloudflare Pages deployment"
  scripts/publish-to-github.sh --dry-run "Check what would be published"

First-time setup reference:
  scripts/publish-to-github.sh --init-repo "Initial study site"

Options:
  --init-repo       Initialize git if needed, create the GitHub repo if missing,
                    and configure the remote.
  --allow-empty     Create an empty commit when there are no file changes.
  --skip-build      Do not run the local Starlight build before committing.
  --dry-run         Print the commands without changing anything.
  --private         Create the GitHub repo as private when using --init-repo.
  --public          Create the GitHub repo as public when using --init-repo.
  -h, --help        Show this help.

Environment overrides:
  GITHUB_OWNER=${GITHUB_OWNER}
  REPO_NAME=${REPO_NAME}
  BRANCH=${BRANCH}
  REMOTE_URL=${REMOTE_URL}
  PAGES_URL=${PAGES_URL}
EOF
}

run() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'

  if [[ "${DRY_RUN}" == "0" ]]; then
    "$@"
  fi
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init-repo)
      INIT_REPO=1
      shift
      ;;
    --allow-empty)
      ALLOW_EMPTY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --private)
      VISIBILITY="private"
      shift
      ;;
    --public)
      VISIBILITY="public"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      COMMIT_MESSAGE="${*:-}"
      break
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      COMMIT_MESSAGE="$1"
      shift
      ;;
  esac
done

[[ -n "${COMMIT_MESSAGE}" ]] || COMMIT_MESSAGE="Update study site"

need_cmd git
cd "${SITE_DIR}"

if [[ "${SKIP_BUILD}" == "0" && -f package.json ]]; then
  need_cmd pnpm
  run pnpm run build
fi

if [[ ! -d .git ]]; then
  [[ "${INIT_REPO}" == "1" ]] || die "This directory is not a git repo. Re-run with --init-repo if this is the first publish."
  run git init
fi

if [[ "${INIT_REPO}" == "1" ]]; then
  need_cmd gh
  run gh auth status
  run gh auth setup-git

  if ! gh repo view "${GITHUB_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
    run gh repo create "${GITHUB_OWNER}/${REPO_NAME}" "--${VISIBILITY}" --source . --remote "${REMOTE_NAME}"
  fi
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  run gh auth setup-git
fi

if ! git remote get-url "${REMOTE_NAME}" >/dev/null 2>&1; then
  [[ "${INIT_REPO}" == "1" ]] || die "Missing remote '${REMOTE_NAME}'. Re-run with --init-repo or set it manually."
  run git remote add "${REMOTE_NAME}" "${REMOTE_URL}"
fi

CURRENT_REMOTE="$(git remote get-url "${REMOTE_NAME}")"
if [[ "${CURRENT_REMOTE}" != "${REMOTE_URL}" ]]; then
  printf 'Notice: %s is currently %s\n' "${REMOTE_NAME}" "${CURRENT_REMOTE}"
  printf 'Expected default is %s. Keeping existing remote.\n' "${REMOTE_URL}"
fi

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  CURRENT_BRANCH="$(git branch --show-current)"
  if [[ "${CURRENT_BRANCH}" != "${BRANCH}" ]]; then
    run git branch -M "${BRANCH}"
  fi
else
  run git checkout -B "${BRANCH}"
fi

CHANGES="$(git status --short)"
if [[ -z "${CHANGES}" && "${ALLOW_EMPTY}" == "0" ]]; then
  printf 'No local changes to publish. Use --allow-empty to trigger a redeploy anyway.\n'
  printf 'GitHub: https://github.com/%s/%s\n' "${GITHUB_OWNER}" "${REPO_NAME}"
  printf 'Pages:  %s\n' "${PAGES_URL}"
  exit 0
fi

if [[ -n "${CHANGES}" ]]; then
  printf 'Changes to publish:\n%s\n' "${CHANGES}"
  run git add -A
  run git commit -m "${COMMIT_MESSAGE}"
else
  run git commit --allow-empty -m "${COMMIT_MESSAGE}"
fi

run git push -u "${REMOTE_NAME}" "${BRANCH}"

if [[ "${DRY_RUN}" == "1" ]]; then
  printf '\nDry run completed. Nothing was committed or pushed.\n'
else
  printf '\nPublished.\n'
fi
printf 'GitHub: https://github.com/%s/%s\n' "${GITHUB_OWNER}" "${REPO_NAME}"
printf 'Pages:  %s\n' "${PAGES_URL}"
