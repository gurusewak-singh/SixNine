const axios = require('axios');
const logger = require('../utils/logger');

// The new, correct base URL for the CoinDesk Data API
const COINDESK_API_URL = 'https://data-api.coindesk.com/index/cc/v1/latest/tick';

class CryptoService {
    async getPrices() {
        if (!process.env.COINDESK_API_KEY) {
            throw new Error('COINDESK_API_KEY is missing.');
        }

        // Define the parameters for the API call
        const params = {
            // We want prices for Bitcoin and Ethereum against the US Dollar
            instruments: 'BTC-USD,ETH-USD',
        };

        // As per the documentation, using the x-api-key header is a clean and secure method
        const config = {
            params: params, // Axios will append these to the URL
            headers: {
                'x-api-key': process.env.COINDESK_API_KEY
            }
        };

        try {
            const response = await axios.get(COINDESK_API_URL, config);

            // The response format is: { "data": [ { "instrument": "BTC-USD", "price": 60000, ... }, ... ] }
            // We need to parse this array to find the prices for BTC and ETH.
            const prices = {};
            for (const tick of response.data.data) {
                if (tick.instrument === 'BTC-USD') {
                    prices.BTC = tick.price;
                }
                if (tick.instrument === 'ETH-USD') {
                    prices.ETH = tick.price;
                }
            }

            if (!prices.BTC || !prices.ETH) {
                throw new Error('BTC or ETH price not found in CoinDesk response.');
            }
            
            logger.info(`Fetched new crypto prices from CoinDesk: BTC=$${prices.BTC}, ETH=$${prices.ETH}`);
            return prices;
        } catch (error) {
            const errorMessage = error.response ? `Request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}` : error.message;
            logger.error(`Error fetching crypto prices from CoinDesk: ${errorMessage}`);
            throw new Error('Could not fetch crypto prices from CoinDesk.');
        }
    }
}

module.exports = new CryptoService();