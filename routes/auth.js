const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const turso = require('../db');
const authenticate = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'mockbird-secret-key';

// POST /auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'email, password, and name are required' });
        }

        // Check existing user
        const existing = await turso.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const now = new Date().toISOString();

        await turso.execute(
            'INSERT INTO users (user_id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, email, passwordHash, name, now, now]
        );

        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            token,
            user: { userId, email, name, subscriptionTier: 'free' }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Failed to register' });
    }
});

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const result = await turso.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            token,
            user: {
                userId: user.user_id,
                email: user.email,
                name: user.name,
                subscriptionTier: user.subscription_tier
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

// GET /auth/me  (protected)
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await turso.execute(
            'SELECT user_id, email, name, subscription_tier, created_at FROM users WHERE user_id = ?',
            [req.user.userId]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({
            userId: user.user_id,
            email: user.email,
            name: user.name,
            subscriptionTier: user.subscription_tier,
            createdAt: user.created_at
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

module.exports = router;
