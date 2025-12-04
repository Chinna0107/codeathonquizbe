const express = require('express');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database');
require('dotenv').config();
const router = express.Router();

// Generate random OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// Send OTP endpoint
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  
  try {
    await pool.query(
      'INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );
    
    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      html: `<h2>Your OTP Code</h2><p>Your verification code is: <strong>${otp}</strong></p><p>This code will expire in 5 minutes.</p>`
    });
    
    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > NOW() AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    await pool.query(
      'UPDATE otps SET verified = TRUE WHERE id = $1',
      [result.rows[0].id]
    );
    
    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Create account endpoint
router.post('/create-account', async (req, res) => {
  const { email, name, password, confirmPassword } = req.body;
  console.log('Create account request:', { email, name });
  
  if (!email || !name || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  
  try {
    console.log('Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('Database connection OK');
    
    const otpCheck = await pool.query(
      'SELECT * FROM otps WHERE email = $1 AND verified = TRUE ORDER BY created_at DESC LIMIT 1',
      [email]
    );
    
    console.log('OTP check result:', otpCheck.rows.length);
    
    if (otpCheck.rows.length === 0) {
      console.log('No verified OTP found for email:', email);
      // Temporarily skip OTP check for testing
      // return res.status(400).json({ error: 'Please verify OTP first' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed, inserting user...');
    
    const insertResult = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hashedPassword]
    );
    
    console.log('User inserted with ID:', insertResult.rows[0].id);
    res.json({ message: 'Account created successfully' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Account creation failed' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token: user.is_admin ? token : token,
      admintoken: user.is_admin ? token : null,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Reset password - send OTP
router.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const userCheck = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Email not found' });
    }
    
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    await pool.query(
      'INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)',
      [email, otp, expiresAt]
    );
    
    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      html: `<h2>Password Reset</h2><p>Your verification code is: <strong>${otp}</strong></p><p>This code will expire in 5 minutes.</p>`
    });
    
    res.json({ message: 'Reset OTP sent successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to send reset OTP' });
  }
});

// Update password after OTP verification
router.post('/update-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    const otpCheck = await pool.query(
      'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND expires_at > NOW() AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );
    
    if (otpCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password = $1 WHERE email = $2',
      [hashedPassword, email]
    );
    
    await pool.query(
      'UPDATE otps SET verified = TRUE WHERE id = $1',
      [otpCheck.rows[0].id]
    );
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Password update failed' });
  }
});

