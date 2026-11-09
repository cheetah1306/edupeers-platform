# Architectural & LMS Design Decisions

This document records the design assumptions, domain models, and architectural decisions implemented in the Role-Based Learning & Development (L&D) Platform.

---

## 1. Role System & Permissions (RBAC)
- **Roles**: Exactly three account roles exist: `trainee`, `trainer`, `admin`.
- **Legacy Removal**: All former "student" and "teacher" roles, UI strings, seed data, and schema constraints have been completely removed and migrated.
- **Account State & Approval Lifecycle**:
  - `status = 'pending'`: Default for all newly signed-up accounts. Cannot access operational endpoints or role dashboards; redirected to a dedicated "Pending Approval" status view.
  - `status = 'active'`: Approved accounts with full access to their designated role dashboard and actions.
  - `status = 'suspended'`: Deactivated accounts blocked from authentication.
  - **Seed Primary Admin**: `admin@edupeers.com` (`Admin@123456`) is auto-activated during database initialization to avoid bootstrap deadlock.

---

## 2. Course & Enrollment Lifecycle
- **Enrollment Flow**:
  - Courses can have `requires_approval = false` (instant self-enrollment) or `requires_approval = true` (sets enrollment status to `requested` until approved by Trainer or Admin).
- **Progress Tracking**:
  - Course progress percentage is calculated dynamically based on the weighted completion of attached learning resources (viewed/completed) + passed MCQ assessments.
  - Progress updates instantly when a trainee marks a resource as complete or submits a passing assessment.

---

## 3. Assessment Engine & Deadlines
- **Server-Side Deadline Enforcement**:
  - Every questionnaire has a `deadline` (timestamp). The server compares `CURRENT_TIMESTAMP > deadline` upon attempt submission.
  - If the deadline has expired, the submission is rejected with an HTTP 400 (`Assessment deadline has passed`).
- **Attempts & Scoring**:
  - Questionnaires define `attempts_allowed` (e.g., 1, 3, or unlimited) and `pass_threshold` (e.g. 70%).
  - Assessments are auto-graded on submit by matching submitted option indices with database keys.
- **Automated Certificate Issuance**:
  - Passing a course's qualifying assessment automatically generates a unique verifiable `Certificate` record (with code `CERT-XXXX-XXXX`), linked to the trainee's profile and downloadable/printable.

---

## 4. Trainer Library & Content Delivery
- **Resource Types**: Supports `video` (embedded lectures / streams / files), `slides` (presentations, PDF slides), and `document` (study guides, notes, reference docs).
- **Draft vs Published**: Content uploaded in `draft` mode is only visible to the authoring trainer and admin; once toggled to `published`, it immediately becomes visible to all enrolled trainees.
- **File Storage**: Centralized file handling supporting Base64 data and direct media URLs, with file type and size metadata.

---

## 5. Competency Mapping Architecture
- **Skill Taxonomy**: Admins manage a structured list of Subjects and Technical Domains.
- **Matrix Calculation**: The competency map computes real data per subject:
  - Trainers with matching expertise tags.
  - Years of professional experience.
  - Active course load count (number of published courses).
  - Trainee feedback average rating (1–5 stars).
  - Availability status for new course ownership.

---

## 6. Homepage Publishing & Communication Feed
- **Feed Types**:
  - `announcement`: General communications (policy changes, system updates).
  - `notification`: System-wide or role-targeted priority alerts.
  - `achievement`: Highlighting top learners, milestones, and course completions.
  - `featured_content`: Spotlighted courses and training resources.
- **Target Audience**: Admins can target posts to `all`, `trainee`, `trainer`, or `admin`.

---

## 7. Security & Passwords
- Passwords are securely hashed with bcrypt / PBKDF2 salt-hashing.
- JWT tokens encode `userId`, `role`, `status`, and `username`, preventing client-side role forgery.
- Strict server-side RBAC middleware validates every protected endpoint.
