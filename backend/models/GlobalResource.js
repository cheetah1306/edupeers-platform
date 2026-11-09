const mongoose = require('mongoose');

const GlobalResourceSchema = new mongoose.Schema({
    author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    author_name: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    file_name: { type: String, default: null },
    file_type: { type: String, default: null },
    file_data: { type: String, default: null }, // Base64 encoded file content
    tags: { type: [String], default: [] },
    created_at: { type: Date, default: Date.now }
});

// Index for chronological resource discovery
GlobalResourceSchema.index({ created_at: -1 });

module.exports = mongoose.model('GlobalResource', GlobalResourceSchema);
