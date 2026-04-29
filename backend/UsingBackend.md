Backend Setup:

From the `backend` folder:

```powershell
cd backend
```

If `python -m venv .venv` fails on your machine because `python` points to the Windows Store shim, use a real installed Python interpreter instead. On this machine, the working interpreter was:

`C:\Users\jibri\AppData\Local\Programs\Thonny\python.exe`

Example setup:

```powershell
& 'C:\Users\jibri\AppData\Local\Programs\Thonny\python.exe' -m venv 'C:/Users/jibri/Downloads/med-manager-foundation/med-manager-foundation/backend/.venv'
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

If your shell already has a normal Python installation on PATH, this shorter version should also work:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```
Quick verification:

```powershell
.\.venv\Scripts\python.exe -c "from app.main import app; print(app.title)"
.\.venv\Scripts\python.exe -m uvicorn --version
```

And, if everything else is setup and you want to quickly run the backend in Windows powershell:

```powershell
python -m uvicorn app.main:app --reload 
```

Reminder email configuration:

Set these environment variables before starting the backend if you want missed-dose reminder emails to send:

`SMTP_HOST`
`SMTP_PORT` (defaults to `587`)
`SMTP_USERNAME`
`SMTP_PASSWORD`
`SMTP_FROM_EMAIL`
`SMTP_USE_TLS` (defaults to `true`)
`SMTP_USE_SSL` (defaults to `false`)

The backend checks for missed doses every minute and sends one reminder email about 5 minutes after the scheduled dose time if the dose is still unconfirmed.

Backend commands

Create or promote an admin account from inside `backend`:

`& .\.venv\Scripts\python.exe .\scripts\create_admin.py --email you@example.com --name "Admin Name"`

Promote an existing registered user to admin:

`& .\.venv\Scripts\python.exe .\scripts\create_admin.py --email you@example.com --promote-only`

If you run the script from the repo root instead of the `backend` folder, use:

`& .\backend\.venv\Scripts\python.exe .\backend\scripts\create_admin.py --email you@example.com --promote-only`
