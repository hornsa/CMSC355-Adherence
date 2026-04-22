Backend commands

Create or promote an admin account:

`& .\.venv312\bin\python.exe .\scripts\create_admin.py --email you@example.com --name "Admin Name"`

Promote an existing registered user to admin:

`& .\.venv312\bin\python.exe .\scripts\create_admin.py --email you@example.com --promote-only`

If you run the script from the repo root instead of the `backend` folder, use:

`& .\backend\.venv312\bin\python.exe .\backend\scripts\create_admin.py --email you@example.com --promote-only`
