require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./Routes/UserRoutes');
const adminRoutes = require('./Routes/AdminRoutes');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.send('Quiz Backend API');
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
