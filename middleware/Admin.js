const jwt = require('jsonwebtoken');
const pool = require('../database');
require('dotenv').config();

const adminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '❌ No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify admin still exists and is admin
    const userQuery = await pool.query(
      "SELECT id, email, is_admin FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "👻 User no longer exists" });
    }

    const user = userQuery.rows[0];

    if (!user.is_admin) {
      return res.status(403).json({ message: '🚫 Access denied. Admins only.' });
    }

    req.user = user; // attach fresh user data to request
    next();

  } catch (error) {
    return res.status(401).json({ message: '❌ Invalid or expired token' });
  }
};

module.exports = adminAuth;
