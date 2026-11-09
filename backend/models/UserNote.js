const mongoose = require('mongoose');

const UserNoteSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteSubject' },
    title: { type: String, required: true },
    content: { type: String, required: true },
    priority: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

UserNoteSchema.index({ user_id: 1, subject_id: 1, updated_at: -1 });

module.exports = mongoose.model('UserNote', UserNoteSchema);
