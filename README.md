cd /Users/hengjunp/Desktop/DiaHacks/backend
source .venv/bin/activate
uvicorn app.main:app --reload


If .venv doesn't exist yet, run this first:


python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload