const logger = require('../utils/logger');
const User = require('../models/user.model');

function socketHandler(io, gameService, app) {
    
    app.set('gameService', gameService);
    app.set('socketio', io);

    io.on('connection', async (socket) => {
        const userId = socket.handshake.query.userId;
        if (!userId) {
            logger.warn('Socket connection attempt without userId. Disconnecting.');
            socket.disconnect();
            return;
        }

        try {
            const user = await User.findById(userId);
            if (!user) {
                logger.warn(`Socket connection with invalid userId: ${userId}. Disconnecting.`);
                socket.disconnect();
                return;
            }

            logger.info(`User ${user.username} (${userId}) connected via WebSocket.`);
            socket.join(userId);

            socket.on('player:cashout:request', async () => {
                try {
                    await gameService.cashout(userId);
                    socket.emit('player:cashout:success', { message: 'Cashout successful!' });
                } catch (error) {
                    logger.error(`WebSocket Cashout Error for ${userId}: ${error.message}`);
                    socket.emit('player:cashout:error', { message: error.message });
                }
            });

            
            socket.on('chat:message', (message) => {
                
                if (typeof message !== 'string' || message.trim().length === 0 || message.length > 200) {
                    return; 
                }
                
                io.emit('chat:message', {
                    username: user.username,
                    message: message.trim(), 
                    timestamp: new Date()
                });
            });

            socket.on('disconnect', () => {
                logger.info(`User ${user.username} (${userId}) disconnected.`);
            });

        } catch (error) {
            logger.error(`Error during socket authentication for userId ${userId}: ${error.message}`);
            socket.disconnect();
        }
    });
}

module.exports = socketHandler;