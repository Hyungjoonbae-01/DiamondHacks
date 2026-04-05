"""Load ``.env`` from common locations (later files override earlier).

Search order (each only if the path exists):

1. ``<repo>/.env`` — monorepo root (e.g. DiamondHacks/.env)
2. ``<repo>/backend/.env``
3. ``<repo>/backend/app/.env`` — typical for keys next to application code

Uses ``utf-8-sig`` so a UTF-8 BOM does not break variable names. Requires a line like::

    BROWSER_USE_API_KEY=bu_...

(no spaces around ``=``, no quotes needed unless the value has spaces).
"""

from pathlib import Path

from dotenv import load_dotenv


def load_env() -> None:
    app_dir = Path(__file__).resolve().parent
    backend_root = app_dir.parent
    repo_root = backend_root.parent

    for path in (
        repo_root / ".env",
        backend_root / ".env",
        app_dir / ".env",
    ):
        if path.is_file():
            load_dotenv(path, override=True, encoding="utf-8-sig")
