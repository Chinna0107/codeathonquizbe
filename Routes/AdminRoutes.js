const express = require('express');
const pool = require('../database');
const adminAuth = require('../middleware/Admin');
const router = express.Router();

const normalizeText = (v) =>
  (v ?? '').toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Create quiz
router.post('/create-quiz', adminAuth, async (req, res) => {
  const { title, description, timer, questions } = req.body;

  if (!title || !questions || questions.length === 0) {
    return res.status(400).json({ error: 'Title and questions are required' });
  }

  try {
    const quizKeyId =
      title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') +
      '-' + Date.now();

    const quizResult = await pool.query(
      'INSERT INTO quizzes (title, description, timer, quiz_key_id, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, quiz_key_id',
      [title, description, timer || null, quizKeyId, req.user.id]
    );

    const quizId = quizResult.rows[0].id;

    for (const q of questions) {
      const questionText = normalizeText(q.question ?? q.question_text);
      const questionResult = await pool.query(
        'INSERT INTO questions (quiz_id, question_text) VALUES ($1, $2) RETURNING id',
        [quizId, questionText]
      );

      const questionId = questionResult.rows[0].id;

      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const optionText = normalizeText(opt?.option_text ?? opt);
        await pool.query(
          'INSERT INTO options (question_id, option_text, is_correct) VALUES ($1, $2, $3)',
          [questionId, optionText, i === (q.correctAnswer ?? q.correct_option)]
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

// Get quiz by id (for editing)
router.get('/quiz/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const quizResult = await pool.query('SELECT * FROM quizzes WHERE id = $1', [id]);
    if (quizResult.rows.length === 0) return res.status(404).json({ error: 'Quiz not found' });

    const questionsResult = await pool.query('SELECT * FROM questions WHERE quiz_id = $1 ORDER BY id', [id]);
    const questions = [];
    for (const q of questionsResult.rows) {
      const optionsResult = await pool.query('SELECT * FROM options WHERE question_id = $1 ORDER BY id', [q.id]);
      const correctIndex = optionsResult.rows.findIndex(o => o.is_correct);
      questions.push({
        id: q.id,
        question_text: q.question_text,
        options: optionsResult.rows.map(o => ({ option_text: o.option_text })),
        correct_option: correctIndex >= 0 ? correctIndex : 0
      });
    }
    res.json({ ...quizResult.rows[0], questions });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz' });
  }
});

// Edit quiz
router.put('/quiz/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  const { title, description, timer, questions } = req.body;

  if (!title || !questions || questions.length === 0) {
    return res.status(400).json({ error: 'Title and questions are required' });
  }

  try {
    await pool.query(
      'UPDATE quizzes SET title = $1, description = $2, timer = $3 WHERE id = $4',
      [title, description, timer || null, id]
    );

    await pool.query('DELETE FROM questions WHERE quiz_id = $1', [id]);

    for (const q of questions) {
      const questionText = normalizeText(q.question_text ?? q.question);
      const questionResult = await pool.query(
        'INSERT INTO questions (quiz_id, question_text) VALUES ($1, $2) RETURNING id',
        [id, questionText]
      );
      const questionId = questionResult.rows[0].id;
      for (let i = 0; i < q.options.length; i++) {
        const opt = q.options[i];
        const optionText = normalizeText(opt?.option_text ?? opt);
        await pool.query(
          'INSERT INTO options (question_id, option_text, is_correct) VALUES ($1, $2, $3)',
          [questionId, optionText, i === (q.correct_option ?? q.correctAnswer)]
        );
      }
    }

    res.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

module.exports = router;
