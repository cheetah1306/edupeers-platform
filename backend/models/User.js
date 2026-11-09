const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    email: { type: String, unique: true, required: true },
    password_hash: { type: String, default: 'placeholder_hash' },
    institution_name: { type: String, default: '' },
    user_role: { type: String, enum: ['student', 'teacher'], default: 'student' },
    profession: { type: String, default: '' },
    age: { type: Number, default: null },
    gender: { type: String, default: '' },
    xp_score: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
