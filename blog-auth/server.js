require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const sameOrigin = require('./middleware/sameOrigin');

const isProd = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET || '';
if (!secret || secret.startsWith('change_this')) {
  const msg = 'JWT_SECRET is missing or still the placeholder. Set a long random value in .env';
  if (isProd) { console.error(msg); process.exit(1); }
  console.warn(`WARNING: ${msg}`);
  if (!secret) process.exit(1);
}

const app = express();
if (isProd) app.set('trust proxy', 1); // when behind a reverse proxy / hosting platform

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', sameOrigin);

// Brute-force protection: strict on login (failed attempts only), looser on the rest of /api/auth
// DISABLE_RATE_LIMIT=true is honoured only outside production (handy for running the test scripts repeatedly)
const limiterOpts = { standardHeaders: true, legacyHeaders: false, skip: () => !isProd && process.env.DISABLE_RATE_LIMIT === 'true' };
app.use('/api/auth/login', rateLimit({ ...limiterOpts, windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true,
  message: { message: 'Too many failed login attempts. Please try again in 15 minutes.' } }));
app.use('/api/auth', rateLimit({ ...limiterOpts, windowMs: 15 * 60 * 1000, max: 100,
  message: { message: 'Too many requests. Please try again later.' } }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/blogs', require('./routes/blogs'));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON in request body.' });
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(' ') });
  }
  if (err.code === 11000) return res.status(409).json({ message: 'Duplicate value: that record already exists.' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong.' });
});

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    console.error('Check MONGODB_URI in .env and that MongoDB is running.');
    process.exit(1);
  });
