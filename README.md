# AI Powered Smart Education System (ASEMS)

This workspace contains:
- `backend`: Django API with SQLite database
- `frontend`: React + Vite UI using shadcn-style component architecture
- `logo`: project logo source files

## Production-friendly setup (no virtualenv required)

### 1) Backend

```powershell
cd backend
py -3 -m pip install -r requirements.txt
py -3 manage.py migrate
py -3 manage.py runserver 8000
```

Backend API base URL: `http://127.0.0.1:8000`

### 2) Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL: `http://127.0.0.1:5173`

## Login credentials

- Username: `admin`
- Password: `12345678`

## API endpoints

- `POST /api/login/`
- `POST /api/logout/`
- `GET /api/session/`
- `GET /api/dashboard/`
- `GET /api/ai/threads/`
- `GET /api/ai/threads/<thread_id>/messages/`
- `POST /api/ai/threads/<thread_id>/rename/`
- `POST /api/ai/threads/<thread_id>/delete/`
- `POST /api/ai/chat/`
- `POST /api/ai/chat/stream/`
- `GET /api/grade-report/?mode=semester|curriculum&student_id=<id>`
- `POST /api/grade-report/predict/`

## Ollama setup for AI Help

Run this model before using AI Help:

```powershell
ollama run hf.co/unsloth/Llama-3.2-1B-Instruct-GGUF:UD-Q4_K_XL
```

The backend calls Ollama at `http://127.0.0.1:11434/api/chat`.
Streaming UI uses the `/api/ai/chat/stream/` endpoint.

## ML-based grade prediction

- Model file: `MLModel/best_pass_fail_model.pkl`
- Dataset: `MLModel/student_dataset_500_rows.csv`
- Prediction endpoint accepts report sheet subject numbers and returns pass/fail analysis for the next semester.

## User table schema (`core_smartuser`)

- `id` (User id)
- `name`
- `password`
- `user_type` (1 = student, 2 = teacher, 3 = management)

## Notes

- SQLite database file is `backend/db.sqlite3`
- A default admin user is seeded by migration `core.0002_seed_admin_user`
- Frontend uses Vite proxy for `/api` to backend in development
"# AI-Powered-Smart-Education-System" 
