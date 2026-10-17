"""Build a deterministic Komari import archive, never including local credentials."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "komari-theme.json").read_text())
assert (root / "dist/index.html").is_file(), "Build the theme first"
assert (root / manifest["preview"]).is_file(), "Generate preview.png before packaging"
release = root / "releases"
release.mkdir(exist_ok=True)
output = release / "nekomari-mint.zip"
files = [root / "komari-theme.json", root / manifest["preview"], root / "LICENSE"]
files += sorted(p for p in (root / "dist").rglob("*") if p.is_file())
with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        info = ZipInfo(path.relative_to(root).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(release / "SHA256SUMS.txt").write_text(f"{digest}  {output.name}\n")
print(f"{output}\nsha256: {digest}")
