const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:cheetah@1306@localhost:5432/edupeers' });

const course10Questions = {
    'Full-Stack Web Development': [
        {
            text: 'Which architectural component in Node.js handles asynchronous non-blocking I/O operations and delegates to the thread pool?',
            options: ['V8 JavaScript Engine', 'libuv Event Loop and Thread Pool', 'Nginx Reverse Proxy', 'DOM Parser Engine'],
            correct: 1,
            marks: 10,
            explanation: 'libuv is the multi-platform C library that provides the event loop and thread pool in Node.js for asynchronous I/O.'
        },
        {
            text: 'What is the primary benefit of creating a composite B-tree index on (user_id, created_at) in PostgreSQL for temporal user queries?',
            options: ['Eliminates the need for primary keys', 'Allows single-index scan for both user filtering and chronological sorting', 'Converts relational data into key-value pairs', 'Disables table locking permanently'],
            correct: 1,
            marks: 10,
            explanation: 'A composite index on (user_id, created_at) satisfies both filtering on user_id and ORDER BY created_at in a single index scan.'
        },
        {
            text: 'In RESTful API design, which HTTP method is required to be idempotent and replaces the entire existing representation of a resource?',
            options: ['POST', 'PATCH', 'PUT', 'CONNECT'],
            correct: 2,
            marks: 10,
            explanation: 'HTTP PUT is idempotent and specifies complete replacement of target resource state.'
        },
        {
            text: 'Why should JWT signature verification always check the algorithm header explicitly against a server-allowed whitelist?',
            options: ['To minimize HTTP cookie size', 'To prevent algorithm confusion attacks such as none or HMAC-RSA spoofing', 'To support HTTP/3 multiplexing', 'To allow client-side key generation'],
            correct: 1,
            marks: 10,
            explanation: 'Whitelisting allowed algorithms prevents attackers from tampering with the alg header to bypass verification.'
        },
        {
            text: 'In React 18+, what is the purpose of automatic batching with the createRoot API?',
            options: ['It groups state updates inside async handlers, timeouts, and promises into a single re-render', 'It bundles JavaScript files at build time', 'It automatically compiles TypeScript into WebAssembly', 'It replaces React Context with Redux'],
            correct: 0,
            marks: 10,
            explanation: 'React 18 automatic batching groups multiple state updates inside promises, timeouts, and native event handlers into a single render pass.'
        },
        {
            text: 'When designing database normalization, what condition must be met for a relation to be in Third Normal Form (3NF)?',
            options: ['It must contain XML attributes only', 'It must be in 2NF and have no transitive functional dependencies on the primary key', 'Every column must be indexed with a Hash index', 'It must have foreign keys on every table'],
            correct: 1,
            marks: 10,
            explanation: '3NF requires that the relation is in 2NF and every non-prime attribute is non-transitively dependent on the primary key.'
        },
        {
            text: 'What is the primary mechanism used by WebSockets to achieve full-duplex communication between client and server?',
            options: ['Repeated HTTP POST polling every 50ms', 'A single persistent TCP connection initiated via an HTTP Upgrade handshake', 'Server-Sent Events (SSE) streaming', 'DNS query tunneling'],
            correct: 1,
            marks: 10,
            explanation: 'WebSockets initiate with an HTTP Upgrade request and maintain a persistent, bidirectional TCP connection.'
        },
        {
            text: 'In CSS Grid Layout, which property defines the sizing of columns that automatically wrap based on minimum width constraints?',
            options: ['grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))', 'flex-wrap: wrap-reverse', 'display: inline-block', 'column-count: auto'],
            correct: 0,
            marks: 10,
            explanation: 'repeat(auto-fit, minmax(250px, 1fr)) dynamically computes column counts based on viewport width.'
        },
        {
            text: 'What is the primary purpose of database connection pooling in high-throughput backend services?',
            options: ['To cache SQL query results forever in memory', 'To reuse active database connections and eliminate TCP/TLS handshake overhead per query', 'To bypass SQL syntax parsing', 'To automatically generate migration scripts'],
            correct: 1,
            marks: 10,
            explanation: 'Connection pooling maintains open connections, drastically reducing connection overhead and latency.'
        },
        {
            text: 'Which security header protects modern single-page applications against Cross-Site Scripting (XSS) by restricting executable sources?',
            options: ['Content-Security-Policy (CSP)', 'X-Frame-Options: SAMEORIGIN', 'Access-Control-Allow-Origin: *', 'Strict-Transport-Security: max-age=31536000'],
            correct: 0,
            marks: 10,
            explanation: 'Content-Security-Policy (CSP) specifies approved sources of executable scripts, stylesheets, and multimedia.'
        }
    ],
    'AI & Machine Learning': [
        {
            text: 'In Transformer architectures, what is the purpose of the Multi-Head Self-Attention mechanism?',
            options: ['To compress input tokens into binary weights', 'To allow the model to jointly attend to information from different representation subspaces at different positions', 'To eliminate the need for embedding layers', 'To convert neural networks into linear regression'],
            correct: 1,
            marks: 10,
            explanation: 'Multi-Head Attention expands the models ability to focus on different positions and representation subspaces simultaneously.'
        },
        {
            text: 'What is the function of Retrieval-Augmented Generation (RAG) in modern LLM systems?',
            options: ['Retraining foundational models from scratch on every prompt', 'Retrieving relevant contextual documents from a vector store to ground LLM generation', 'Translating Python code to CUDA kernels', 'Compressing neural network weights using 8-bit quantization'],
            correct: 1,
            marks: 10,
            explanation: 'RAG dynamically fetches factual context from external knowledge bases or vector databases to ground generation and minimize hallucinations.'
        },
        {
            text: 'Which vector similarity metric computes the cosine of the angle between two embedding vectors regardless of their magnitude?',
            options: ['Euclidean L2 Distance', 'Cosine Similarity', 'Manhattan L1 Distance', 'Hamming Distance'],
            correct: 1,
            marks: 10,
            explanation: 'Cosine similarity measures angular orientation between vectors, making it robust to variations in document length.'
        },
        {
            text: 'What does Temperature control during autoregressive token sampling in generative models?',
            options: ['GPU hardware thermal throttling', 'The sharpness of the output probability distribution over the vocabulary', 'The learning rate of the AdamW optimizer', 'The batch size during gradient accumulation'],
            correct: 1,
            marks: 10,
            explanation: 'Temperature scales logits prior to softmax; lower values yield deterministic outputs while higher values increase randomness.'
        },
        {
            text: 'What is the primary role of FlashAttention in optimizing Transformer training and inference?',
            options: ['Replacing self-attention with convolutional filters', 'Making attention computation IO-aware by fusing tiling operations across GPU SRAM and HBM', 'Quantizing all weights to 1-bit integers', 'Converting dense networks to decision trees'],
            correct: 1,
            marks: 10,
            explanation: 'FlashAttention reorganizes attention computation into tiled memory blocks, drastically reducing memory bandwidth bottlenecks.'
        },
        {
            text: 'In parameter-efficient fine-tuning (PEFT), how does LoRA (Low-Rank Adaptation) reduce trainable parameters?',
            options: ['By freezing the base model and decomposing weight update matrices into low-rank matrices (A and B)', 'By pruning 90% of model layers randomly', 'By training only the tokenizer embeddings', 'By quantizing the model to int4 without training'],
            correct: 0,
            marks: 10,
            explanation: 'LoRA freezes pretrained weights and injects trainable low-rank rank decomposition matrices into Transformer attention layers.'
        },
        {
            text: 'What does the ROC-AUC score measure in binary classification models?',
            options: ['Mean Squared Error across continuous variables', 'The models capability to distinguish between positive and negative classes across all classification thresholds', 'Execution speed in frames per second', 'Memory consumption of the forward pass'],
            correct: 1,
            marks: 10,
            explanation: 'ROC-AUC computes the Area Under the Receiver Operating Characteristic curve, quantifying class separability independent of decision thresholds.'
        },
        {
            text: 'What is the purpose of Layer Normalization in deep Transformer neural networks?',
            options: ['To normalize activations across feature dimensions for each individual sample, stabilizing hidden state dynamics', 'To normalize dataset rows during ETL preprocessing', 'To encrypt neural network weights', 'To sort input tokens in alphabetical order'],
            correct: 0,
            marks: 10,
            explanation: 'LayerNorm computes mean and variance across feature channels independently for each token representation, enabling stable deep training.'
        },
        {
            text: 'Which technique is commonly used to prevent catastrophic forgetting when fine-tuning pretrained models on specialized domains?',
            options: ['High learning rate SGD without weight decay', 'Replay buffers, regularization techniques, or parameter-efficient adapters like LoRA', 'Discarding pretrained weights before training', 'Increasing batch size to infinity'],
            correct: 1,
            marks: 10,
            explanation: 'Adapter methods and regularization preserve pretrained foundational representations while adapting to new domain distributions.'
        },
        {
            text: 'In vector search indexing, what is the trade-off of using HNSW (Hierarchical Navigable Small World) graphs?',
            options: ['Infinite disk storage requirements', 'Sub-linear O(log N) approximate nearest neighbor search speed with higher RAM indexing overhead', 'Zero recall on dense embeddings', 'Requires exact sequential scan on all vectors'],
            correct: 1,
            marks: 10,
            explanation: 'HNSW builds multi-layer proximity graphs providing ultra-fast approximate nearest neighbor retrieval at the cost of graph indexing RAM.'
        }
    ],
    'Cybersecurity & DevSecOps': [
        {
            text: 'What core principle defines the Zero-Trust Architecture (NIST SP 800-207)?',
            options: ['Implicit trust for all devices on the internal local network', 'Never Trust, Always Verify: explicit verification of identity, context, and posture on every request', 'Disabling multi-factor authentication for administrators', 'Allowing unauthenticated public API access'],
            correct: 1,
            marks: 10,
            explanation: 'Zero Trust assumes no implicit trust granted to assets based solely on physical or network location.'
        },
        {
            text: 'Which attack vector is mitigated by enforcing HTTP Strict Transport Security (HSTS) with the includeSubDomains directive?',
            options: ['SQL Injection in stored procedures', 'SSL-stripping man-in-the-middle attacks and involuntary downgrade to plain HTTP', 'CSS specificity conflicts', 'Cross-Site Request Forgery in GET requests'],
            correct: 1,
            marks: 10,
            explanation: 'HSTS instructs browsers to only connect to the domain and subdomains using HTTPS, preventing protocol downgrade attacks.'
        },
        {
            text: 'What is the primary objective of Static Application Security Testing (SAST) in CI/CD pipelines?',
            options: ['Testing application performance under high network load', 'Analyzing source code and ASTs for security vulnerabilities without executing the binary', 'Simulating distributed denial of service attacks', 'Compiling Docker container images'],
            correct: 1,
            marks: 10,
            explanation: 'SAST analyzes source code, bytecode, or application binaries at rest to detect vulnerabilities and CWE flaws early in the SDLC.'
        },
        {
            text: 'How does parameterized SQL (Prepared Statements) completely prevent SQL Injection (SQLi) vulnerabilities?',
            options: ['By converting SQL databases into JSON flat files', 'By treating user input strictly as literal parameters rather than executable SQL syntax tokens', 'By hashing all table column names', 'By encrypting database connection strings in environment variables'],
            correct: 1,
            marks: 10,
            explanation: 'Prepared statements separate query structure from data inputs, ensuring user strings cannot alter the SQL AST.'
        },
        {
            text: 'What is the security purpose of configuring Role-Based Access Control (RBAC) with the Principle of Least Privilege?',
            options: ['Granting all users full root administrative access by default', 'Ensuring identities only have the minimal set of permissions required to perform their specific duties', 'Disabling password expiration policies', 'Replacing TLS certificates with symmetric keys'],
            correct: 1,
            marks: 10,
            explanation: 'Least privilege minimizes blast radius by restricting access permissions to only the essential resources required.'
        },
        {
            text: 'Which mechanism prevents Cross-Site Request Forgery (CSRF) on state-changing POST and PUT requests?',
            options: ['SameSite=Strict cookie attributes combined with cryptographically signed Anti-CSRF tokens', 'Using GET requests for database deletions', 'Disabling CORS preflight checks', 'Setting Access-Control-Allow-Origin to *'],
            correct: 0,
            marks: 10,
            explanation: 'SameSite cookie flags and Anti-CSRF tokens guarantee that incoming requests originate intentionally from authorized application pages.'
        },
        {
            text: 'In container security, why should production Docker containers never be executed as the root user?',
            options: ['Root containers cannot execute JavaScript', 'If a container escape vulnerability occurs, the attacker gains root privileges on the host kernel', 'Root containers use 10x more RAM', 'Docker forbids building root images'],
            correct: 1,
            marks: 10,
            explanation: 'Executing containers as non-root limits container breakout blast radius on the underlying host operating system.'
        },
        {
            text: 'What cryptographic hash algorithm family is currently recommended by NIST for password storage along with salt and work factors?',
            options: ['MD5 with single iteration', 'Argon2id, bcrypt, or PBKDF2 with high computational cost factors', 'SHA-1 without salt', 'ROT13 obfuscation'],
            correct: 1,
            marks: 10,
            explanation: 'Argon2id and bcrypt use memory-hard and CPU-intensive work factors that resist ASIC and GPU brute-force cracking.'
        },
        {
            text: 'What does a Software Bill of Materials (SBOM) provide for software supply chain security?',
            options: ['A financial invoice for cloud compute usage', 'A comprehensive inventory of all third-party dependencies, libraries, versions, and licenses in an application', 'A compiler log file', 'An IP address lookup table'],
            correct: 1,
            marks: 10,
            explanation: 'SBOM provides transparency into dependency trees, enabling rapid identification of CVEs in upstream libraries (e.g. Log4j).'
        },
        {
            text: 'What is the function of Mutual TLS (mTLS) in zero-trust service-to-service communication?',
            options: ['Compressing HTTP payload bodies', 'Cryptographically authenticating both client and server identities using X.509 certificates and encrypting transit data', 'Disabling TCP timeouts', 'Generating random passwords for databases'],
            correct: 1,
            marks: 10,
            explanation: 'mTLS verifies the cryptographic identity of both communicating peers, ensuring bidirectional trust and transit confidentiality.'
        }
    ]
};

