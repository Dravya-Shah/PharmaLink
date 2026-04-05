echo "Starting PharmaLink Backend API..."
.\venv\Scripts\activate
uvicorn app.main:app --reload
