const crypto = require('crypto');

const MAX_CRASH_MULTIPLIER = 120; // Max multiplier e.g., 120x
const HOUSE_EDGE_PERCENT = 1; // 1% house edge

class ProvablyFairService {
    calculateCrashMultiplier(serverSeed, roundId) {
        // Create a HMAC hash using the server seed as the key and roundId as the value
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(roundId);
        const hash = hmac.digest('hex');

        // Take the first 8 characters (32 bits) of the hash
        const hashInt = parseInt(hash.substring(0, 8), 16);

        // Calculate the crash point. The formula ensures a distribution
        // that favors lower multipliers, which is typical for crash games.
        // We use an exponential formula to achieve this.
        const e = 2 ** 32;
        const crashPoint = Math.floor((e * (100 - HOUSE_EDGE_PERCENT)) / (e - hashInt)) / 100;
        
        // Clamp the value between 1.00 and the max multiplier
        const multiplier = Math.max(1.00, Math.min(crashPoint, MAX_CRASH_MULTIPLIER));

        return parseFloat(multiplier.toFixed(2));
    }
}

module.exports = new ProvablyFairService();