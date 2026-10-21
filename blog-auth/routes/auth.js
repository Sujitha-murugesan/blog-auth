const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Blog = require('../models/Blog');
const auth = require('../middleware/auth');
const { setAuthCookie, clearAuthCookie } = require('../utils/token');
const { passwordIssue } = require('../utils/password');

const router = express.Router();

// Coerce to string so objects like {"$ne": ""} can't be injected into queries
const str = (v) => (typeof v === 'string' ? v : '');

// Used to keep login timing similar whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/* ---------------- Register / Login / Logout ---------------- */

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const name = str(req.body.name).trim();
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);

    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required.' });
    const issue = passwordIssue(password);
    if (issue) return res.status(400).json({ message: issue });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account with this email already exists.' });

    const user = await User.create({ name, email, password, lastLoginAt: new Date() });
    setAuthCookie(res, user);
    res.status(201).json({ message: 'Registration successful.', user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const email = str(req.body.email).trim().toLowerCase();
    const password = str(req.body.password);
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const user = await User.findOne({ email }).select('+password');
    const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ message: 'Invalid email or password.' });

    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
    setAuthCookie(res, user);
    res.json({ message: 'Login successful.', user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout  - clears the cookie on this browser
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out.' });
});

// POST /api/auth/logout-all  (protected) - invalidates every session on every device
router.post('/logout-all', auth, async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    clearAuthCookie(res);
    res.json({ message: 'Signed out on all devices.' });
  } catch (err) {
    next(err);
  }
});

/* ---------------------- Current user / profile ---------------------- */

// GET /api/auth/me  (protected) - used by the frontend to verify the session
router.get('/me', auth, async (req, res, next) => {
  try {
    const posts = await Blog.countDocuments({ author: req.user._id });
    res.json({ user: req.user.toPublic(), stats: { posts } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile  (protected) - update name and bio
router.put('/profile', auth, async (req, res, next) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = str(req.body.name).trim();
    if (req.body.bio !== undefined) update.bio = str(req.body.bio).trim();
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to update.' });

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true });
    res.json({ message: 'Profile updated.', user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password  (protected) - change password, signs out other devices
router.put('/password', auth, async (req, res, next) => {
  try {
    const current = str(req.body.currentPassword);
    const next_ = str(req.body.newPassword);
    if (!current || !next_) return res.status(400).json({ message: 'Current and new password are required.' });

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(current))) return res.status(400).json({ message: 'Current password is incorrect.' });
    const issue = passwordIssue(next_);
    if (issue) return res.status(400).json({ message: issue });
    if (current === next_) return res.status(400).json({ message: 'New password must be different from the current one.' });

    user.password = next_;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidates all existing sessions
    await user.save();
    setAuthCookie(res, user); // keep THIS browser logged in with a fresh token
    res.json({ message: 'Password changed. Other devices have been signed out.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/account  (protected) - deletes the user and all their blogs
router.delete('/account', auth, async (req, res, next) => {
  try {
    const password = str(req.body.password);
    const user = await User.findById(req.user._id).select('+password');
    if (!password || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: 'Password is incorrect.' });
    }
    await Blog.deleteMany({ author: user._id });
    await user.deleteOne();
    clearAuthCookie(res);
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
