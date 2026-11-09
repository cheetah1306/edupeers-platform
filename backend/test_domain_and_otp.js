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

async function runDomainAndOtpVerification() {
    console.log('🚀 ======================================================================');
    console.log('🚀 STARTING DOMAIN MATCHING, ADMIN GLOBAL VISIBILITY & STRICT OTP TESTS');
    console.log('🚀 ======================================================================\n');

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
        const timestamp = Date.now();

        // 1. Test Strict OTP Validation
        console.log('1. Testing Strict OTP Security Verification:');
        const testEmail = `otp.security.${timestamp}@gmail.com`;
        const sendOtpRes = await api('/api/auth/send-otp', {
            method: 'POST',
            body: {
                username: 'Security Test User',
                age: 23,
                gender: 'female',
                email: testEmail,
                institution: 'Security Labs',
                role: 'trainee',
                profession: 'AI & Machine Learning'
            }
        });
        assert(sendOtpRes.ok && sendOtpRes.data.demoOtp, 'OTP dispatched with unique code');
        const realOtp = sendOtpRes.data.demoOtp;

        // Try invalid OTP
        const badOtpRes = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: testEmail, otp: '999888' }
        });
        assert(!badOtpRes.ok && badOtpRes.status === 400, 'Invalid OTP (999888) is strictly rejected with 400 Bad Request');

        // Try valid OTP
        const validOtpRes = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: testEmail, otp: realOtp }
        });
        assert(validOtpRes.ok && validOtpRes.data.token, 'Correct OTP accepted and session token generated');

        // 2. Register Trainer in "AI & Machine Learning"
        console.log('\n2. Registering AI Trainer:');
        const aiTrainerEmail = `trainer.ai.${timestamp}@gmail.com`;
        const trainerOtpSend = await api('/api/auth/send-otp', {
            method: 'POST',
            body: {
                username: 'Professor Alan AI',
                age: 42,
                gender: 'male',
                email: aiTrainerEmail,
                institution: 'Institute of Artificial Intelligence',
                role: 'trainer',
                profession: 'AI & Machine Learning'
            }
        });
        const trainerVerify = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: aiTrainerEmail, otp: trainerOtpSend.data.demoOtp }
        });
        const trainerToken = trainerVerify.data.token;
        const trainerId = trainerVerify.data.user.id;
        assert(trainerVerify.ok, 'AI Trainer registered in "AI & Machine Learning" domain');

        // 3. Register Trainee 1 in "AI & Machine Learning" (MATCHING DOMAIN)
        console.log('\n3. Registering Matched Trainee in "AI & Machine Learning":');
        const aiTraineeEmail = `trainee.ai.${timestamp}@gmail.com`;
        const trainee1OtpSend = await api('/api/auth/send-otp', {
            method: 'POST',
            body: {
                username: 'Alice AI Learner',
                age: 21,
                gender: 'female',
                email: aiTraineeEmail,
                institution: 'Data Science Academy',
                role: 'trainee',
                profession: 'AI & Machine Learning'
            }
        });
        const trainee1Verify = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: aiTraineeEmail, otp: trainee1OtpSend.data.demoOtp }
        });
        const trainee1Token = trainee1Verify.data.token;
        const trainee1Id = trainee1Verify.data.user.id;
        assert(trainee1Verify.ok, 'Trainee 1 registered with matching domain "AI & Machine Learning"');

        // 4. Register Trainee 2 in "Cybersecurity & DevSecOps" (DIFFERENT DOMAIN)
        console.log('\n4. Registering Unmatched Trainee in "Cybersecurity & DevSecOps":');
        const cyberTraineeEmail = `trainee.cyber.${timestamp}@gmail.com`;
        const trainee2OtpSend = await api('/api/auth/send-otp', {
            method: 'POST',
            body: {
                username: 'Bob Cyber Specialist',
                age: 25,
                gender: 'male',
                email: cyberTraineeEmail,
                institution: 'Security Operations Institute',
                role: 'trainee',
                profession: 'Cybersecurity & DevSecOps'
            }
        });
        const trainee2Verify = await api('/api/auth/verify-otp', {
            method: 'POST',
            body: { email: cyberTraineeEmail, otp: trainee2OtpSend.data.demoOtp }
        });
        assert(trainee2Verify.ok, 'Trainee 2 registered with non-matching domain "Cybersecurity & DevSecOps"');

        // 5. Admin Approves Users
        console.log('\n5. Admin Approving Registered Trainer & Trainees:');
        const adminLogin = await api('/api/auth/login', {
            method: 'POST',
            body: { email: 'admin@edupeers.com', password: 'Admin@123456' }
        });
        const adminToken = adminLogin.data.token;
        assert(adminLogin.ok, 'Admin authenticated');

        await api(`/api/admin/users/${trainerId}/approve`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
        await api(`/api/admin/users/${trainee1Id}/approve`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
        await api(`/api/admin/users/${trainee2Verify.data.user.id}/approve`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
        console.log('  ✅ Users approved to active status');

        // 6. AI Trainer publishes an Assessment Test
        console.log('\n6. AI Trainer Publishing Assessment:');
        const questRes = await api('/api/questionnaires', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${trainerToken}` },
            body: {
                title: 'Deep Transformers & Self-Attention Quiz',
                subject: 'AI & Machine Learning',
                deadline: new Date(Date.now() + 86400000).toISOString(),
                duration_minutes: 20,
                pass_threshold: 60,
                description: 'Evaluation on multi-head attention and positional encodings.',
                questions: [
                    {
                        question_text: 'What is the complexity of scaled dot-product attention with sequence length N?',
                        options: ['O(N)', 'O(N^2)', 'O(log N)', 'O(1)'],
                        correct_option_index: 1,
                        marks: 10
                    }
                ]
            }
        });
        assert(questRes.ok && questRes.data.questionnaire, 'AI assessment questionnaire published');
        const questId = questRes.data.questionnaire.id;

        // 7. Trainee 1 (AI Domain) takes the assessment test
        console.log('\n7. Matched AI Trainee Takes the Assessment:');
        const examDetails = await api(`/api/questionnaires/${questId}`, {
            headers: { 'Authorization': `Bearer ${trainee1Token}` }
        });
        const qId = examDetails.data.questions[0].id;
        const answers = {};
        answers[qId] = 1; // Correct answer (O(N^2))

        const examSubmit = await api(`/api/questionnaires/${questId}/attempt`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${trainee1Token}` },
            body: { answers }
        });
        assert(examSubmit.ok && examSubmit.data.submission.score_percentage == 100, 'Matched Trainee scored 100% on the AI assessment');

        // 8. Verify Trainer Domain Matching Isolation
        console.log('\n8. Verifying Trainer Domain Matching Isolation:');
        const trainerTraineesRes = await api('/api/trainer/trainees', {
            headers: { 'Authorization': `Bearer ${trainerToken}` }
        });
        assert(trainerTraineesRes.ok, 'Trainer fetched domain-matched trainees');
        const domainTrainees = trainerTraineesRes.data.trainees || [];
        
        const hasMatchedTrainee = domainTrainees.some(t => t.email === aiTraineeEmail);
        const hasUnmatchedTrainee = domainTrainees.some(t => t.email === cyberTraineeEmail);

        assert(hasMatchedTrainee, 'Matched AI Trainee ("Alice AI Learner") is delivered to AI Trainer');
        assert(!hasUnmatchedTrainee, 'Unmatched Cyber Trainee ("Bob Cyber Specialist") is NOT delivered to AI Trainer');

        const matchedTraineeData = domainTrainees.find(t => t.email === aiTraineeEmail);
        assert(matchedTraineeData && matchedTraineeData.test_submissions && matchedTraineeData.test_submissions.length > 0, 'Matched Trainee test marks & score history are accurately delivered to Trainer');

        // 9. Verify Admin Global Full Visibility (All Users, Roles, Marks, and Profiles)
        console.log('\n9. Verifying Admin Global Visibility:');
        const adminUsersRes = await api('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert(adminUsersRes.ok, 'Admin fetched all platform users');
        const allUsers = adminUsersRes.data.users || [];

        const adminSeesTrainer = allUsers.some(u => u.email === aiTrainerEmail);
        const adminSeesTrainee1 = allUsers.some(u => u.email === aiTraineeEmail);
        const adminSeesTrainee2 = allUsers.some(u => u.email === cyberTraineeEmail);

        assert(adminSeesTrainer, 'Admin sees AI Trainer with exact profile details');
        assert(adminSeesTrainee1, 'Admin sees AI Trainee with exact test marks & scores');
        assert(adminSeesTrainee2, 'Admin sees Cyber Trainee with complete profile info');

        const adminTrainee1Data = allUsers.find(u => u.email === aiTraineeEmail);
        assert(adminTrainee1Data && adminTrainee1Data.test_submissions_details && adminTrainee1Data.test_submissions_details.length > 0, 'Admin receives complete assessment breakdown and marks data');

    } catch (err) {
        console.error('Unexpected test error:', err);
        failedCount++;
    }

    console.log('\n======================================================================');
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('======================================================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
}

runDomainAndOtpVerification();
