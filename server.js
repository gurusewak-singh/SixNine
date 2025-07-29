require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const connectDB = require('./utils/db');
const logger = require('./utils/logger');
const GameService = require('./services/game.service');
const socketHandler = require('./sockets/socket');
const authMiddleware = require('./middleware/auth.middleware');

// Initialize App
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, restrict this to your frontend domain
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve the minimal HTML client

// Connect to Database
connectDB();

// API Routes
app.use('/api', authMiddleware, require('./routes/game.routes'));

// Initialize Services
const gameService = new GameService(io);

// Setup Socket.IO and pass the 'app' instance
// This is the corrected line
socketHandler(io, gameService, app);

// Start Game Loop
gameService.startGameLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Crypto Crash game engine started.`);
});