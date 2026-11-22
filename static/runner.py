"""Glue between the page and the checkers, running inside Pyodide (in a Web Worker).

Runs `<tool> scan <dir> --json --fail-on never [options]` through the tool's own CLI entry
point, so the output (including secret masking) is exactly what the command line prints.
"""
import contextlib
import importlib
import io
import json
import shutil
import subprocess
import sys


def _no_subprocess(*args, **kwargs):
    # git is not available in a browser. The tools already treat a missing git as
    # "not a git repository", exactly like running the CLI outside a repo.
    raise FileNotFoundError("subprocess is not available in the browser")


subprocess.run = _no_subprocess
subprocess.Popen = _no_subprocess


def run_scan(package, src_dir, root, extra_args_json):
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)
    cli = importlib.import_module(package + ".cli")
    argv = ["scan", root, "--json", "--fail-on", "never", *json.loads(extra_args_json)]
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = cli.main(argv)
        except SystemExit as e:  # argparse errors
            code = e.code if isinstance(e.code, int) else 2
    return json.dumps({"code": code, "stdout": out.getvalue(), "stderr": err.getvalue()})


def remove_tree(path):
    shutil.rmtree(path, ignore_errors=True)
