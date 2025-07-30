const axios = require('axios');
const logger = require('../utils/logger');

// Use the Pro API endpoint
const COINGECKO_API_BASE_URL = 'https://pro-api.coingecko.com/api/v3/simple/price';
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

        // Check if the API key is provided in environment variables
        if (!process.env.COINGECKO_API_KEY) {
            logger.error('COINGECKO_API_KEY is not set in environment variables. Cannot fetch prices.');
            if (this.priceCache.data) return this.priceCache.data;
            throw new Error('CoinGecko API key is missing.');
        }

        // ====================================================================
        // THE FIX: Change the API key parameter name
        //
        // Incorrect: x_cg_demo_api_key
        // Correct:   x_cg_pro_api_key
        //
        const fullUrl = `${COINGECKO_API_BASE_URL}?ids=bitcoin,ethereum&vs_currencies=usd&x_cg_pro_api_key=${process.env.COINGECKO_API_KEY}`;
        // ====================================================================

        try {
            const response = await axios.get(fullUrl);
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
            // Provide more detailed error logging
            const errorMessage = error.response ? `Request failed with status code ${error.response.status}` : error.message;
            logger.error(`Error fetching crypto prices from CoinGecko: ${errorMessage}`);
            
            if (this.priceCache.data) return this.priceCache.data;
            throw new Error('Could not fetch crypto prices.');
        }
    }
}

// Export a singleton instance
module.exports = new CryptoService();