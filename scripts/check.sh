#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

python -m unittest discover -s tests -t .
python -m research.providers.validate_providers report

backend/.venv/bin/python -m pytest backend/tests -v
backend/.venv/bin/python -m ruff check backend

npm test --prefix frontend -- --run
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend

git diff --check
