const BASE_URL = 'http://127.0.0.1:4000';

async function api(path, options = {}) {
    options.headers = options.headers || {};
    if (options.body && typeof options.body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${BASE_URL}${path}`, options);
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
}

async function runVerification() {
    console.log('🚀 =========================================================');
    console.log('🚀 STARTING COMPREHENSIVE OTP & 3-ROLE WORKFLOW TEST SUITE');
    console.log('🚀 =========================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ PASS: ${message}`);
            passedCount++;
        } else {
            console.error(`  ❌ FAIL: ${message}`);
            failedCount++;
        }
    }

    try {
        // 1. Health check
        console.log('1. Checking Platform API Health:');
        const health = await api('/api/health');
        assert(health.ok && health.data.status === 'active', 'Platform is active and responding on port 4000');

        // 2. Trainee OTP Signup / Login Flow
        console.log('\n2. Testing Trainee OTP Flow:');
        const traineeEmail = `akshay.test.${Date.now()}@gmail.com`;
        const traineePayload = {
            username: 'Akshay Trainee Candidate',
            age: 22,
            gender: 'male',
            email: traineeEmail,
            institution: 'Department of Computer Science',
            role: 'trainee',
            profession: 'Associate Software Engineer'
        };

        const sendOtpTrainee = await api('/api/auth/send-otp', { method: 'POST', body: traineePayload });
        assert(sendOtpTrainee.ok && sendOtpTrainee.data.success, 'OTP dispatched to Trainee Gmail');
        const traineeOtp = sendOtpTrainee.data.demoOtp;

        const verifyTrainee = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: traineeEmail, otp: traineeOtp }
        });
        assert(verifyTrainee.ok && verifyTrainee.data.token, 'Trainee verified OTP and received JWT session');
        assert(verifyTrainee.data.user.username === 'Akshay Trainee Candidate', 'Exact user display name saved correctly');
        assert(verifyTrainee.data.user.role === 'trainee', 'Trainee role assigned correctly');
        const traineeToken = verifyTrainee.data.token;

        // 3. Trainer OTP Signup Flow
        console.log('\n3. Testing Trainer OTP Flow & Pending Approval Gate:');
        const trainerEmail = `robert.trainer.${Date.now()}@gmail.com`;
        const trainerPayload = {
            username: 'Dr. Robert Specialist',
            age: 38,
            gender: 'male',
            email: trainerEmail,
            institution: 'AI & Data Systems Faculty',
            role: 'trainer',
            profession: 'Senior Machine Learning Architect'
        };

        const sendOtpTrainer = await api('/api/auth/send-otp', { method: 'POST', body: trainerPayload });
        assert(sendOtpTrainer.ok && sendOtpTrainer.data.success, 'OTP dispatched to Trainer Gmail');
        const trainerOtp = sendOtpTrainer.data.demoOtp;

        const verifyTrainer = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: trainerEmail, otp: trainerOtp }
        });
        assert(verifyTrainer.ok && verifyTrainer.data.token, 'Trainer verified OTP and entered workspace');
        assert(verifyTrainer.data.user.status === 'pending', 'Newly registered Trainer status is pending Admin review');
        const trainerToken = verifyTrainer.data.token;
        const trainerId = verifyTrainer.data.user.id;

        // 4. Admin Login & User Approval Queue
        console.log('\n4. Testing Admin Governance & Real-Time Approval:');
        const adminLogin = await api('/api/auth/login', {
            method: 'POST',
            body: { email: 'admin@edupeers.com', password: 'Admin@123456' }
        });
        assert(adminLogin.ok && adminLogin.data.token, 'Admin logged in successfully');
        const adminToken = adminLogin.data.token;

        const pendingUsersRes = await api('/api/admin/users?status=pending', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(pendingUsersRes.ok && Array.isArray(pendingUsersRes.data.users), 'Admin retrieved pending user approval queue');
        
        const foundTrainerInQueue = pendingUsersRes.data.users.find(u => u.email === trainerEmail);
        assert(!!foundTrainerInQueue, 'Trainer appears in Admin approval queue with full exact details');
        assert(foundTrainerInQueue && foundTrainerInQueue.username === 'Dr. Robert Specialist', 'Trainer exact name displayed correctly');

        // Admin approves Trainer
        const approveTrainerRes = await api(`/api/admin/users/${trainerId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(approveTrainerRes.ok && approveTrainerRes.data.user.status === 'active', 'Admin approved Trainer to active status');

        // 5. Trainer Posts Real MCQ Assessment
        console.log('\n5. Testing Live Assessment Authoring & Trainee Real-Time Execution:');
        const createQuestRes = await api('/api/questionnaires', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${trainerToken}` },
            body: {
                title: 'Real-Time Neural Networks Mastery Test',
                subject: 'Artificial Intelligence & Machine Learning',
                deadline: new Date(Date.now() + 86400000).toISOString(),
                duration_minutes: 15,
                pass_threshold: 60,
                description: 'Core evaluation on backpropagation, activation functions, and optimizer convergence.',
                questions: [
                    {
                        question_text: 'Which activation function is most widely used in deep neural network hidden layers to mitigate vanishing gradients?',
                        options: ['Sigmoid', 'ReLU', 'Step Function', 'Linear'],
                        correct_option_index: 1,
                        marks: 5
                    },
                    {
                        question_text: 'What algorithm computes gradient vectors across layered weights via chain rule differentiation?',
                        options: ['Backpropagation', 'Genetic Selection', 'Random Dropout', 'K-Means'],
                        correct_option_index: 0,
                        marks: 5
                    }
                ]
            }
        });
        assert(createQuestRes.ok && createQuestRes.data.questionnaire, 'Trainer published assessment questionnaire successfully');
        const questId = createQuestRes.data.questionnaire.id;

        // 6. Trainee Fetches & Takes the Assessment
        console.log('\n6. Testing Trainee Assessment Attempt & Real-Time Auto-Grading:');
        const traineeQuestList = await api('/api/questionnaires', {
            headers: { 'Authorization': `Bearer ${traineeToken}` }
        });
        assert(traineeQuestList.ok && traineeQuestList.data.questionnaires.some(q => q.id === questId), 'Trainee immediately sees newly published test in catalog');

        const traineeExamDetails = await api(`/api/questionnaires/${questId}`, {
            headers: { 'Authorization': `Bearer ${traineeToken}` }
        });
        assert(traineeExamDetails.ok && traineeExamDetails.data.questions.length === 2, 'Trainee retrieved exam questions');
        const q1 = traineeExamDetails.data.questions[0];
        const q2 = traineeExamDetails.data.questions[1];

        // Trainee submits correct answers (Option 1 for Q1, Option 0 for Q2)
        const answersMap = {};
        answersMap[q1.id] = 1;
        answersMap[q2.id] = 0;

        const submitExamRes = await api(`/api/questionnaires/${questId}/attempt`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${traineeToken}` },
            body: { answers: answersMap }
        });
        assert(submitExamRes.ok, 'Trainee exam submitted successfully');
        assert(submitExamRes.data.submission.score_percentage == 100, 'Score calculated as 100%');
        assert(submitExamRes.data.submission.is_passed === true, 'Passed status recorded in PostgreSQL');
        assert(!!submitExamRes.data.certificate, 'Certificate automatically generated and returned with verification code');

        // 7. Trainer & Admin Real-Time Verification
        console.log('\n7. Testing Trainer Performance Dashboard:');
        const trainerOverview = await api('/api/trainer/overview', {
            headers: { 'Authorization': `Bearer ${trainerToken}` }
        });
        assert(trainerOverview.ok && Array.isArray(trainerOverview.data.submissions), 'Trainer overview retrieved submissions');
        const traineeSubInTrainer = trainerOverview.data.submissions.find(s => s.trainee_name === 'Akshay Trainee Candidate');
        assert(!!traineeSubInTrainer, 'Trainee submission with exact name appears in Trainer performance dashboard');

    } catch (err) {
        console.error('Unexpected test error:', err);
        failedCount++;
    }

    console.log('\n=========================================================');
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('=========================================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
}

runVerification();
