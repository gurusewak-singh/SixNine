const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const GameService = require('../services/game.service');

const injectGameService = (req, res, next) => {
   
    const io = req.app.get('socketio');
    if (!req.app.get('gameService')) {
        req.app.set('gameService', new GameService(io));
    }
    req.gameService = req.app.get('gameService');
    next();
};

router.post('/bet', injectGameService, gameController.placeBet);
router.post('/cashout', injectGameService, gameController.cashout); 
router.get('/wallet', gameController.getWallet);
router.get('/history', injectGameService, gameController.getHistory);

module.exports = router;