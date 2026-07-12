import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
AGENT_UI_DIR = ROOT / "agent_ui"
DIST_DIR = AGENT_UI_DIR / "dist"

BUILD_TARGETS = {
    "win": "build:win",
    "mac": "build:mac",
    "linux": "build:linux",
}


def find_distributable(target: str) -> Path:
    if target == "win":
        matches = list(DIST_DIR.glob("*.exe"))
    elif target == "linux":
        matches = list(DIST_DIR.glob("*.AppImage"))
    else:
        matches = list(DIST_DIR.glob("mac-*/*.app"))

    if not matches:
        sys.exit(f"Could not find a built {target} distributable in {DIST_DIR}")
    # Most recently built, in case dist/ has leftovers from an older or
    # different-arch build.
    return max(matches, key=lambda p: p.stat().st_mtime)


def add_path(zf: zipfile.ZipFile, path: Path, arcname: str) -> None:
    if path.is_dir():
        for file in path.rglob("*"):
            if file.is_file():
                zf.write(file, str(Path(arcname) / file.relative_to(path)))
    else:
        zf.write(path, arcname)


def copy_preserving_symlinks(src: Path, dst_dir: Path) -> None:
    subprocess.run(["ditto", str(src), str(dst_dir / src.name)], check=True)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in BUILD_TARGETS:
        sys.exit(f"Usage: python build.py <{'|'.join(BUILD_TARGETS)}>")

    target = sys.argv[1]

    # ADK's local session storage — never ship users' chat history in the zip.
    shutil.rmtree(ROOT / "snuc_agent" / ".adk", ignore_errors=True)

    NPM = shutil.which("npm")
    if not NPM:
        sys.exit("Node.js not installed. Please install Node.js and try again")
    result = subprocess.run([NPM, "install"], cwd=AGENT_UI_DIR)
    if result.returncode != 0:
        sys.exit(f"npm install failed with exit code {result.returncode}")

    print(f"Building agent_ui for {target} ...")
    result = subprocess.run([NPM, "run", BUILD_TARGETS[target]], cwd=AGENT_UI_DIR)
    if result.returncode != 0:
        sys.exit(f"electron-builder failed with exit code {result.returncode}")

    distributable = find_distributable(target)
    print(f"Found distributable: {distributable}")

    output_zip = ROOT / f"snuc_agent-{target}.zip"
    if output_zip.exists():
        output_zip.unlink()

    extras = [ROOT / ".python-version", ROOT / "snuc_agent", ROOT / "pyproject.toml", ROOT / "uv.lock"]

    if target == "mac":
        # .app bundles contain real symlinks (framework version links, etc.)
        # that Python's zipfile can't portably represent — stage everything
        # with ditto (Apple's own bundle-safe copy/archive tool) instead.
        print(f"Packaging {output_zip.name} with ditto ...")
        with tempfile.TemporaryDirectory() as tmp:
            staging = Path(tmp)
            copy_preserving_symlinks(distributable, staging)
            for extra in extras:
                copy_preserving_symlinks(extra, staging)
            subprocess.run(["ditto", "-c", "-k", str(staging), str(output_zip)], check=True)
    else:
        print(f"Packaging {output_zip.name} ...")
        with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            add_path(zf, distributable, distributable.name)
            for extra in extras:
                add_path(zf, extra, extra.name)

    print(f"Done: {output_zip}")


if __name__ == "__main__":
    main()
