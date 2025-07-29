const mongoose = require('mongoose');

// Mock blockchain transaction log
const transactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['bet', 'payout'], required: true },
    amountUSD: { type: Number, required: true },
    amountCrypto: { type: Number, required: true },
    cryptoType: { type: String, enum: ['BTC', 'ETH'], required: true },
    txHash: { type: String, required: true, unique: true }, // Mock transaction hash
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);