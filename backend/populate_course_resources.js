const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

const courseResources = {
    'Full-Stack Web Development': [
        {
            type: 'video',
            title: 'Module 1: Modern Node.js Runtime & Asynchronous Event Architecture',
            description: 'In-depth lecture explaining libuv, event loop phases, and thread pool delegation for scalable APIs.',
            file_name: 'nodejs-architecture-lecture.mp4',
            file_url: 'https://storage.googleapis.com/edupeers-content/fullstack/nodejs-arch.mp4',
            file_type: 'video/mp4',
            file_size: '142 MB',
            status: 'published'
        },
        {
            type: 'slides',
            title: 'Module 2: PostgreSQL Indexing, Query Optimization & Connection Pooling',
            description: 'Slide deck covering B-tree indexes, execution plans (EXPLAIN ANALYZE), and connection pooling strategies.',
            file_name: 'postgres-query-optimization.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/fullstack/pg-optimization-slides.pdf',
            file_type: 'application/pdf',
            file_size: '8.4 MB',
            status: 'published'
        },
        {
            type: 'document',
            title: 'Module 3: Production Security, JWT Best Practices & RBAC Design',
            description: 'Comprehensive technical handbook on zero-trust authentication, token signing, and role-based access control.',
            file_name: 'rbac-security-guide.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/fullstack/rbac-security-handbook.pdf',
            file_type: 'application/pdf',
            file_size: '4.2 MB',
            status: 'published'
        }
    ],
    'AI & Machine Learning': [
        {
            type: 'video',
            title: 'Module 1: Transformer Architectures & Multi-Head Attention Mechanisms',
            description: 'Technical deep-dive on self-attention, positional encoding, and scaling laws for foundational LLMs.',
            file_name: 'transformers-deepdive.mp4',
            file_url: 'https://storage.googleapis.com/edupeers-content/ai-ml/transformers-attention.mp4',
            file_type: 'video/mp4',
            file_size: '185 MB',
            status: 'published'
        },
        {
            type: 'slides',
            title: 'Module 2: RAG Pipeline Engineering & Vector Database Indexing',
            description: 'Presentation slides covering embedding models, chunking strategies, and HNSW approximate nearest neighbor search.',
            file_name: 'rag-vector-search.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/ai-ml/rag-vector-slides.pdf',
            file_type: 'application/pdf',
            file_size: '12.1 MB',
            status: 'published'
        },
        {
            type: 'document',
            title: 'Module 3: LoRA & Parameter-Efficient Fine-Tuning (PEFT) Guidebook',
            description: 'Step-by-step implementation guide for domain adaptation using low-rank adapters and quantized training.',
            file_name: 'peft-lora-guide.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/ai-ml/peft-lora-handbook.pdf',
            file_type: 'application/pdf',
            file_size: '5.6 MB',
            status: 'published'
        }
    ],
    'Cybersecurity & DevSecOps': [
        {
            type: 'video',
            title: 'Module 1: Zero-Trust Network Architecture & Identity Federation',
            description: 'Core concepts in zero-trust policy enforcement, mutual TLS, and continuous verification.',
            file_name: 'zerotrust-architecture.mp4',
            file_url: 'https://storage.googleapis.com/edupeers-content/security/zerotrust.mp4',
            file_type: 'video/mp4',
            file_size: '120 MB',
            status: 'published'
        },
        {
            type: 'slides',
            title: 'Module 2: Cloud Infrastructure Hardening & DevSecOps Pipelines',
            description: 'Slide deck on automated SAST/DAST security scanning, container image verification, and least privilege IAM.',
            file_name: 'devsecops-pipeline-slides.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/security/devsecops-slides.pdf',
            file_type: 'application/pdf',
            file_size: '9.2 MB',
            status: 'published'
        },
        {
            type: 'document',
            title: 'Module 3: Threat Modeling & Vulnerability Management Blueprint',
            description: 'STRIDE threat modeling frameworks, CVSS scoring criteria, and incident response playbooks.',
            file_name: 'threat-modeling-blueprint.pdf',
            file_url: 'https://storage.googleapis.com/edupeers-content/security/threat-modeling.pdf',
            file_type: 'application/pdf',
            file_size: '3.8 MB',
            status: 'published'
        }
    ]
};

async function seedCourseResources() {
    console.log('🔄 Seeding rich learning resources across all published courses...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch admin user ID to assign as default author
        const adminRes = await client.query("SELECT id FROM users WHERE user_role = 'admin' LIMIT 1");
        if (adminRes.rows.length === 0) {
            console.error('❌ Admin user not found.');
            return;
        }
        const adminId = adminRes.rows[0].id;

        const coursesRes = await client.query("SELECT id, title, subject, trainer_id FROM courses WHERE status = 'published'");
        console.log(`Found ${coursesRes.rows.length} published courses.`);

        for (const c of coursesRes.rows) {
            const trainerId = c.trainer_id || adminId;
            const resPool = courseResources[c.subject] || courseResources['Full-Stack Web Development'];

            for (const r of resPool) {
                // Check if resource already exists for this course
                const existing = await client.query(
                    'SELECT id FROM resources WHERE course_id = $1 AND title = $2',
                    [c.id, r.title]
                );

                if (existing.rows.length === 0) {
                    await client.query(`
                        INSERT INTO resources (course_id, subject, trainer_id, type, title, description, file_name, file_url, file_type, file_size, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    `, [
                        c.id,
                        c.subject,
                        trainerId,
                        r.type,
                        r.title,
                        r.description,
                        r.file_name,
                        r.file_url,
                        r.file_type,
                        r.file_size,
                        r.status
                    ]);
                    console.log(`✅ Added resource [${r.type}] "${r.title}" to course "${c.title}"`);
                }
            }
        }

        await client.query('COMMIT');
        console.log('🎉 Course resources successfully populated!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error seeding resources:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seedCourseResources();
