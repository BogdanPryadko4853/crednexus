#!/usr/bin/env bash
# Run on the operator's Mac after `gh auth login`, never on the VPS.
set -Eeuo pipefail
repo=BogdanPryadko4853/crednexus
key=${CREDNEXUS_ACTIONS_KEY:-/Users/bogdan/.ssh/crednexus_actions_ed25519}
hosts=${CREDNEXUS_ACTIONS_HOSTS:-/Users/bogdan/.ssh/crednexus_actions_known_hosts}
gh_cli=${CREDNEXUS_GH_CLI:-gh}
command -v "$gh_cli" >/dev/null || { echo 'Install GitHub CLI and run gh auth login first'; exit 1; }
gh() { command "$gh_cli" "$@"; }
gh auth status
[[ -s $key && -s $hosts ]] || { echo 'Missing private key or pinned host key file'; exit 1; }
[[ $(gh api "repos/$repo" --jq '.permissions.admin') == true ]] || {
    echo 'Repository administrator permissions are required'; exit 1;
}
gh api --method PUT "repos/$repo/environments/production" --input - >/dev/null <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
if ! gh api "repos/$repo/environments/production/deployment-branch-policies" \
    --jq '.branch_policies[].name' | grep -qx develop; then
    gh api --method POST "repos/$repo/environments/production/deployment-branch-policies" \
        -f name=develop -f type=branch >/dev/null
fi
gh secret set DEPLOY_HOST --repo "$repo" --env production --body 155.212.216.26
gh secret set DEPLOY_SSH_KEY --repo "$repo" --env production < "$key"
gh secret set DEPLOY_KNOWN_HOSTS --repo "$repo" --env production < "$hosts"
echo 'Production environment and three deployment secrets configured. No git push was performed.'
