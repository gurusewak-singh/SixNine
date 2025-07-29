const mongoose = require('mongoose');

const gameRoundSchema = new mongoose.Schema({
    roundId: { type: String, required: true, unique: true, index: true },
    serverSeed: { type: String, required: true },
    crashMultiplier: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'running', 'crashed'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GameRound', gameRoundSchema);