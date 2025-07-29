const axios = require('axios');
const logger = require('../utils/logger');

const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';
const CACHE_TTL = 10000; // 10 seconds

class CryptoService {
    constructor() {
        this.priceCache = {
            data: null,
            lastFetch: 0,
        };
    }

    async getPrices() {
        const now = Date.now();
        if (this.priceCache.data && (now - this.priceCache.lastFetch < CACHE_TTL)) {
            return this.priceCache.data;
        }

        try {
            const response = await axios.get(COINGECKO_API_URL);
            const prices = {
                BTC: response.data.bitcoin.usd,
                ETH: response.data.ethereum.usd,
            };
            this.priceCache = {
                data: prices,
                lastFetch: now,
            };
            logger.info(`Fetched new crypto prices: BTC=$${prices.BTC}, ETH=$${prices.ETH}`);
            return prices;
        } catch (error) {
            logger.error(`Error fetching crypto prices from CoinGecko: ${error.message}`);
            // If API fails, return cached data if available, otherwise throw
            if (this.priceCache.data) return this.priceCache.data;
            throw new Error('Could not fetch crypto prices.');
        }
    }
}

// Export a singleton instance
module.exports = new CryptoService();