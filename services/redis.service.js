const Redis = require('ioredis');
const logger = require('../utils/logger');

// Connection options to ensure stability on cloud platforms
const redisOptions = {
    // Upstash and other cloud providers use TLS
    tls: {
        rejectUnauthorized: false
    },
    keepAlive: 1000 * 60, 
};

const redisClient = new Redis(process.env.REDIS_URI, redisOptions);

redisClient.on('connect', () => {
    logger.info('Redis connected...');
});

redisClient.on('error', (err) => {
    logger.error(`Redis Connection Error: ${err.message}`);
});

module.exports = redisClient;