require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/user.model');
const connectDB = require('../utils/db');

const seedUsers = async () => {
    await connectDB();

    try {
        await User.deleteMany({});
        console.log('Previous users deleted.');

        const users = [
            { username: 'PlayerOne', wallet: { usd: 1000 } },
            { username: 'CryptoWhale', wallet: { usd: 5000 } },
            { username: 'RiskTaker', wallet: { usd: 250 } },
        ];

        const createdUsers = await User.insertMany(users);
        console.log('Database seeded with 3 users.');
        console.log('Use these IDs for the x-user-id header:');
        createdUsers.forEach(user => {
            console.log(`- Username: ${user.username}, UserID: ${user._id}`);
        });

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        mongoose.connection.close();
    }
};

seedUsers();