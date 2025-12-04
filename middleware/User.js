const jwt = require('jsonwebtoken');
const pool = require('../database');
require('dotenv').config();

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userQuery = await pool.query(
      "SELECT id, name, email, is_admin FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = userQuery.rows[0];
    next();
  } catch (error) {
    console.log("JWT Error:", error.message);
    res.status(403).json({ message: "Token invalid or expired" });
  }
}

module.exports = authenticateToken;
