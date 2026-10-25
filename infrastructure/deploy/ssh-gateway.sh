#!/usr/bin/env bash
set -Eeuo pipefail
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})\ ([1-9][0-9]{0,15})$ ]]; then
    exec sudo -n /usr/local/sbin/crednexus-release "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
echo 'Only deploy <full SHA> <GitHub run ID> is allowed' >&2
exit 64
