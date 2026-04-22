import argparse
import getpass
import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{(ROOT_DIR / 'app.db').resolve().as_posix()}")

from app.database import Base, SessionLocal, engine
from app.models import dose_confirmation, medication, patient_provider_assignment, provider_profile, schedule, user  # noqa: F401
from app.models.user import User
from app.core.security import hash_password


def parse_args():
    parser = argparse.ArgumentParser(description="Create or promote an admin user.")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--name", help="Admin display name when creating a new user")
    parser.add_argument("--password", help="Password for a new admin user")
    parser.add_argument(
        "--promote-only",
        action="store_true",
        help="Only promote an existing account; fail if the email does not exist",
    )
    return parser.parse_args()


def prompt_for_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            continue
        if password != confirm:
            print("Passwords do not match.")
            continue
        return password


def main():
    args = parse_args()
    email = args.email.strip().lower()
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.email == email).first()

        if existing_user:
            existing_user.role = "admin"
            db.commit()
            print(f"Promoted existing user to admin: {email}")
            return

        if args.promote_only:
            raise SystemExit(f"No existing user found for {email}.")

        name = (args.name or "").strip()
        if not name:
            raise SystemExit("--name is required when creating a brand-new admin.")

        password = args.password or prompt_for_password()
        new_user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role="admin",
            notifications_enabled=True,
        )
        db.add(new_user)
        db.commit()
        print(f"Created new admin user: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
