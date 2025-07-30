const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisClient = new Redis(process.env.REDIS_URI);

redisClient.on('connect', () => {
    logger.info('Redis connected...');
});

redisClient.on('error', (err) => {
    logger.error(`Redis Connection Error: ${err.message}`);
});

module.exports = redisClient;