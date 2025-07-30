const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const provablyFairService = require('./provablyFair.service');
const cryptoService = require('./crypto.service');
const redis = require('./redis.service'); 

const User = require('../models/user.model');
const GameRound = require('../models/gameRound.model');
const Bet = require('../models/bet.model');
const Transaction = require('../models/transaction.model');

const BETTING_PHASE_DURATION = 4000; // 4 seconds
const PENDING_PHASE_DURATION = 6000; // 6 seconds
const MULTIPLIER_INCREMENT_INTERVAL = 100; // 100ms

const GAME_STATE_KEY = 'game:state'; 
const ACTIVE_BETS_KEY = 'game:active_bets'; 
const GAME_PRICES_KEY = 'game:prices';
const LAST_PRICE_FETCH_KEY = 'game:last_price_fetch'; // NEW Redis key
const PRICE_CACHE_DURATION = 60 * 1000; // 60 seconds in milliseconds

class GameService {
    constructor(io) {
        this.io = io;
    }

    async getGameState() {
        const state = await redis.hgetall(GAME_STATE_KEY);
        if (state.currentMultiplier) state.currentMultiplier = parseFloat(state.currentMultiplier);
        if (state.crashMultiplier) state.crashMultiplier = parseFloat(state.crashMultiplier);
        if (state.startTime) state.startTime = parseInt(state.startTime, 10);
        return state;
    }

    async startGameLoop() {
        logger.info('Starting new game cycle.');
        try {
            await this.startNewRound();
            setTimeout(() => this.runGame(), BETTING_PHASE_DURATION);
        } catch (error) {
            logger.error(`Critical error in game loop: ${error.message}. Restarting in 10s.`);
            setTimeout(() => this.startGameLoop(), 10000);
        }
    }

    async startNewRound() {
        
        const now = Date.now();
        const lastFetch = await redis.get(LAST_PRICE_FETCH_KEY);

        // Check if need to fetch new prices
        if (!lastFetch || (now - parseInt(lastFetch, 10) > PRICE_CACHE_DURATION)) {
            logger.info('Price cache is stale. Fetching new prices from CryptoCompare...');
            try {
                const prices = await cryptoService.getPrices();
                await redis.set(GAME_PRICES_KEY, JSON.stringify(prices));
                await redis.set(LAST_PRICE_FETCH_KEY, now.toString());
            } catch (error) {
                logger.error(`CRITICAL: Failed to get prices for the game. The game will use stale prices if available. Error: ${error.message}`);
            }
        }

        const pricesStr = await redis.get(GAME_PRICES_KEY);
        if (!pricesStr) {
            // This happens only on the very first run if the API fails.
            logger.error("No prices available in cache. Pausing game for 10 seconds.");
            setTimeout(() => this.startGameLoop(), 10000);
            return;
        }

        const roundId = uuidv4();
        const serverSeed = process.env.SERVER_SEED;
        const crashMultiplier = provablyFairService.calculateCrashMultiplier(serverSeed, roundId);

        const newRound = new GameRound({ roundId, serverSeed, crashMultiplier });
        await newRound.save();

        await redis.hmset(GAME_STATE_KEY, {
            status: 'pending',
            currentRoundId: newRound._id.toString(),
            crashMultiplier,
            currentMultiplier: 1.00,
        });

        logger.info(`New round #${newRound._id} created. Crash at ${crashMultiplier}x. Betting is open.`);

        this.io.emit('game:start', {
            roundId: newRound.roundId,
            startTime: Date.now() + BETTING_PHASE_DURATION,
        });
    }

    async runGame() {
        await redis.hmset(GAME_STATE_KEY, {
            status: 'running',
            startTime: Date.now(),
        });
        logger.info(`Round is now running.`);
        this.runMultiplierLoop();
    }

    async runMultiplierLoop() {
        const gameState = await this.getGameState();
        if (gameState.status !== 'running') return;

        const elapsedTime = Date.now() - gameState.startTime;
        const growthFactor = 0.00006;
        const newMultiplier = parseFloat(Math.pow(Math.E, growthFactor * elapsedTime).toFixed(2));

        if (newMultiplier >= gameState.crashMultiplier) {
            this.endRound();
            return;
        }

        await redis.hset(GAME_STATE_KEY, 'currentMultiplier', newMultiplier);
        this.io.emit('game:multiplier', { multiplier: newMultiplier });

        await this.processAutoCashouts(newMultiplier);

        setTimeout(() => this.runMultiplierLoop(), MULTIPLIER_INCREMENT_INTERVAL);
    }

    async endRound() {
        const gameState = await this.getGameState();
        if (gameState.status === 'crashed') return; 

        await redis.hset(GAME_STATE_KEY, 'status', 'crashed');
        logger.info(`Round CRASHED at ${gameState.crashMultiplier}x`);

        this.io.emit('game:multiplier', { multiplier: gameState.crashMultiplier });

        setTimeout(() => {
            this.io.emit('game:crash', { multiplier: gameState.crashMultiplier });
        }, 50); 

        await GameRound.findByIdAndUpdate(gameState.currentRoundId, { status: 'crashed' });
        await this.resolveLosingBets(gameState.currentRoundId);

        await redis.del(ACTIVE_BETS_KEY);

        setTimeout(() => this.startGameLoop(), PENDING_PHASE_DURATION);
    }

