const mongoose = require('mongoose');

const AiMessageSchema = new mongoose.Schema({
    session_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AiSession', required: true },
    role: { type: String, enum: ['user', 'ai'], required: true },
    content: { type: String, required: true },
    recorded_at: { type: Date, default: Date.now }
});

AiMessageSchema.index({ session_id: 1, recorded_at: 1 });

module.exports = mongoose.model('AiMessage', AiMessageSchema);
