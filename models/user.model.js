const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    usd: { type: Number, default: 1000.00 },
    btc: { type: Number, default: 0 },
    eth: { type: Number, default: 0 },
}, { _id: false });

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    wallet: { type: walletSchema, default: () => ({}) },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);