async function ensureCourseAssessments() {
    const client = await pool.connect();
    try {
        console.log('🔄 Verifying schema and creating 10-question technical assessments for all courses...');
        await client.query('ALTER TABLE questionnaires ALTER COLUMN trainer_id DROP NOT NULL;');
        await client.query('BEGIN');

        // Find fallback active admin or trainer
        const adminRes = await client.query('SELECT id FROM users WHERE user_role = \'admin\' LIMIT 1');
        const adminId = adminRes.rows[0] ? adminRes.rows[0].id : null;

        const coursesRes = await client.query('SELECT * FROM courses ORDER BY created_at ASC');
        const courses = coursesRes.rows;

        for (const c of courses) {
            // Check if course already has a questionnaire with 10 questions
            const qRes = await client.query(`
                SELECT q.id, (SELECT COUNT(*) FROM questions qn WHERE qn.questionnaire_id = q.id) AS count
                FROM questionnaires q WHERE q.course_id = $1
            `, [c.id]);

            let questionnaireId;
            const existingQ = qRes.rows[0];

            if (existingQ && parseInt(existingQ.count) >= 10) {
                console.log(`✅ Course "${c.title}" already has ${existingQ.count} questions.`);
                continue;
            }

            const trainerId = c.trainer_id || adminId;

            if (existingQ) {
                questionnaireId = existingQ.id;
            } else {
                const deadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
                const insQ = await client.query(`
                    INSERT INTO questionnaires (course_id, subject, trainer_id, title, description, deadline, duration_minutes, attempts_allowed, pass_threshold, status)
                    VALUES ($1, $2, $3, $4, $5, $6, 30, 3, 70, 'published')
                    RETURNING id;
                `, [
                    c.id,
                    c.subject,
                    trainerId,
                    `${c.title} — Comprehensive Assessment`,
                    `Official 10-question technical assessment covering all modules and domain principles for ${c.title}. Passing score: 70%.`,
                    deadline
                ]);
                questionnaireId = insQ.rows[0].id;
                console.log(`Created questionnaire for "${c.title}": ${questionnaireId}`);
            }

            // Get domain questions pool
            let questionsPool = course10Questions[c.subject] || course10Questions['Full-Stack Web Development'];

            // Clear old questions if incomplete and insert full 10 questions
            await client.query('DELETE FROM questions WHERE questionnaire_id = $1', [questionnaireId]);

            for (let i = 0; i < questionsPool.length; i++) {
                const q = questionsPool[i];
                await client.query(`
                    INSERT INTO questions (questionnaire_id, question_text, options, correct_option_index, marks, explanation, order_num)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    questionnaireId,
                    q.text,
                    JSON.stringify(q.options),
                    q.correct,
                    q.marks,
                    q.explanation,
                    i + 1
                ]);
            }
            console.log(`✅ Attached full 10-question technical exam to "${c.title}".`);
        }

        await client.query('COMMIT');
        console.log('🎉 All courses now have official 10-question assessments!');

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

ensureCourseAssessments();
