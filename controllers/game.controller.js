const GameService = require('../services/game.service');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const redis = require('../services/redis.service'); // Import Redis client

exports.placeBet = async (req, res) => {
    try {
        // Validate request body
        const { amountUSD, cryptoType, autoCashoutAt } = req.body;
        const userId = req.user._id;
        const gameService = req.app.get('gameService');
        
        const bet = await gameService.placeBet(userId, amountUSD, cryptoType, autoCashoutAt);
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
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        let prices = { BTC: 0, ETH: 0 };
        let btcValue = 0;
        let ethValue = 0;
        let totalValue = user.wallet.usd;

        // --- NEW: Get prices from Redis ---
        const pricesStr = await redis.get('game:prices');
        if (pricesStr) {
            prices = JSON.parse(pricesStr);
            btcValue = user.wallet.btc * prices.BTC;
            ethValue = user.wallet.eth * prices.ETH;
            totalValue += btcValue + ethValue;
        } else {
            logger.warn('Could not find prices in Redis for wallet view.');
        }
        // --- END NEW ---

        res.status(200).json({
            ...user.toObject(),
            walletValueUSD: {
                btc: btcValue.toFixed(2),
                eth: ethValue.toFixed(2),
                total: totalValue.toFixed(2)
            }
        });

    } catch (error) {
        logger.error(`Error in getWallet controller: ${error.message}`);
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