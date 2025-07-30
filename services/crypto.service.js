const axios = require('axios');
const logger = require('../utils/logger');

const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';

class CryptoService {
    async getPrices() {
        if (!process.env.COINGECKO_API_KEY) {
            throw new Error('CoinGecko API key is missing.');
        }

        const url = `${COINGECKO_API_BASE_URL}?ids=bitcoin,ethereum&vs_currencies=usd`;

        const config = {
            headers: {
                'x-cg-demo-api-key': process.env.COINGECKO_API_KEY
            }
        };

        try {
            const response = await axios.get(url, config);
            const prices = {
                BTC: response.data.bitcoin.usd,
                ETH: response.data.ethereum.usd,
            };
            logger.info(`Fetched new crypto prices for the round: BTC=$${prices.BTC}, ETH=$${prices.ETH}`);
            return prices;
        } catch (error) {
            const errorMessage = error.response ? `Request failed with status code ${error.response.status}` : error.message;
            logger.error(`Error fetching crypto prices from CoinGecko: ${errorMessage}`);
            throw new Error('Could not fetch crypto prices from CoinGecko.');
        }
    }
}

module.exports = new CryptoService();