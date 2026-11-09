const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    encrypted_content: { type: String, required: true },
    delivery_status: { type: String, enum: ['Sent', 'Delivered', 'Read'], default: 'Sent' },
    recorded_at: { type: Date, default: Date.now }
});

MessageSchema.index({ sender_id: 1, receiver_id: 1, recorded_at: 1 });

module.exports = mongoose.model('Message', MessageSchema);