// Get all quizzes
router.get('/quizzes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT id, title, description, quiz_key_id, created_at FROM quizzes ORDER BY created_at DESC'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

// Get quiz by title


// Get quiz by quiz_key_id
router.get('/quiz/:id', async (req, res) => {
  const { id } = req.params;
  console.log('Looking for quiz with quiz_key_id:', id);
  
  try {
    const quizResult = await pool.query(
      'SELECT * FROM quizzes WHERE quiz_key_id = $1',
      [id]
    );
    
    console.log('Quiz query result:', quizResult.rows.length);
    
    if (quizResult.rows.length === 0) {
      // Try to find by ID as fallback
      const fallbackResult = await pool.query(
        'SELECT * FROM quizzes WHERE id = $1',
        [id]
      );
      
      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      
      // Use fallback result
      const quiz = fallbackResult.rows[0];
      const questionsResult = await pool.query(
        'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY id',
        [quiz.id]
      );
      
      const questions = [];
      for (const question of questionsResult.rows) {
        const optionsResult = await pool.query(
          'SELECT * FROM options WHERE question_id = $1 ORDER BY id',
          [question.id]
        );
        
        questions.push({
          ...question,
          options: optionsResult.rows
        });
      }
      
      return res.json({
        ...quiz,
        questions
      });
    }
    
    const questionsResult = await pool.query(
      'SELECT * FROM questions WHERE quiz_key_id = $1 ORDER BY id',
      [id]
    );
    
    const questions = [];
    for (const question of questionsResult.rows) {
      const optionsResult = await pool.query(
        'SELECT * FROM options WHERE question_id = $1 ORDER BY id',
        [question.id]
      );
      
      questions.push({
        ...question,
        options: optionsResult.rows
      });
    }
    
    res.json({
      ...quizResult.rows[0],
      questions
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
});

// Submit quiz
router.post('/quiz/:id/submit', async (req, res) => {
  const { id } = req.params;
  const { answers, userId } = req.body;
  console.log('Submitting quiz with id:', id);
  
  try {
    // Get quiz by quiz_key_id first
    let quizResult = await pool.query(
      'SELECT id FROM quizzes WHERE quiz_key_id = $1',
      [id]
    );
    
    let quizId;
    let questionsResult;
    
    if (quizResult.rows.length === 0) {
      // Try fallback with numeric ID
      quizResult = await pool.query(
        'SELECT id FROM quizzes WHERE id = $1',
        [id]
      );
      
      if (quizResult.rows.length === 0) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      
      quizId = quizResult.rows[0].id;
      
      // Get questions by quiz_id for fallback
      questionsResult = await pool.query(
        'SELECT * FROM questions WHERE quiz_id = $1 ORDER BY id',
        [quizId]
      );
    } else {
      quizId = quizResult.rows[0].id;
      
      // Get questions by quiz_key_id
      questionsResult = await pool.query(
        'SELECT * FROM questions WHERE quiz_key_id = $1 ORDER BY id',
        [id]
      );
    }
    
    let score = 0;
    const totalQuestions = questionsResult.rows.length;
    
    for (let i = 0; i < questionsResult.rows.length; i++) {
      const question = questionsResult.rows[i];
      const userAnswer = answers[i];
      
      if (userAnswer !== undefined) {
        const optionsResult = await pool.query(
          'SELECT * FROM options WHERE question_id = $1 ORDER BY id',
          [question.id]
        );
        
        if (optionsResult.rows[userAnswer] && optionsResult.rows[userAnswer].is_correct) {
          score++;
        }
      }
    }
    
    const percentage = Math.round((score / totalQuestions) * 100);
    
    // Store result in database
    if (userId) {
      await pool.query(
        'INSERT INTO quiz_results (user_id, quiz_id, score, total_questions, percentage) VALUES ($1, $2, $3, $4, $5)',
        [userId, quizId, score, totalQuestions, percentage]
      );
    }
    
    res.json({ 
      message: 'Quiz submitted successfully',
      score,
      totalQuestions,
      percentage
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// Get user's own quiz results
router.get('/results', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(`
      SELECT 
        qr.id,
        q.title as quiz_title,
        qr.score,
        qr.total_questions,
        qr.percentage,
        qr.completed_at
      FROM quiz_results qr
      JOIN quizzes q ON qr.quiz_id = q.id
      WHERE qr.user_id = $1
      ORDER BY qr.completed_at DESC
    `, [decoded.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Get all quiz results for admin
router.get('/all-results', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        qr.id,
        u.name,
        u.email,
        q.title as quiz_title,
        qr.score,
        qr.total_questions,
        qr.percentage,
        qr.completed_at
      FROM quiz_results qr
      JOIN users u ON qr.user_id = u.id
      JOIN quizzes q ON qr.quiz_id = q.id
      ORDER BY qr.completed_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [quizzes, users, submissions] = await Promise.all([
      pool.query('SELECT COUNT(DISTINCT title) FROM quizzes'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_admin = false'),
      pool.query('SELECT COUNT(*) FROM quiz_results')
    ]);
    
    res.json({
      totalQuizzes: parseInt(quizzes.rows[0].count),
      totalUsers: parseInt(users.rows[0].count),
      totalSubmissions: parseInt(submissions.rows[0].count)
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  const { name, email } = req.body;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3',
      [name, email, decoded.id]
    );
    
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user statistics (average score and quiz count)
router.get('/user-stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(`
      SELECT 
        COUNT(*) as quizzes_attempted,
        ROUND(AVG(percentage), 2) as average_score
      FROM quiz_results 
      WHERE user_id = $1
    `, [decoded.id]);
    
    const stats = result.rows[0];
    
    res.json({
      quizzesAttempted: parseInt(stats.quizzes_attempted),
      averageScore: parseFloat(stats.average_score) || 0
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

module.exports = router;