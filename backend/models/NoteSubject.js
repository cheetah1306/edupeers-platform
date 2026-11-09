const mongoose = require('mongoose');

const NoteSubjectSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});

NoteSubjectSchema.index({ user_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('NoteSubject', NoteSubjectSchema);
