-- ==========================================================
-- EduPeers L&D Platform Database Schema
-- Strict 3-Role System: Trainee, Trainer, Admin
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users Table (Strict Trainee, Trainer, Admin roles)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    user_role VARCHAR(20) NOT NULL DEFAULT 'trainee' CHECK (user_role IN ('trainee', 'trainer', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    department VARCHAR(255),
    designation VARCHAR(255),
    phone VARCHAR(50),
    photo_url TEXT,
    xp_score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role VARCHAR(20) NOT NULL DEFAULT 'trainee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Trainee Profiles
CREATE TABLE IF NOT EXISTS trainee_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qualifications JSONB DEFAULT '[]',
    work_experience JSONB DEFAULT '[]',
    interests JSONB DEFAULT '[]',
    skills JSONB DEFAULT '[]',
    certificates JSONB DEFAULT '[]',
    manager_name VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS qualifications JSONB DEFAULT '[]';
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS work_experience JSONB DEFAULT '[]';
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]';
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS certificates JSONB DEFAULT '[]';
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS manager_name VARCHAR(255);
ALTER TABLE trainee_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Trainer Profiles
CREATE TABLE IF NOT EXISTS trainer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    expertise_tags JSONB DEFAULT '[]',
    qualifications JSONB DEFAULT '[]',
    certifications JSONB DEFAULT '[]',
    experience_years INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS expertise_tags JSONB DEFAULT '[]';
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS qualifications JSONB DEFAULT '[]';
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]';
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Subjects Taxonomy (Powers Competency Mapping)
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'Technical',
    description TEXT,
    parent_subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Courses Table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL DEFAULT 'General',
    trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    level VARCHAR(50) DEFAULT 'Intermediate',
    prerequisites TEXT,
    department_relevance VARCHAR(255),
    duration_hours NUMERIC DEFAULT 10,
    requires_approval BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NOT NULL DEFAULT 'General';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'Intermediate';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS prerequisites TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS department_relevance VARCHAR(255);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS duration_hours NUMERIC DEFAULT 10;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 6. Course Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('requested', 'enrolled', 'completed', 'dropped')),
    progress_pct INTEGER NOT NULL DEFAULT 0,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    UNIQUE(user_id, course_id)
);

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'enrolled';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 7. Resources Table (Trainer Content Library)
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('video', 'slides', 'document', 'link')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_name VARCHAR(255),
    file_url TEXT,
    file_data TEXT,
    file_type VARCHAR(100),
    file_size VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE resources ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 8. Resource Views (Tracking Trainee Learning Progress)
CREATE TABLE IF NOT EXISTS resource_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT TRUE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_id, user_id)
);

-- 9. Questionnaires (Assessments with Strict Deadlines)
CREATE TABLE IF NOT EXISTS questionnaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL DEFAULT 'General',
    trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    deadline TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    attempts_allowed INTEGER NOT NULL DEFAULT 1,
    pass_threshold INTEGER NOT NULL DEFAULT 70,
    status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NOT NULL DEFAULT 'General';
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS attempts_allowed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS pass_threshold INTEGER NOT NULL DEFAULT 70;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE questionnaires ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 10. Questions Bank
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option_index INTEGER NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1,
    explanation TEXT,
    order_num INTEGER DEFAULT 1
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS marks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS order_num INTEGER DEFAULT 1;

-- 11. Submissions (Assessment Attempts & Auto-Graded Scores)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
    trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    total_questions INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    score_percentage NUMERIC(5,2) NOT NULL,
    is_passed BOOLEAN NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- 12. Certificates (Auto-Issued upon Passing / Course Completion)
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trainee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE SET NULL,
    certificate_code VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    issuer VARCHAR(255) NOT NULL DEFAULT 'EduPeers L&D Academy',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMPTZ,
    file_url TEXT
);

-- 13. Feedback System
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    trainer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
    target_type VARCHAR(50) NOT NULL DEFAULT 'course',
    target_id UUID,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    ratings JSONB DEFAULT '{}',
    comments TEXT NOT NULL,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS trainer_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS target_type VARCHAR(50) NOT NULL DEFAULT 'course';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ratings JSONB DEFAULT '{}';
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE;
ALTER TABLE feedback ALTER COLUMN target_id DROP NOT NULL;

-- 14. Homepage Published Stream (Announcements, Notifications, Achievements, Featured)
CREATE TABLE IF NOT EXISTS homepage_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('notification', 'announcement', 'achievement', 'featured_content')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    target_role VARCHAR(20) CHECK (target_role IS NULL OR target_role IN ('trainee', 'trainer', 'admin')),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    meta_data JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ
);

-- 15. In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 17. User Notes (Productivity Tool)
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) DEFAULT 'General',
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(user_role, status);
CREATE INDEX IF NOT EXISTS idx_courses_trainer ON courses(trainer_id);
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(subject_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_resources_course ON resources(course_id);
CREATE INDEX IF NOT EXISTS idx_resources_trainer ON resources(trainer_id);
CREATE INDEX IF NOT EXISTS idx_questionnaires_course ON questionnaires(course_id);
CREATE INDEX IF NOT EXISTS idx_submissions_trainee ON submissions(trainee_id);
CREATE INDEX IF NOT EXISTS idx_submissions_questionnaire ON submissions(questionnaire_id);
CREATE INDEX IF NOT EXISTS idx_certificates_trainee ON certificates(trainee_id);
CREATE INDEX IF NOT EXISTS idx_feedback_course ON feedback(course_id);
CREATE INDEX IF NOT EXISTS idx_feedback_trainer ON feedback(trainer_id);
CREATE INDEX IF NOT EXISTS idx_homepage_posts_type ON homepage_posts(type, is_published);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
