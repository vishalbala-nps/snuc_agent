#!/usr/bin/env python3

import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_DIR = ROOT / "env"
REQUIREMENTS = ROOT / "requirements.txt"


def venv_python(env_dir: Path) -> Path:
    if sys.platform == "win32":
        return env_dir / "Scripts" / "python.exe"
    return env_dir / "bin" / "python"


def main() -> None:
    if not REQUIREMENTS.exists():
        sys.exit(f"requirements.txt not found at {REQUIREMENTS}")

    if venv_python(ENV_DIR).exists():
        print(f"Virtual environment already exists at {ENV_DIR}, skipping creation.")
    else:
        print(f"Creating virtual environment at {ENV_DIR} ...")
        venv.EnvBuilder(with_pip=True).create(ENV_DIR)

    print("Installing requirements ...")
    subprocess.run(
        [str(venv_python(ENV_DIR)), "-m", "pip", "install", "-r", str(REQUIREMENTS)],
        check=True,
    )

    print("✅ SNUC Agent Successfully installed! Click on the agent_ui executable to start the agent")


if __name__ == "__main__":
    main()
