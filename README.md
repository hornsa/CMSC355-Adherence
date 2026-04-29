# Medication Adherence System

## Overview
Medication Adherence System is a full-stack medication management platform built to help patients stay on schedule, give providers visibility into adherence, and support care-team coordination around ongoing treatment plans.

At a high level, the site supports:

- Patient accounts that track medications, schedules, dose confirmations, and adherence
- Provider accounts that can be approved, linked to patients, and given access to patient medication data
- Admin workflows for approving providers and managing patient-provider assignments
- Reminder behavior for unconfirmed doses, including email reminders for missed doses after a short delay

The repository is split into:

- `backend/`: FastAPI API with SQLAlchemy models, SQLite persistence, JWT authentication, scheduling logic, and provider/patient workflows
- `frontend/`: React + Vite + TypeScript app that exposes dashboards, medication views, scheduling flows, provider tools, and admin controls

## What The Site Does

### 1. Medication Management
The medication layer is designed around provider-managed treatment plans.

- Patients can view the medications assigned to them.
- Verified providers can create, update, and remove medications for linked patients.
- Medication entries include the medication name, dosage, frequency count, frequency unit, and optional instructions.
- Duplicate medication names are blocked per patient to keep treatment lists clean and avoid confusion.

In practice, this means a provider can define a medication like "Lisinopril 10mg, 1 daily" and the rest of the system can generate dose schedules, dashboard counts, and adherence metrics from that definition.

### 2. Scheduling And Dose Generation
Each medication can have one or more schedule slots depending on how often it should be taken.

- Schedules support `daily`, `weekly`, and `monthly` recurrence patterns.
- A medication's `frequency_count` determines how many time slots must be configured.
- Schedules are stored as grouped slots, so one medication can have multiple times per day or multiple anchored dates per recurrence period.
- The backend generates concrete dose instances for a date window by expanding those recurring schedule rules.

This generated-dose model is important because it lets the app answer questions like:

- What doses are due today?
- Which doses are overdue?
- Which upcoming doses should appear on the patient schedule page?
- What should a provider see when reviewing a patient over the next 14 days?

### 3. Dose Confirmation And Missed Dose Reminders
Once a scheduled dose time arrives, the patient can confirm it in the app.

- Dose confirmations are stored as distinct records tied to the patient, medication, schedule, date, and time.
- The backend prevents confirming a dose before its scheduled time.
- Generated dose instances are marked as `scheduled`, `overdue`, or `confirmed` based on the current time and confirmation data.

Reminder behavior now extends that flow:

- If a dose remains unconfirmed for 5 minutes after its scheduled time, the backend can send a reminder email to the user's account.
- A background reminder worker checks for missed doses every minute.
- Reminder delivery is tracked so the same missed dose is not emailed repeatedly.
- Email reminders only send when SMTP configuration is present and the user has notifications enabled.

This gives the project two layers of adherence support:

- Real-time schedule awareness inside the app
- Follow-up notification when a dose appears to have been missed

### 4. Adherence Tracking
The system calculates adherence from actual scheduled dose instances rather than from a simple counter.

- The patient dashboard computes today's total doses, confirmed doses, overdue doses, and missed or pending doses.
- The patient experience also includes a 7-day adherence trend and a weekly confirmation total.
- Providers can view adherence summaries across all assigned patients.
- Providers can open patient-specific adherence reports for a custom date range and review instance-level detail.

Because adherence is derived from schedules plus confirmations, the numbers reflect real expected doses instead of approximate manual logging.

### 5. Provider And Patient Linking
The project includes a full connection workflow between patients and providers.

- Users can apply to become providers by submitting organization and license information.
- Admins review provider applications and approve or reject them.
- Approved providers appear in the provider directory for patients.
- Patients can request a connection with a provider.
- Providers can also request to connect with a patient.
- Both sides can accept or reject pending requests.
- Admins can directly create active assignments when needed.

Once a provider-patient link is active, the provider gains access to the patient's:

- Medication list
- Schedule groups
- Dose instances
- Adherence reports
- Medication requests

