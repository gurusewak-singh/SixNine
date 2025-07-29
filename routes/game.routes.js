const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const GameService = require('../services/game.service');

// Middleware to inject gameService into the request object
// This is a simple way to handle dependency injection without a full framework
const injectGameService = (req, res, next) => {
    // The gameService instance is created once in server.js
    // We retrieve it from the app instance.
    const io = req.app.get('socketio');
    if (!req.app.get('gameService')) {
        req.app.set('gameService', new GameService(io));
    }
    req.gameService = req.app.get('gameService');
    next();
};

router.post('/bet', injectGameService, gameController.placeBet);
router.post('/cashout', injectGameService, gameController.cashout); // Can be done via HTTP or WebSocket
router.get('/wallet', gameController.getWallet);
router.get('/history', injectGameService, gameController.getHistory);

module.exports = router;