const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
    follower_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    following_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
    created_at: { type: Date, default: Date.now }
});

// Ensure unique (follower, following) pair
ConnectionSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

module.exports = mongoose.model('Connection', ConnectionSchema);