This makes the platform more than a self-tracking app. It becomes a shared care workspace with role-based access and oversight.

### 6. Medication Requests And Care Coordination
Patients and providers do not have to work completely independently.

- Patients can submit medication requests.
- Linked providers can review those requests and approve or reject them.
- Approval can turn a request into an actual medication record for the patient.
- Providers can also directly manage medications for linked patients without going through a request.

This supports a more realistic healthcare workflow where medication changes are reviewed instead of being entered freely by every user.

## User Roles

### Patient
Patients are the primary adherence users of the system.

They can:

- Register and log in
- View their assigned medications
- Review upcoming and overdue dose instances
- Confirm doses after the scheduled time
- Track adherence from their dashboard
- Browse approved providers
- Request provider connections

### Provider
Providers operate in a supervised role and must be approved first.

They can:

- Apply for provider status
- View active patient connections
- Monitor adherence across assigned patients
- Open patient detail pages
- Manage medications for linked patients
- Review schedules and generated dose instances
- Review and resolve patient medication requests

### Admin
Admins support trust and operational control.

They can:

- Review pending provider applications
- Approve or reject providers
- View patient accounts
- Create active patient-provider assignments
- Monitor system-level provider and assignment counts from the admin dashboard

## Frontend Experience
The frontend provides separate dashboards and workflows based on the logged-in user's role.

- Patients see active medications, today's doses, confirmed doses, overdue doses, and a 7-day adherence chart.
- Providers see counts across assigned patients, overdue coverage, weekly adherence averages, and access to patient workspaces.
- Admins see provider review and assignment management metrics.

The UI is organized around a few key pages:

- Dashboard views for patient, provider, and admin roles
- Schedule pages for reviewing upcoming and overdue doses
- Provider patient pages for reviewing medication plans and adherence
- Admin and connection-management views for onboarding and linking users

## Backend Design
The backend centers on a few related model families:

- `User`: authentication, role, email, and notification preference
- `ProviderProfile`: provider application and approval state
- `PatientProviderAssignment`: connection state between patients and providers
- `Medication`: core treatment definition
- `MedicationSchedule`: recurring timing rules for each medication
- `DoseConfirmation`: proof that a scheduled dose was taken
- `DoseReminder`: tracking for reminder emails sent on missed doses
- `MedicationRequest`: patient-submitted request flow for provider review

Important backend behaviors include:

- JWT-based authentication and protected routes
- Role checks for patient, provider, and admin-only endpoints
- Recurring schedule expansion into concrete dose instances
- Dashboard aggregation for daily and weekly adherence reporting
- Background reminder processing for missed-dose email notifications

## Current Reminder Model
Reminder support is intentionally lightweight and fits the current single-service architecture.

- The reminder worker starts when the FastAPI app starts.
- It scans recent schedules and dose confirmations once per minute.
- If a dose is older than 5 minutes and still unconfirmed, it becomes eligible for an email reminder.
- SMTP settings are read from backend environment variables.
- Reminder delivery attempts are saved so duplicate emails are avoided.

This keeps the feature simple to run locally while still showing the full missed-dose reminder workflow.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, SQLite, Pydantic, JWT auth
- Frontend: React, Vite, TypeScript, Tailwind CSS
- Auth: token-based login with protected API routes
- Persistence: SQLite database file
- Notifications: SMTP email reminders for missed doses

## Running The Project

### Backend
From `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

See [backend/UsingBackend.md](backend/UsingBackend.md) for backend notes, admin account commands, and reminder email configuration.

### Frontend
From `frontend/`:

```bash
npm install
npm run dev
```

See [frontend/UsingFrontend.md](frontend/UsingFrontend.md) for frontend run instructions.

## Why This Project Is Structured This Way
The project is not just a medication checklist. It is organized to model a care workflow:

- providers define or approve treatment data
- schedules generate expected doses
- patients confirm what they actually took
- dashboards turn that into adherence insight
- reminders follow up on missed doses
- admins supervise provider access and patient-provider trust

That combination makes the site useful both as a patient adherence tracker and as a collaborative care-management foundation.
