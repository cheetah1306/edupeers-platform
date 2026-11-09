# 🎓 EduPeers - Role-Based Learning & Development (L&D) Platform

EduPeers is a full-stack, modern enterprise Learning & Development platform built for trainees, trainers, and administrators. It features real-time peer collaboration, AI-powered tutoring & mark analysis, dynamic assessment engines, automated certification, and rich interactive learning tools.

---

## ✨ Features

- 👥 **Role-Based Access Control (RBAC)**: Strict permission boundaries for `trainee`, `trainer`, and `admin` roles.
- 🤖 **AI-Powered Learning**:
  - **AI Tutor**: Interactive conversational study assistant powered by Gemini & OpenAI.
  - **AI Mark & Performance Analysis**: In-depth breakdown of strengths, weaknesses, and targeted study recommendations.
- 📚 **Course Management**:
  - Dynamic course progress calculation based on resource completions and assessment grades.
  - Multi-format resource delivery: video lectures, PDF slides, and documentation guides.
  - Automated verifiable certificate generation (`CERT-XXXX-XXXX`) upon course qualification.
- ⏱️ **Assessment & Quiz Engine**:
  - Server-enforced submission deadlines and attempt limits.
  - Instant auto-grading with detailed feedback.
- 💬 **Peers Connect**: Real-time WebSocket-powered peer chat, group discussions, and active learner presence.
- 🎮 **Gamified Learning**: Focus sprints, memory matching games, logic trails, and interactive mind exercises.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 with Glassmorphism UI, Responsive Design.
- **Backend**: Node.js, Express.js, WebSockets (`ws`).
- **Database**: PostgreSQL (relational schemas, RBAC, courses, assessments, certificates).
- **AI Integration**: Google Gemini API (`@google/genai`), OpenAI API, Groq.
- **Authentication**: JWT tokens, bcryptjs salt-hashing, secure cookie parsing.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [PostgreSQL](https://www.postgresql.org/) (v14+)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/cheetah1306/edupeers-platform.git
   cd edupeers-platform
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the sample environment file and configure your credentials:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your PostgreSQL database URL and AI API keys.

4. **Initialize Database Schema & Seeds**:
   ```bash
   node seed.js
   ```

5. **Start the Platform**:
   ```bash
   node server.js
   ```
   Open your browser and navigate to:
   ```
   http://localhost:4000
   ```

---

## 🔑 Default Administrator Credentials

For initial bootstrap setup:
- **Email**: `admin@edupeers.com`
- **Password**: `Admin@123456`
- **Role**: `admin`

