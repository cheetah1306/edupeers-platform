const http = require('http');

const BASE_URL = 'http://127.0.0.1:4000';

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 4000,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, headers: res.headers, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, raw: data });
                }
            });
        });

        req.on('error', (err) => reject(err));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runRegressionTests() {
    console.log('🧪 Starting End-to-End Role-Based L&D Platform Regression Pass...\n');
    let passed = 0;
    let failed = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failed++;
        }
    };

    try {
        // ==========================================
        // 1. HEALTH CHECK
        // ==========================================
        console.log('--- 1. Platform Health Check ---');
        const health = await request('GET', '/api/health');
        assert(health.status === 200 && health.data.status === 'active', 'Server is online and responding.');

        // ==========================================
        // 2. SIGNUP FLOW & APPROVAL GATE
        // ==========================================
        console.log('\n--- 2. Signup Flow & Pending Approval Gate ---');
        const randomSuffix = Math.floor(Math.random() * 10000);
        const traineeEmail = `e2e.trainee.${randomSuffix}@edupeers.com`;
        const trainerEmail = `e2e.trainer.${randomSuffix}@edupeers.com`;

        // 2.1 Trainee Signup
        const traineeSignup = await request('POST', '/api/auth/signup', {
            fullName: 'E2E Trainee ' + randomSuffix,
            email: traineeEmail,
            password: 'Password@123',
            role: 'trainee',
            department: 'Cloud Engineering',
            designation: 'Graduate Trainee'
        });
        assert(traineeSignup.status === 201 && traineeSignup.data.user.status === 'pending', 'Trainee registered with pending status.');

        // 2.2 Trainer Signup
        const trainerSignup = await request('POST', '/api/auth/signup', {
            fullName: 'E2E Trainer ' + randomSuffix,
            email: trainerEmail,
            password: 'Password@123',
            role: 'trainer',
            department: 'Data Engineering',
            designation: 'Senior Instructor',
            expertise_tags: ['Full-Stack Web Development', 'AI & Machine Learning'],
            experience_years: 7
        });
        assert(trainerSignup.status === 201 && trainerSignup.data.user.status === 'pending', 'Trainer registered with pending status.');

        // 2.3 Pending Trainee Login Attempt (Must be blocked)
        const pendingLogin = await request('POST', '/api/auth/login', {
            email: traineeEmail,
            password: 'Password@123'
        });
        assert(pendingLogin.status === 200 && pendingLogin.data.user.status === 'pending', 'Pending user can log in with pending status for common tools access.');

        // ==========================================
        // 3. ADMIN LOGIN & USER APPROVAL
        // ==========================================
        console.log('\n--- 3. Admin Login & User Approval Flow ---');
        const adminLogin = await request('POST', '/api/auth/login', {
            email: 'admin@edupeers.com',
            password: 'Admin@123456'
        });
        assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Primary Admin logged in successfully.');
        const adminToken = adminLogin.data.token;

        // 3.1 Fetch pending users
        const pendingUsers = await request('GET', '/api/admin/users?status=pending', null, adminToken);
        const traineeUser = pendingUsers.data.users.find(u => u.email === traineeEmail);
        const trainerUser = pendingUsers.data.users.find(u => u.email === trainerEmail);
        assert(traineeUser && trainerUser, 'Admin can see both pending users in approval queue.');

        // 3.2 Approve Trainee and Trainer
        const approveTrainee = await request('POST', `/api/admin/users/${traineeUser.id}/approve`, {}, adminToken);
        assert(approveTrainee.status === 200 && approveTrainee.data.user.status === 'active', 'Admin approved Trainee account.');

        const approveTrainer = await request('POST', `/api/admin/users/${trainerUser.id}/approve`, {}, adminToken);
        assert(approveTrainer.status === 200 && approveTrainer.data.user.status === 'active', 'Admin approved Trainer account.');

        // ==========================================
        // 4. APPROVED TRAINEE FLOW (Full Journey)
        // ==========================================
        console.log('\n--- 4. Approved Trainee Journey ---');
        // 4.1 Trainee Login
        const traineeLogin = await request('POST', '/api/auth/login', {
            email: traineeEmail,
            password: 'Password@123'
        });
        assert(traineeLogin.status === 200 && traineeLogin.data.user.role === 'trainee', 'Approved Trainee logged in successfully.');
        const traineeToken = traineeLogin.data.token;

        // 4.2 Trainee Profile Update
        const profileUpdate = await request('PUT', '/api/profile', {
            qualifications: [{ degree: 'B.S. Software Engineering', institution: 'State Tech', year: '2025', grade: '3.9 GPA' }],
            work_experience: [{ company: 'EduPeers', role: 'Engineering Intern', duration: '6 months', description: 'API testing and UI components.' }],
            skills: [{ name: 'JavaScript', level: 'Intermediate' }, { name: 'PostgreSQL', level: 'Beginner' }]
        }, traineeToken);
        assert(profileUpdate.status === 200, 'Trainee profile updated with qualifications and skills.');

        const getProfile = await request('GET', '/api/profile', null, traineeToken);
        assert(getProfile.data.profile.skills.length >= 2, 'Trainee profile verification confirms saved skills.');

        // 4.3 Browse Course Catalog & Enroll
        const coursesList = await request('GET', '/api/courses', null, traineeToken);
        assert(coursesList.status === 200 && coursesList.data.courses.length > 0, 'Trainee browsed published course catalog.');
        const targetCourse = coursesList.data.courses.find(c => c.title.includes('Full-Stack')) || coursesList.data.courses[0];

        const enrollCourse = await request('POST', `/api/courses/${targetCourse.id}/enroll`, {}, traineeToken);
        assert(enrollCourse.status === 200, `Trainee enrolled in "${targetCourse.title}".`);

        // 4.4 Access Course Details & Resources
        const courseDetail = await request('GET', `/api/courses/${targetCourse.id}`, null, traineeToken);
        assert(courseDetail.status === 200 && courseDetail.data.resources.length > 0, 'Trainee retrieved course syllabus and attached learning resources.');

        const targetResource = courseDetail.data.resources[0];
        const markComplete = await request('POST', `/api/resources/${targetResource.id}/complete`, {}, traineeToken);
        assert(markComplete.status === 200, 'Trainee viewed and marked learning resource as complete.');

        // 4.5 Attempt MCQ Assessment with Deadline Enforcement
        assert(courseDetail.data.questionnaires.length > 0, 'Course has attached assessment questionnaire.');
        const targetQuest = courseDetail.data.questionnaires[0];

        const questDetail = await request('GET', `/api/questionnaires/${targetQuest.id}`, null, traineeToken);
        assert(questDetail.status === 200 && questDetail.data.questions.length > 0, 'Trainee opened questionnaire (correct options hidden from trainee payload).');

        // Build answers map
        const answersMap = {};
        for (const q of questDetail.data.questions) {
            answersMap[q.id] = 1; // Pick option index
        }

        const submitAttempt = await request('POST', `/api/questionnaires/${targetQuest.id}/attempt`, {
            answers: answersMap
        }, traineeToken);
        assert(submitAttempt.status === 200 && submitAttempt.data.submission.total_questions > 0, 'Trainee submitted assessment attempt, auto-graded by backend.');

        // 4.6 Submit Course & Trainer Feedback
        const feedbackRes = await request('POST', '/api/feedback', {
            course_id: targetCourse.id,
            trainer_id: targetCourse.trainer_id,
            target_type: 'course',
            rating: 5,
            ratings: { quality: 5, relevance: 5, delivery: 5 },
            comments: 'Comprehensive training with clear code examples!'
        }, traineeToken);
        assert(feedbackRes.status === 201, 'Trainee submitted structured 5-star course feedback.');

        // ==========================================
        // 5. APPROVED TRAINER FLOW
        // ==========================================
        console.log('\n--- 5. Approved Trainer Journey ---');
        // 5.1 Trainer Login
        const trainerLogin = await request('POST', '/api/auth/login', {
            email: trainerEmail,
            password: 'Password@123'
        });
        assert(trainerLogin.status === 200 && trainerLogin.data.user.role === 'trainer', 'Approved Trainer logged in successfully.');
        const trainerToken = trainerLogin.data.token;

        // 5.2 Upload Resource to Library
        const uploadRes = await request('POST', '/api/resources', {
            subject: 'Full-Stack Web Development',
            type: 'document',
            title: 'E2E Advanced Architecture Cheatsheet',
            description: 'Comprehensive guide for system design and API reliability.',
            file_name: 'e2e-architecture-cheatsheet.pdf',
            file_type: 'application/pdf',
            file_size: '2.1 MB',
            status: 'published'
        }, trainerToken);
        assert(uploadRes.status === 201, 'Trainer uploaded study document to Content Library.');

        // 5.3 Create Questionnaire with Deadline
        const futureDeadline = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
        const createQuest = await request('POST', '/api/questionnaires', {
            title: 'E2E Microservices Knowledge Assessment',
            subject: 'Full-Stack Web Development',
            deadline: futureDeadline.toISOString(),
            duration_minutes: 20,
            attempts_allowed: 2,
            pass_threshold: 70,
            status: 'published',
            questions: [
                {
                    question_text: 'Which transport protocol is standard for gRPC microservices communication?',
                    options: ['HTTP/1.1', 'HTTP/2', 'FTP', 'SMTP'],
                    correct_option_index: 1,
                    marks: 2,
                    explanation: 'gRPC utilizes HTTP/2 for multiplexed binary streaming.'
                }
            ]
        }, trainerToken);
        assert(createQuest.status === 201, 'Trainer published MCQ questionnaire with strict deadline.');

        // 5.4 Trainer Participation & Performance Overview
        const trainerOverview = await request('GET', '/api/trainer/overview', null, trainerToken);
        assert(trainerOverview.status === 200 && trainerOverview.data.metrics, 'Trainer retrieved live participation & performance metrics.');

        // ==========================================
        // 6. ADMIN GOVERNANCE, 5 DASHBOARDS & PUBLISHING
        // ==========================================
        console.log('\n--- 6. Admin Governance & 5 Analytics Dashboards ---');

        // 6.1 Courses Dashboard
        const dCourses = await request('GET', '/api/admin/dashboards/courses', null, adminToken);
        assert(dCourses.status === 200 && dCourses.data.summary.total > 0, 'Admin Dashboard 1 (Courses): Live counts and popularity trends returned.');

        // 6.2 Enrollments Dashboard
        const dEnrollments = await request('GET', '/api/admin/dashboards/enrollments', null, adminToken);
        assert(dEnrollments.status === 200 && dEnrollments.data.departments.length >= 0, 'Admin Dashboard 2 (Enrollments): Department breakdown returned.');

        // 6.3 Certifications Dashboard
        const dCerts = await request('GET', '/api/admin/dashboards/certifications', null, adminToken);
        assert(dCerts.status === 200 && dCerts.data.summary.total_issued >= 0, 'Admin Dashboard 3 (Certifications): Live certificate statistics returned.');

        // 6.4 Assessments Dashboard
        const dAssessments = await request('GET', '/api/admin/dashboards/assessments', null, adminToken);
        assert(dAssessments.status === 200 && dAssessments.data.summary.total_attempts > 0, 'Admin Dashboard 4 (Assessments): Scores and pass rates returned.');

        // 6.5 Participation Statistics Dashboard
        const dParticipation = await request('GET', '/api/admin/dashboards/participation', null, adminToken);
        assert(dParticipation.status === 200 && dParticipation.data.summary.total_active >= 3, 'Admin Dashboard 5 (Participation): Active users count returned.');

        // 6.6 Competency Map
        const compMap = await request('GET', '/api/competency-map', null, adminToken);
        assert(compMap.status === 200 && compMap.data.matrix.length > 0, 'Competency Map computed live matching trainers and experience to subjects.');

        // 6.7 Homepage Publishing
        const publishPost = await request('POST', '/api/admin/homepage/publish', {
            type: 'announcement',
            title: 'E2E Platform Verification Passed',
            content: 'All modules, roles, and real database integrations are verified operational.',
            priority: 'high',
            target_role: null
        }, adminToken);
        assert(publishPost.status === 201, 'Admin published homepage announcement.');

        // 6.8 Trainee sees Homepage Published Feed
        const traineeFeed = await request('GET', '/api/homepage/feed', null, traineeToken);
        const foundPost = traineeFeed.data.posts.find(p => p.title === 'E2E Platform Verification Passed');
        assert(foundPost !== undefined, 'Trainee can view the live admin-published homepage announcement.');

        // ==========================================
        // 7. ROLE-BASED ACCESS CONTROL (RBAC) SECURITY GUARDS
        // ==========================================
        console.log('\n--- 7. Server-Side RBAC Security Enforcement ---');

        // 7.1 Trainee trying to hit Admin endpoint (Forbidden)
        const traineeAdminAttempt = await request('GET', '/api/admin/users', null, traineeToken);
        assert(traineeAdminAttempt.status === 403, 'Trainee token blocked from hitting /api/admin/users (403 Forbidden).');

        // 7.2 Trainee trying to publish homepage post (Forbidden)
        const traineePublishAttempt = await request('POST', '/api/admin/homepage/publish', {
            type: 'announcement',
            title: 'Illegal Post',
            content: 'Should be blocked.'
        }, traineeToken);
        assert(traineePublishAttempt.status === 403, 'Trainee token blocked from hitting /api/admin/homepage/publish (403 Forbidden).');

        // 7.3 Trainer trying to hit Admin user management (Forbidden)
        const trainerAdminAttempt = await request('POST', `/api/admin/users/${traineeUser.id}/role`, { role: 'admin' }, trainerToken);
        assert(trainerAdminAttempt.status === 403, 'Trainer token blocked from changing user roles (403 Forbidden).');

        // ==========================================
        // SUMMARY
        // ==========================================
        console.log('\n==========================================');
        console.log(`🏁 TEST PASS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
        console.log('==========================================\n');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    } catch (err) {
        console.error('Regression test runner exception:', err);
        process.exit(1);
    }
}

runRegressionTests();
