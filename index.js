require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./Routes/UserRoutes');
const adminRoutes = require('./Routes/AdminRoutes');

const app = express();

app.use(cors());
app.use(bodyParser.json());


app.use(
  cors({
    origin: [
      // Local
      "http://localhost:5173",
      "http://localhost:3000",

      // Delivery frontend
      // "https://quiz-app-swart-iota.vercel.app",
      "https://quiz-app-orcin-kappa.vercel.app",
      // "https://quiz-app-git-main-chinna.vercel.app",

      // ChinnaMart frontend
    //   "https://chinnamart.vercel.app",
    //   "https://chinnamart.vercel.app/",
    //   "https://chinnamart-git-main-chinna0107s-projects.vercel.app"
    ],
    credentials: true,
  })
);


app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.get('/', (req, res) => {
  res.send('Quiz Backend API');
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

module.exports = app;
