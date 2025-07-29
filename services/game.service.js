const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const provablyFairService = require('./provablyFair.service');
const cryptoService = require('./crypto.service');

const User = require('../models/user.model');
const GameRound = require('../models/gameRound.model');
const Bet = require('../models/bet.model');
const Transaction = require('../models/transaction.model');

const BETTING_PHASE_DURATION = 4000; // 4 seconds
const PENDING_PHASE_DURATION = 6000; // 6 seconds
const MULTIPLIER_INCREMENT_INTERVAL = 100; // 100ms

class GameService {
    constructor(io) {
        this.io = io;
        this.state = {
            status: 'crashed', // 'pending', 'running', 'crashed'
            currentRound: null,
            currentMultiplier: 1.00,
            startTime: null,
            crashMultiplier: null,
            multiplierInterval: null,
        };
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
        this.state.status = 'pending';
        const roundId = uuidv4();
        const serverSeed = process.env.SERVER_SEED;
        const crashMultiplier = provablyFairService.calculateCrashMultiplier(serverSeed, roundId);

        const newRound = new GameRound({
            roundId,
            serverSeed, // In a real system, you'd use a chain of seeds
            crashMultiplier,
        });
        await newRound.save();

        this.state.currentRound = newRound;
        this.state.crashMultiplier = crashMultiplier;
        this.state.currentMultiplier = 1.00;
        
        logger.info(`New round #${newRound._id} created. Crash at ${crashMultiplier}x. Betting is open.`);

        this.io.emit('game:start', {
            roundId: newRound.roundId,
            startTime: Date.now() + BETTING_PHASE_DURATION,
        });
    }

    runGame() {
        this.state.status = 'running';
        this.state.startTime = Date.now();
        logger.info(`Round #${this.state.currentRound._id} is now running.`);

        this.state.multiplierInterval = setInterval(() => {
            const elapsedTime = Date.now() - this.state.startTime;
            // Exponential growth factor
            const growthFactor = 0.00006;
            this.state.currentMultiplier = parseFloat(Math.pow(Math.E, growthFactor * elapsedTime).toFixed(2));

            if (this.state.currentMultiplier >= this.state.crashMultiplier) {
                this.endRound();
            } else {
                this.io.emit('game:multiplier', { multiplier: this.state.currentMultiplier });
            }
        }, MULTIPLIER_INCREMENT_INTERVAL);
    }

    async endRound() {
        if (this.state.multiplierInterval) {
            clearInterval(this.state.multiplierInterval);
            this.state.multiplierInterval = null;
        }

        this.state.status = 'crashed';
        logger.info(`Round #${this.state.currentRound._id} CRASHED at ${this.state.crashMultiplier}x`);
        
        this.io.emit('game:crash', { multiplier: this.state.crashMultiplier });

        await GameRound.findByIdAndUpdate(this.state.currentRound._id, { status: 'crashed' });
        await this.resolveLosingBets();

        // Start next round after a delay
        setTimeout(() => this.startGameLoop(), PENDING_PHASE_DURATION);
    }

    async placeBet(userId, amountUSD, cryptoType) {
        if (this.state.status !== 'pending') {
            throw new Error('Betting is closed for this round.');
        }
        if (amountUSD < 1) {
            throw new Error('Minimum bet is $1.');
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const user = await User.findById(userId).session(session);
            if (user.wallet.usd < amountUSD) {
                throw new Error('Insufficient USD balance.');
            }

            const prices = await cryptoService.getPrices();
            const cryptoPrice = prices[cryptoType];
            if (!cryptoPrice) throw new Error('Invalid crypto type.');
            const amountCrypto = parseFloat((amountUSD / cryptoPrice).toFixed(8));

            user.wallet.usd -= amountUSD;
            user.wallet[cryptoType.toLowerCase()] += amountCrypto;
            await user.save({ session });

            const bet = new Bet({
                user: userId,
                gameRound: this.state.currentRound._id,
                amountUSD,
                amountCrypto,
                cryptoType,
            });
            await bet.save({ session });

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

    async cashout(userId) {
        if (this.state.status !== 'running') {
            throw new Error('Cannot cash out. Game is not running.');
        }
        
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const bet = await Bet.findOne({
                user: userId,
                gameRound: this.state.currentRound._id,
                status: 'placed'
            }).session(session);

            if (!bet) {
                throw new Error('No active bet found for this round.');
            }

            const cashoutMultiplier = this.state.currentMultiplier;
            const winningsCrypto = bet.amountCrypto * cashoutMultiplier;
            
            const prices = await cryptoService.getPrices();
            const cryptoPrice = prices[bet.cryptoType];
            const winningsUSD = parseFloat((winningsCrypto * cryptoPrice).toFixed(2));

            const user = await User.findById(userId).session(session);
            user.wallet[bet.cryptoType.toLowerCase()] -= bet.amountCrypto; // Remove original stake
            user.wallet.usd += winningsUSD; // Add winnings in USD
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
            return { cashoutMultiplier, winningsUSD };

        } catch (error) {
            await session.abortTransaction();
            logger.error(`Cashout failed for user ${userId}: ${error.message}`);
            throw error;
        } finally {
            session.endSession();
        }
    }

    async resolveLosingBets() {
        try {
            await Bet.updateMany(
                { gameRound: this.state.currentRound._id, status: 'placed' },
                { $set: { status: 'lost' } }
            );
            logger.info(`Resolved losing bets for round #${this.state.currentRound._id}`);
        } catch (error) {
            logger.error(`Error resolving losing bets: ${error.message}`);
        }
    }

    async getRoundHistory() {
        return GameRound.find({ status: 'crashed' }).sort({ createdAt: -1 }).limit(50).lean();
    }
}

module.exports = GameService;