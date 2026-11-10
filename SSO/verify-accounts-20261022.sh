#!/usr/bin/env bash
# Verify production data without changing it. Run from a Linux shell, not psql.
set -euo pipefail
umask 077

runtime=${1:-/opt/hackhub/runtime}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
sql="$script_dir/verify-accounts-20261022.sql"
test -f "$sql"
command -v python3 > /dev/null
cd -- "$runtime"
test -f compose.sh
bash compose.sh config --quiet

mkdir -p account-reconcile-reports
report_dir=$(mktemp -d "$PWD/account-reconcile-reports/verify-$(date +%Y%m%d-%H%M%S)-XXXXXX")
echo "Report directory: $report_dir"

if ! bash compose.sh exec -T postgres psql -X -q -At -U hackhub -d hackhub \
    -v ON_ERROR_STOP=1 -f - < "$sql" > "$report_dir/result.json"; then
  echo 'Verification query failed; no success conclusion can be drawn. Database was not changed.' >&2
  exit 1
fi

python3 - "$report_dir" <<'PY' | tee "$report_dir/result.txt"
import csv
import json
from pathlib import Path
import sys

directory = Path(sys.argv[1])
result = json.loads((directory / 'result.json').read_text())
assert result['read_only'] is True, 'Expected a read-only database transaction'
checks = result['checks']
assert len(checks) == 20, 'Expected exactly 20 verification rows'
fields = ['category', 'entity_id', 'expected_email_or_name', 'actual_name',
          'actual_email', 'expected_role', 'actual_role', 'expected_object_id',
          'actual_object_id', 'object_id_owner_profile_id', 'status', 'passed']
with (directory / 'verification-details.csv').open('w', newline='', encoding='utf-8-sig') as output:
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(checks)

print('Checked at:', result['checked_at'])
print('READ-ONLY verification; no account changes were made.')
for summary in result['summary']:
    print(f"{summary['category']}: {summary['passed']}/{summary['total']} PASS, {summary['failed']} FAIL")
print()
for row in checks:
    verdict = 'PASS' if row['passed'] else 'FAIL'
    print(f"[{verdict}] {row['expected_email_or_name']} | {row['status']} | {row['entity_id']}")
    if row['category'] == 'sso_binding' or not row['passed']:
        print('  expected Object ID:', row['expected_object_id'] or '-')
        print('  actual Object ID:  ', row['actual_object_id'] or '-')
        if row['object_id_owner_profile_id']:
            print('  Object ID owner:   ', row['object_id_owner_profile_id'])
print()
print('CSV:', directory / 'verification-details.csv')
if result['all_checks_passed']:
    print('ALL CHECKS PASSED (20/20).')
else:
    print('CHECKS FAILED: inspect the FAIL rows; do not infer success from the spreadsheet.')
    sys.exit(2)
PY
