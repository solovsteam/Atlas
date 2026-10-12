#!/usr/bin/env python3
"""Keep Atlas's subscription-backed rule compiler available on this Mac."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

LABEL = "local.atlas.recurrence-compiler"
REPO = Path(__file__).resolve().parent.parent


def configuration(node, repo, origins, logs):
    return {
        "Label": LABEL,
        "ProgramArguments": [str(node), str(repo / "scripts/recurrence-compiler.mjs")],
        "WorkingDirectory": str(repo),
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 15,
        "Umask": 0o077,
        "StandardOutPath": str(logs / "recurrence-compiler.log"),
        "StandardErrorPath": str(logs / "recurrence-compiler.log"),
        "EnvironmentVariables": {"ATLAS_COMPILER_ORIGINS": ",".join(origins)},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "status", "restart", "stop"])
    parser.add_argument("--origin", action="append", default=[])
    args = parser.parse_args()
    domain = f"gui/{os.getuid()}"
    service = f"{domain}/{LABEL}"
    path = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    if args.action == "status":
        result = subprocess.run(["launchctl", "print", service], capture_output=True, text=True)
        print("running" if result.returncode == 0 else "not installed or stopped")
        return
    subprocess.run(["launchctl", "bootout", service], capture_output=True)
    if args.action == "stop":
        return
    if args.action == "install":
        node = shutil.which("node")
        if not node:
            parser.error("Node is required")
        logs = Path.home() / "Library/Logs/atlas"
        logs.mkdir(parents=True, exist_ok=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        origins = ["http://localhost:5173", "http://127.0.0.1:5173", *args.origin]
        path.write_bytes(plistlib.dumps(configuration(Path(node).resolve(), REPO, origins, logs)))
        path.chmod(0o600)
    if not path.exists():
        parser.error("Install the service first")
    result = subprocess.run(["launchctl", "bootstrap", domain, str(path)], capture_output=True, text=True)
    if result.returncode:
        parser.error(result.stderr.strip() or "Could not start compiler")
    print("Atlas rule compiler installed on 127.0.0.1:43154; inference runs only on request.")


if __name__ == "__main__":
    main()
