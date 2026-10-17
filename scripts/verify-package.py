"""Validate the exact install artifact rather than a source directory."""
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
with ZipFile(root / "releases/nekomari-mint.zip") as archive:
    names = archive.namelist()
    assert "komari-theme.json" in names and "dist/index.html" in names
    assert all(not name.startswith("/") and ".." not in Path(name).parts for name in names)
    assert all(name in {"komari-theme.json", "preview.png", "LICENSE"} or name.startswith("dist/") for name in names)
    manifest = json.loads(archive.read("komari-theme.json"))
    # The store's current submission validator is stricter than the theme docs.
    for field in ("name", "short", "version", "author", "description"):
        assert isinstance(manifest.get(field), str) and manifest[field].strip(), field
    assert manifest["short"] == "nekomari-mint" and manifest["version"] == json.loads((root / "package.json").read_text())["version"]
    assert manifest["preview"] in names
    script = b"\n".join(archive.read(name) for name in names if name.endswith(".js"))
    assert b"node-0" not in script and b"fixture" not in script
print("Install archive structure, version, and fixture exclusion verified")
