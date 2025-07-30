const axios = require('axios');
const logger = require('../utils/logger');

const CRYPTOCOMPARE_API_URL = 'https://min-api.cryptocompare.com/data/pricemulti';

class CryptoService {
    async getPrices() {
        // --- THE FIX: Look for the CORRECT environment variable ---
        if (!process.env.CRYPTOCOMPARE_API_KEY) {
            throw new Error('CRYPTOCOMPARE_API_KEY is missing.');
        }

        const params = {
            fsyms: 'BTC,ETH',
            tsyms: 'USD',
            // Use the correct variable in the request
            api_key: process.env.CRYPTOCOMPARE_API_KEY
        };

        try {
            const response = await axios.get(CRYPTOCOMPARE_API_URL, { params });

            if (response.data.Response === 'Error') {
                throw new Error(response.data.Message);
            }

            const prices = {
                BTC: response.data.BTC.USD,
                ETH: response.data.ETH.USD,
            };
            
            logger.info(`Fetched new crypto prices from CryptoCompare: BTC=$${prices.BTC}, ETH=$${prices.ETH}`);
            return prices;
        } catch (error) {
            const errorMessage = error.response ? `Request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
            logger.error(`Error fetching crypto prices from CryptoCompare: ${errorMessage}`);
            throw new Error('Could not fetch crypto prices from CryptoCompare.');
        }
    }
}

module.exports = new CryptoService();