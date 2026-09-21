"""只读上传检查：不输出密钥，不访问模型，不改变 Git 历史。"""
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GIT = os.environ.get("UPLOAD_CHECK_GIT", "git")
SKIP = {".git", "node_modules", ".venv", "venv", ".next", ".demo-build", "__pycache__", ".pytest_cache"}
PATTERNS = [
    re.compile(rb"\bsk-[A-Za-z0-9_-]{25,}"),
    re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})"),
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"\bAKIA[A-Z0-9]{16}\b"),
]
findings = set()


def inspect(path, content, source):
    if any(pattern.search(content) for pattern in PATTERNS):
        findings.add((source, path, "credential-shaped content"))
    if Path(path).name == ".env.example":
        for line in content.decode("utf-8", errors="replace").splitlines():
            if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if any(word in key.upper() for word in ("API_KEY", "SECRET", "ACCESS_KEY", "TOKEN", "PASSWORD")) and value.strip().strip("\"'"):
                findings.add((source, path, "nonempty credential field in example"))


for directory, dirs, files in os.walk(ROOT):
    dirs[:] = [name for name in dirs if name not in SKIP]
    for name in files:
        file = Path(directory) / name
        rel = file.relative_to(ROOT).as_posix()
        if file.is_symlink():
            findings.add(("working", rel, "symlink requires review"))
            continue
        inspect(rel, file.read_bytes(), "working")

result = subprocess.run([GIT, "rev-parse", "--show-toplevel"], cwd=ROOT, capture_output=True, text=True)
if result.returncode or Path(result.stdout.strip()).resolve() != ROOT:
    raise SystemExit("FAIL: upload directory must be its own Git repository")

tracked = subprocess.check_output([GIT, "ls-files", "-z"], cwd=ROOT).decode().split("\0")
for path in filter(None, tracked):
    file = Path(path)
    if (ROOT / file).is_symlink() or any(part in SKIP for part in file.parts):
        findings.add(("index", path, "symlink or dependency/build artifact must not be uploaded"))
    allowed_roots = {"backend", "frontend", "scripts", ".gitignore", "README.md", "SECURITY.md", "LICENSE"}
    if file.parts[0] not in allowed_roots or file.name in {"AGENTS.md", "CLAUDE.md"}:
        findings.add(("index", path, "outside room-renovation repository scope"))
    if ((file.name.startswith(".env") and file.name != ".env.example")
            or file.suffix in {".db", ".sqlite3", ".pem", ".key", ".p12", ".pfx", ".zip"}
            or "data" in file.parts or path.startswith("docs/evidence/")):
        findings.add(("index", path, "private/runtime file must not be uploaded"))

objects = subprocess.check_output([GIT, "rev-list", "--objects", "--all"], cwd=ROOT).decode().splitlines()
scanned = 0
for entry in objects:
    oid, _, path = entry.partition(" ")
    if subprocess.check_output([GIT, "cat-file", "-t", oid], cwd=ROOT).strip() != b"blob":
        continue
    inspect(path, subprocess.check_output([GIT, "cat-file", "blob", oid], cwd=ROOT), "history")
    scanned += 1
for source, path, reason in sorted(findings):
    print(f"FAIL [{source}] {path}: {reason}")
if findings:
    raise SystemExit(1)
print(f"PASS: {len(list(filter(None, tracked)))} tracked files; {scanned} history blobs; no matched credentials or private tracked paths")
