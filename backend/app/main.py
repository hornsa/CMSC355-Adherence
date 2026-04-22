from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.models import dose_confirmation, medication, medication_request, patient_provider_assignment, provider_profile, schedule, user
from app.routes import auth, doses, medication_requests, medications, protected, provider_portal, schedules

app = FastAPI(title="Medication Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(doses.router, prefix="/doses", tags=["doses"])
app.include_router(medication_requests.router, prefix="/medication-requests", tags=["medication-requests"])
app.include_router(medications.router, prefix="/medications", tags=["medications"])
app.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
app.include_router(protected.router, prefix="/protected", tags=["protected"])
app.include_router(provider_portal.router, tags=["provider-portal"])


def run_startup_migrations():
    inspector = inspect(engine)

    medication_columns = {column["name"] for column in inspector.get_columns("medications")}
    schedule_columns = {column["name"] for column in inspector.get_columns("medication_schedules")}

    with engine.begin() as connection:
        if "frequency_count" not in medication_columns:
            connection.execute(text("ALTER TABLE medications ADD COLUMN frequency_count INTEGER NOT NULL DEFAULT 1"))
        if "frequency_unit" not in medication_columns:
            connection.execute(text("ALTER TABLE medications ADD COLUMN frequency_unit VARCHAR(20) NOT NULL DEFAULT 'daily'"))
        if "schedule_group_id" not in schedule_columns:
            connection.execute(text("ALTER TABLE medication_schedules ADD COLUMN schedule_group_id VARCHAR(64)"))
            connection.execute(text("UPDATE medication_schedules SET schedule_group_id = 'legacy-' || id WHERE schedule_group_id IS NULL"))


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    run_startup_migrations()


@app.get("/")
def root():
    return {"message": "Medication Management API is running"}
