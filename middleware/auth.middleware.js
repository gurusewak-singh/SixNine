const User = require('../models/user.model');
const logger = require('../utils/logger');

// This is a mock authentication middleware. In a real app, you'd use JWTs.
const authMiddleware = async (req, res, next) => {
    const userId = req.header('x-user-id');
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized: Missing x-user-id header' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized: User not found' });
        }
        req.user = user;
        next();
    } catch (error) {
        logger.error(`Auth Error: ${error.message}`);
        res.status(500).json({ message: 'Server error during authentication' });
    }
};

module.exports = authMiddleware;