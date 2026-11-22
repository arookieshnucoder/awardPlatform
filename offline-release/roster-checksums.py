import hashlib
import sys
from zipfile import ZipFile

with ZipFile(sys.argv[1]) as jar:
    for name in ("nomination-roster.json", "team-member-directory.json"):
        content = jar.read(f"BOOT-INF/classes/{name}")
        if not content:
            raise SystemExit(f"Missing roster content: {name}")
        print(f"{hashlib.sha256(content).hexdigest()}  {name}")
