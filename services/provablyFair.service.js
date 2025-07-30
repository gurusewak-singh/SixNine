const crypto = require('crypto');

const MAX_CRASH_MULTIPLIER = 120; // Max multiplier
const HOUSE_EDGE_PERCENT = 1; // 1% house edge

class ProvablyFairService {
    calculateCrashMultiplier(serverSeed, roundId) {
    
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(roundId);
        const hash = hmac.digest('hex');

        const hashInt = parseInt(hash.substring(0, 8), 16);

        const e = 2 ** 32;
        const crashPoint = Math.floor((e * (100 - HOUSE_EDGE_PERCENT)) / (e - hashInt)) / 100;
        
        const multiplier = Math.max(1.00, Math.min(crashPoint, MAX_CRASH_MULTIPLIER));

        return parseFloat(multiplier.toFixed(2));
    }
}

module.exports = new ProvablyFairService();