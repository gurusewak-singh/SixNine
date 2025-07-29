const logger = require('../utils/logger');
const User = require('../models/user.model');

// The function now accepts 'app' as a third argument
function socketHandler(io, gameService, app) {
    // Attach gameService and io to the app instance so routes can access them
    // This is the corrected, reliable way to do it.
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
            socket.join(userId); // Join a room for user-specific notifications

            // Listen for cashout requests from the client
            socket.on('player:cashout:request', async () => {
                try {
                    await gameService.cashout(userId);
                    // The cashout service already emits a global 'player:cashout' event
                    // We can send a specific confirmation back to the user if needed.
                    socket.emit('player:cashout:success', { message: 'Cashout successful!' });
                } catch (error) {
                    logger.error(`WebSocket Cashout Error for ${userId}: ${error.message}`);
                    socket.emit('player:cashout:error', { message: error.message });
                }
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