    async placeBet(userId, amountUSD, cryptoType, autoCashoutAt = null) {
        const gameState = await this.getGameState();
        if (gameState.status !== 'pending') {
            throw new Error('Betting is closed for this round.');
        }
        if (amountUSD < 1) {
            throw new Error('Minimum bet is $1.');
        }

        if (autoCashoutAt && (isNaN(parseFloat(autoCashoutAt)) || autoCashoutAt <= 1.01)) {
            throw new Error('Auto-cashout multiplier must be a number greater than 1.01.');
        }
        
        const pricesStr = await redis.get(GAME_PRICES_KEY);
        if (!pricesStr) {
            throw new Error('Crypto prices are not available for this round. Please try again.');
        }
        const prices = JSON.parse(pricesStr);

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const user = await User.findById(userId).session(session);
            if (user.wallet.usd < amountUSD) {
                throw new Error('Insufficient USD balance.');
            }

            const cryptoPrice = prices[cryptoType];
            if (!cryptoPrice) throw new Error('Invalid crypto type.');
            const amountCrypto = parseFloat((amountUSD / cryptoPrice).toFixed(8));

            user.wallet.usd -= amountUSD;
            user.wallet[cryptoType.toLowerCase()] += amountCrypto;
            await user.save({ session });

            const bet = new Bet({
                user: userId,
                gameRound: gameState.currentRoundId,
                amountUSD,
                amountCrypto,
                cryptoType,
                autoCashoutAt 
            });
            await bet.save({ session });
            
            if (autoCashoutAt) {
                await redis.hset(ACTIVE_BETS_KEY, userId.toString(), autoCashoutAt);
            }

            const transaction = new Transaction({
                user: userId,
                type: 'bet',
                amountUSD,
                amountCrypto,
                cryptoType,
                txHash: `bet-${uuidv4()}`
            });
            await transaction.save({ session });

            await session.commitTransaction();
            logger.info(`User ${userId} placed a bet of $${amountUSD} (${amountCrypto} ${cryptoType})`);
            return bet;
        } catch (error) {
            await session.abortTransaction();
            logger.error(`Bet placement failed for user ${userId}: ${error.message}`);
            throw error;
        } finally {
            session.endSession();
        }
    }

    async processAutoCashouts(currentMultiplier) {
        const activeBets = await redis.hgetall(ACTIVE_BETS_KEY);
        for (const userId in activeBets) {
            const cashoutAt = parseFloat(activeBets[userId]);
            if (currentMultiplier >= cashoutAt) {
                try {
                    logger.info(`Auto-cashing out user ${userId} at ${currentMultiplier}x`);
                    await this.cashout(userId, cashoutAt); 
                    await redis.hdel(ACTIVE_BETS_KEY, userId); 
                } catch (error) {
                    logger.warn(`Auto-cashout failed for user ${userId}: ${error.message}`);
                    await redis.hdel(ACTIVE_BETS_KEY, userId);
                }
            }
        }
    }

    async cashout(userId, forcedMultiplier = null) {
        const gameState = await this.getGameState();
        if (gameState.status !== 'running') {
            throw new Error('Cannot cash out. Game is not running.');
        }
        
        const cashoutMultiplier = forcedMultiplier || gameState.currentMultiplier;
        
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const bet = await Bet.findOne({
                user: userId,
                gameRound: gameState.currentRoundId,
                status: 'placed'
            }).session(session);

            if (!bet) {
                throw new Error('No active bet found for this round.');
            }

            const winningsCrypto = bet.amountCrypto * cashoutMultiplier;
            
            const pricesStr = await redis.get(GAME_PRICES_KEY);
            if (!pricesStr) {
                throw new Error('Crypto prices are not available for this round. Cannot process cashout.');
            }
            const prices = JSON.parse(pricesStr);
            const cryptoPrice = prices[bet.cryptoType];
            const winningsUSD = parseFloat((winningsCrypto * cryptoPrice).toFixed(2));

            const user = await User.findById(userId).session(session);
            user.wallet[bet.cryptoType.toLowerCase()] -= bet.amountCrypto; 
            user.wallet.usd += winningsUSD; 
            await user.save({ session });

            bet.status = 'cashed_out';
            bet.cashoutMultiplier = cashoutMultiplier;
            await bet.save({ session });
            
            const transaction = new Transaction({
                user: userId,
                type: 'payout',
                amountUSD: winningsUSD,
                amountCrypto: winningsCrypto,
                cryptoType: bet.cryptoType,
                txHash: `payout-${uuidv4()}`
            });
            await transaction.save({ session });

            await session.commitTransaction();

            this.io.emit('player:cashout', {
                username: user.username,
                cashoutMultiplier,
                winningsUSD
            });

            logger.info(`User ${userId} cashed out at ${cashoutMultiplier}x for $${winningsUSD}`);
            
            await redis.hdel(ACTIVE_BETS_KEY, userId.toString());

            return { cashoutMultiplier, winningsUSD };

        } catch (error) {
            await session.abortTransaction();
            logger.error(`Cashout failed for user ${userId}: ${error.message}`);
            throw error;
        } finally {
            session.endSession();
        }
    }

    async resolveLosingBets(currentRoundId) {
        try {
            await Bet.updateMany(
                { gameRound: currentRoundId, status: 'placed' },
                { $set: { status: 'lost' } }
            );
            logger.info(`Resolved losing bets for round #${currentRoundId}`);
        } catch (error) {
            logger.error(`Error resolving losing bets: ${error.message}`);
        }
    }

    async getRoundHistory() {
        return GameRound.find({ status: 'crashed' }).sort({ createdAt: -1 }).limit(50).lean();
    }
}

module.exports = GameService;
