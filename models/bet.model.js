const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gameRound: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
    amountUSD: { type: Number, required: true },
    amountCrypto: { type: Number, required: true },
    cryptoType: { type: String, enum: ['BTC', 'ETH'], required: true },
    cashoutMultiplier: { type: Number, default: null },
    autoCashoutAt: { type: Number, default: null },
    status: {
        type: String,
        enum: ['placed', 'cashed_out', 'lost'],
        default: 'placed'
    },
}, { timestamps: true });

betSchema.index({ user: 1, gameRound: 1 }, { unique: true });

module.exports = mongoose.model('Bet', betSchema);