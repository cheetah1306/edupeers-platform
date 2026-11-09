const mongoose = require('mongoose');

const AiSessionSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New Conversation' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

AiSessionSchema.index({ user_id: 1, updated_at: -1 });

module.exports = mongoose.model('AiSession', AiSessionSchema);
