#!/usr/bin/env bash
# Run on the target server from a Linux shell, not inside psql.
set -euo pipefail
umask 077

mode=${1:-preview}
runtime=${2:-/opt/hackhub/runtime}
case "$mode" in
  preview) apply=false ;;
  apply) apply=true ;;
  *) echo 'Usage: bash reconcile-accounts-20261022.sh preview|apply [runtime]' >&2; exit 2 ;;
esac
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
sql="$script_dir/reconcile-accounts-20261022.sql"
test -f "$sql"
cd -- "$runtime"
test -f compose.sh
bash compose.sh config --quiet

mkdir -p account-reconcile-reports
report_dir=$(mktemp -d "$PWD/account-reconcile-reports/${mode}-$(date +%Y%m%d-%H%M%S)-XXXXXX")
echo "Report directory: $report_dir"

if [[ "$mode" == apply ]]; then
  echo 'Backing up the database before account changes...'
  bash compose.sh exec -T postgres pg_dump -U hackhub -d hackhub -Fc > "$report_dir/before.dump"
  test -s "$report_dir/before.dump"
  bash compose.sh exec -T postgres pg_restore --list < "$report_dir/before.dump" > /dev/null
  echo 'Backup archive created and its directory is readable.'
fi

if bash compose.sh exec -T postgres psql -X -U hackhub -d hackhub \
    -v ON_ERROR_STOP=1 -v "apply=$apply" -f - < "$sql" 2>&1 | tee "$report_dir/result.txt"; then
  echo "Completed mode: $mode"
else
  echo 'Failed. Do not continue or bypass checks. Review the report and database state before retrying.' >&2
  exit 1
fi
