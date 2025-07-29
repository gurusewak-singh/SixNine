const GameService = require('../services/game.service');
const User = require('../models/user.model');
const logger = require('../utils/logger');

// Note: In a real app, the gameService would be injected via dependency injection.
// For simplicity, we'll rely on the singleton nature of our server setup.
// This controller is a thin layer to handle HTTP requests.

exports.placeBet = async (req, res) => {
    try {
        const { amountUSD, cryptoType } = req.body;
        const userId = req.user._id;

        // The actual gameService instance is managed in server.js
        // This is a conceptual link. The real interaction happens in the route handler.
        // We'll pass the gameService instance from the request object.
        const gameService = req.app.get('gameService');
        if (!gameService) return res.status(500).json({ message: 'Game service not available' });

        const bet = await gameService.placeBet(userId, amountUSD, cryptoType);
        res.status(201).json({ message: 'Bet placed successfully', bet });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.cashout = async (req, res) => {
    try {
        const userId = req.user._id;
        const gameService = req.app.get('gameService');
        if (!gameService) return res.status(500).json({ message: 'Game service not available' });

        const result = await gameService.cashout(userId);
        res.status(200).json({ message: 'Cashed out successfully', ...result });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getWallet = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('wallet username');
        const prices = await require('../services/crypto.service').getPrices();
        const btcValue = user.wallet.btc * prices.BTC;
        const ethValue = user.wallet.eth * prices.ETH;
        const totalValue = user.wallet.usd + btcValue + ethValue;

        res.status(200).json({
            ...user.toObject(),
            walletValueUSD: {
                btc: btcValue.toFixed(2),
                eth: ethValue.toFixed(2),
                total: totalValue.toFixed(2)
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet data' });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const gameService = req.app.get('gameService');
        if (!gameService) return res.status(500).json({ message: 'Game service not available' });
        
        const history = await gameService.getRoundHistory();
        res.status(200).json(history);
    } catch (error) {
        logger.error(`History Error: ${error.message}`);
        res.status(500).json({ message: 'Error fetching game history' });
    }
};