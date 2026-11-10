#!/usr/bin/env python3
"""Update only Bosch SSO settings in an existing runtime .env; never print values."""

import argparse
import getpass
import os
from pathlib import Path
import re
import stat
import tempfile
import warnings


def dotenv_quote(value):
    # Compose uses $$ for a literal dollar; double quotes support escaped slashes/quotes.
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("$", "$$") + '"'


def update_env(path, values):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Expected an existing regular .env file.")
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    seen = set()
    result = []
    for line in lines:
        match = re.match(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", line)
        key = match.group(1) if match else None
        if key in values:
            if key in seen:
                raise ValueError("Duplicate SSO setting; resolve duplicate keys first.")
            seen.add(key)
            result.append(key + "=" + dotenv_quote(values[key]) + "\n")
        else:
            result.append(line)
    if result and not result[-1].endswith("\n"):
        result[-1] += "\n"
    for key, value in values.items():
        if key not in seen:
            result.append(key + "=" + dotenv_quote(value) + "\n")
    info = path.stat()
    if info.st_uid != os.geteuid():
        raise ValueError("Run as the .env owner (or use that account via sudo).")
    descriptor, temporary = tempfile.mkstemp(prefix=".env.sso-", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            os.fchmod(output.fileno(), stat.S_IRUSR | stat.S_IWUSR)
            os.fchown(output.fileno(), info.st_uid, info.st_gid)
            output.write("".join(result))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("configure", "enable", "disable"))
    parser.add_argument("--runtime", default="/opt/hackhub/runtime")
    args = parser.parse_args()
    path = Path(args.runtime) / ".env"
    values = {"APP_SSO_ENABLED": "true" if args.action == "enable" else "false"}
    if args.action == "configure":
        if not os.isatty(0):
            parser.error("Use an interactive terminal; Secret input must not echo.")
        warnings.simplefilter("error", getpass.GetPassWarning)
        secret = getpass.getpass("Client Secret VALUE (hidden): ")
        confirm = getpass.getpass("Repeat Client Secret VALUE (hidden): ")
        if not secret or secret != confirm or any(ord(c) < 32 for c in secret):
            parser.error("Secret is empty, does not match, or contains a control character.")
        values.update({
            "APP_SSO_TENANT_ID": "0ae51e19-07c8-4e4b-bb6d-648ee58410f4",
            "APP_SSO_CLIENT_ID": "bb6d57e7-a971-433f-882d-01d7ef3b0e49",
            "APP_SSO_CLIENT_SECRET": secret,
            "APP_SSO_PUBLIC_BASE_URL": "https://cnaward.bosch-datanexus.com",
            "APP_AUTH_COOKIE_SECURE": "true",
        })
    try:
        update_env(path, values)
    except (OSError, ValueError):
        parser.exit(1, "Could not update .env. Check ownership, path and duplicate keys.\n")
    print("Updated SSO settings only. File mode is 600. Recreate API to apply.")


if __name__ == "__main__":
    main()
