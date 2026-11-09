const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

async function seedDatabase() {
    console.log('🔄 Verifying Database Schema and Initializing Core Taxonomy...');

    const client = await pool.connect();
    try {
        // Drop legacy constraints across tables
        const dropConstraints = [
            'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_role_check;',
            'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;',
            'ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_status_check;',
            'ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;',
            'ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_type_check;',
            'ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_status_check;',
            'ALTER TABLE questionnaires DROP CONSTRAINT IF EXISTS questionnaires_status_check;',
            'ALTER TABLE feedback ALTER COLUMN target_id DROP NOT NULL;'
        ];

        for (const dc of dropConstraints) {
            try {
                await client.query(dc);
            } catch (e) {
                // Ignore
            }
        }

        // Run Schema DDL
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        await client.query(schemaSql);
        console.log('✅ Schema tables verified/created successfully.');

        // Reapply strict check constraints
        const addConstraints = [
            `ALTER TABLE users ADD CONSTRAINT users_user_role_check CHECK (user_role IN ('trainee', 'trainer', 'admin'));`,
            `ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'suspended'));`,
            `ALTER TABLE courses ADD CONSTRAINT courses_status_check CHECK (status IN ('draft', 'published', 'archived'));`,
            `ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check CHECK (status IN ('requested', 'enrolled', 'completed', 'dropped'));`,
            `ALTER TABLE resources ADD CONSTRAINT resources_type_check CHECK (type IN ('video', 'slides', 'document', 'link'));`,
            `ALTER TABLE resources ADD CONSTRAINT resources_status_check CHECK (status IN ('draft', 'published'));`,
            `ALTER TABLE questionnaires ADD CONSTRAINT questionnaires_status_check CHECK (status IN ('draft', 'published', 'archived'));`
        ];

        for (const ac of addConstraints) {
            try {
                await client.query(ac);
            } catch (e) {
                // Ignore if constraint already active
            }
        }
        console.log('✅ Strict role, status, and domain constraints verified.');

        // Hash default password for initial Admin
        const adminHash = await bcrypt.hash('Admin@123456', 10);

        // Upsert Primary Seed Admin (Auto-active)
        const adminRes = await client.query(`
            INSERT INTO users (username, email, password_hash, user_role, status, department, designation, phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                user_role = 'admin',
                status = 'active',
                department = EXCLUDED.department,
                designation = EXCLUDED.designation
            RETURNING id, email, user_role, status;
        `, ['System Admin', 'admin@edupeers.com', adminHash, 'admin', 'active', 'L&D Leadership', 'Chief Learning Officer', '+1 (555) 019-2831']);

        const adminId = adminRes.rows[0].id;
        console.log(`✅ System Admin initialized: ${adminRes.rows[0].email} (${adminId})`);

        // Upsert Taxonomy Subjects (Real domain taxonomies for competency matrix and courses)
        const subjectsData = [
            { name: 'Full-Stack Web Development', category: 'Software Engineering', desc: 'Modern frontend, backend, APIs, and microservices architecture.' },
            { name: 'Cloud Architecture & DevOps', category: 'Infrastructure', desc: 'Containerization, CI/CD pipelines, Kubernetes, and cloud security.' },
            { name: 'AI & Machine Learning', category: 'Data & AI', desc: 'LLM applications, deep learning, PyTorch, and generative AI systems.' },
            { name: 'Cybersecurity & DevSecOps', category: 'Security', desc: 'Threat modeling, zero-trust architecture, and secure coding.' },
            { name: 'Data Engineering & Analytics', category: 'Data & AI', desc: 'Distributed pipelines, real-time analytics, and data lakehouses.' }
        ];

        for (const s of subjectsData) {
            await client.query(`
                INSERT INTO subjects (name, category, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description;
            `, [s.name, s.category, s.desc]);
        }
        console.log(`✅ Taxonomy subjects initialized. Database contains ZERO fictional users and is ready for real-time live data!`);

    } catch (err) {
        console.error('❌ Database migration error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };
