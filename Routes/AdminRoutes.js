const express = require('express');
const pool = require('../database');
const adminAuth = require('../middleware/Admin');
const router = express.Router();

// Create quiz
router.post('/create-quiz', adminAuth, async (req, res) => {
  console.log(" called")
  const { title, description, questions } = req.body;
  
  if (!title || !questions || questions.length === 0) {
    return res.status(400).json({ error: 'Title and questions are required' });
  }
  
  try {
    // Generate unique quiz_key_id
    const quizKeyId = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    
    const quizResult = await pool.query(
      'INSERT INTO quizzes (title, description, quiz_key_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id, quiz_key_id',
      [title, description, quizKeyId, req.user.id]
    );
    
    const quizId = quizResult.rows[0].id;
    
    for (const q of questions) {
      const questionResult = await pool.query(
        'INSERT INTO questions (quiz_id, quiz_key_id, question_text) VALUES ($1, $2, $3) RETURNING id',
        [quizId, quizKeyId, q.question]
      );
      
      const questionId = questionResult.rows[0].id;
      
      for (let i = 0; i < q.options.length; i++) {
        await pool.query(
          'INSERT INTO options (question_id, option_text, is_correct) VALUES ($1, $2, $3)',
          [questionId, q.options[i], i === q.correctAnswer]
        );
      }
    }
    
    res.json({ message: 'Quiz created successfully', quizId });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

// Get all quiz results (admin)
router.get('/results', adminAuth, async (req, res) => {
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

// Get all users (admin)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, is_blocked, created_at FROM users WHERE is_admin = false ORDER BY created_at DESC'
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Block/Unblock user (admin)
router.put('/users/:id/block', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { blocked } = req.body;
  
  try {
    await pool.query(
      'UPDATE users SET is_blocked = $1 WHERE id = $2 AND is_admin = false',
      [blocked, id]
    );
    
    res.json({ message: blocked ? 'User blocked successfully' : 'User unblocked successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Get admin profile
router.get('/profile', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1 AND is_admin = true',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update admin profile
router.put('/profile', adminAuth, async (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  try {
    await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 AND is_admin = true',
      [name, email, req.user.id]
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

module.exports = router;