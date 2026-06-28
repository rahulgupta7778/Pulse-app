const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../config/db');
const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getSecret() {
  return process.env.JWT_SECRET || 'dev-jwt-secret-pulse-companion-fallback-key';
}

function signToken(userId) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: '24h' });
}

let googleClient;
function getGoogleClient() {
  if (!googleClient && process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

// ─── Login ─────────────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.findUser(email);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  // If this was a Google account with no password set yet, set the password on first manual login
  if (user.password === 'GOOGLE_AUTH') {
    const hashed = await bcrypt.hash(password, 10);
    db.updateUserPassword(user.id, hashed);
    user.password = hashed;
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user.id);
  res.json({ token, user: { name: user.name, email: user.email } });
}));

// ─── Reset Password (DOB-based) ────────────────────────────────────────
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, dob, password } = req.body;
  if (!email || !dob || !password) return res.status(400).json({ error: 'Email, date of birth, and new password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const user = db.findUser(email);
  if (!user || user.dob !== dob) return res.status(400).json({ error: 'Invalid email or date of birth' });

  const hashed = await bcrypt.hash(password, 10);
  db.updateUserPassword(user.id, hashed);

  res.json({ message: 'Password reset successful. You can now log in with your new password.' });
}));

// ─── Signup ────────────────────────────────────────────────────────────
router.post('/signup', asyncHandler(async (req, res) => {
  const { name, email, password, dob } = req.body;
  if (!name || !email || !password || !dob) {
    return res.status(400).json({ error: 'Name, email, password, and date of birth are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.findUser(email);
  if (existing) {
    if (existing.password === 'GOOGLE_AUTH') {
      // Transition Google account to manual password and details
      const hashed = await bcrypt.hash(password, 10);
      db.updateUserPassword(existing.id, hashed);
      db.updateUser(existing.id, { name, dob });
      const token = signToken(existing.id);
      return res.json({ token, user: { name, email } });
    }
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), name, email, password: hashed, dob };
  db.createUser(user);

  const token = signToken(user.id);
  res.json({ token, user: { name, email } });
}));

// ─── Google OAuth ──────────────────────────────────────────────────────
router.post('/google', asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  const client = getGoogleClient();
  if (!client) {
    return res.status(500).json({ error: 'Google auth not configured' });
  }

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  const { name, email } = payload;

  if (!email) {
    return res.status(400).json({ error: 'Google account has no email' });
  }

  const user = db.findOrCreateGoogleUser({ name, email });
  const token = signToken(user.id);
  res.json({ token, user: { name: user.name, email: user.email } });
}));

// ─── Get current user ──────────────────────────────────────────────────
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });
  let decoded;
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    decoded = jwt.verify(token, getSecret());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const user = db.findUserById(decoded.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
}));

// ─── Profile update ────────────────────────────────────────────────────
router.put('/profile', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  let decoded;
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    decoded = jwt.verify(token, getSecret());
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { name } = req.body;
  const result = db.updateUser(decoded.userId, { name: name || '' });
  if (!result) return res.status(404).json({ error: 'User not found' });
  res.json({ user: result });
}));

module.exports = router;
