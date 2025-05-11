const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, 'public'))); 

//  MySQL connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL database');
  }
});

//  uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

//  Turnstile verification
async function verifyTurnstile(token) {
  try {
    const formData = new URLSearchParams();
    formData.append("secret", TURNSTILE_SECRET_KEY);
    formData.append("response", token);

    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.success;
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
}


// Register
app.post('/register', async (req, res) => {
  const { name, email, password, role, turnstileToken } = req.body;

  const isHuman = await verifyTurnstile(turnstileToken);
  if (!isHuman) return res.status(403).json({ message: 'Captcha verification failed.' });

  if (!email.endsWith("@my.northampton.ac.uk")) {
    return res.status(400).json({ message: "Only @my.northampton.ac.uk emails are allowed." });
  }

  if (!['student', 'professor'].includes(role)) {
    return res.status(400).json({ message: "Invalid role." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const table = role === 'professor' ? 'professors' : 'students';
    const sql = `INSERT INTO ${table} (name, email, password) VALUES (?, ?, ?)`;

    db.query(sql, [name, email, hashedPassword], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: `${role} registered successfully` });
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password, turnstileToken } = req.body;

  const isHuman = await verifyTurnstile(turnstileToken);
  if (!isHuman) return res.status(403).json({ message: 'Captcha verification failed.' });

  if (!email.endsWith("@my.northampton.ac.uk")) {
    return res.status(401).json({ message: "Unauthorized email domain." });
  }

  const checkProfessor = () => {
    const sql = 'SELECT * FROM professors WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      if (results.length > 0) {
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: 'Invalid password' });

        const token = jwt.sign({ id: user.id, role: 'professor' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        return res.json({ message: 'Login successful', token, role: 'professor', name: user.name, email: user.email });
      }

      checkStudent();
    });
  };

  const checkStudent = () => {
    const sql = 'SELECT * FROM students WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(401).json({ message: 'User not found' });

      const user = results[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ message: 'Invalid password' });

      const token = jwt.sign({ id: user.id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      return res.json({ message: 'Login successful', token, role: 'student', name: user.name, email: user.email });
    });
  };

  checkProfessor();
});

//  Search videos
app.get('/search', (req, res) => {
  const term = req.query.q;
  if (!term) return res.status(400).json({ message: "Search term required." });

  db.query("SELECT * FROM videos WHERE title LIKE ?", [`%${term}%`], (err, results) => {
    if (err) return res.status(500).json({ error: "Search failed." });
    res.json(results);
  });
});

// Upload video
app.post('/upload', upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'videoFile', maxCount: 1 }
]), (req, res) => {
  const { title, type, videoLink, professorEmail } = req.body;
  const thumbnail = req.files['thumbnail']?.[0];
  const video = req.files['videoFile']?.[0];

  if (!title || !type || !thumbnail || (type === 'link' && !videoLink) || (type === 'file' && !video)) {
    return res.status(400).json({ message: 'Missing fields.' });
  }

  const videoUrl = type === 'link' ? videoLink : `/uploads/${video.filename}`;
  const thumbnailUrl = `/uploads/${thumbnail.filename}`;

  db.query("SELECT id FROM professors WHERE email = ?", [professorEmail], (err, result) => {
    if (err || result.length === 0) return res.status(500).json({ message: "Professor not found." });

    const professorId = result[0].id;
    db.query(
      "INSERT INTO videos (title, description, professor_id, video_url, thumbnail_url) VALUES (?, ?, ?, ?, ?)",
      [title, "", professorId, videoUrl, thumbnailUrl],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "✅ Video uploaded successfully!" });
      }
    );
  });
});

//  Get all videos
app.get('/videos', (req, res) => {
  const sql = `
    SELECT videos.*, professors.name AS professor_name, professors.email AS professor_email
    FROM videos
    JOIN professors ON videos.professor_id = professors.id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Error fetching videos." });
    res.json(results);
  });
});

//  Delete video
app.delete('/videos/:id', (req, res) => {
  const { id } = req.params;
  const professorEmail = req.query.professorEmail;

  if (!professorEmail) return res.status(400).json({ message: "Email is required." });

  db.query("SELECT id FROM professors WHERE email = ?", [professorEmail], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ message: "Professor not found." });

    const professorId = results[0].id;

    db.query("DELETE FROM videos WHERE id = ? AND professor_id = ?", [id, professorId], (err, result) => {
      if (err) return res.status(500).json({ message: "Error deleting video." });
      if (result.affectedRows === 0) return res.status(403).json({ message: "Unauthorized delete." });

      res.json({ message: "✅ Video deleted successfully." });
    });
  });
});

// Upload profile picture
app.post('/upload-profile-picture', upload.single('profilePicture'), (req, res) => {
  const email = req.body.email;
  const file = req.file;

  if (!email || !file) {
    return res.status(400).json({ message: "Missing email or file." });
  }

  const filePath = `/uploads/${file.filename}`;
  const sql = "UPDATE professors SET profile_picture = ? WHERE email = ?";

  db.query(sql, [filePath, email], (err) => {
    if (err) {
      console.error("❌ DB Error:", err);
      return res.status(500).json({ message: "Database update failed." });
    }

    res.json({ message: "✅ Profile picture updated!", profile_picture: filePath });
  });
});

// Get professor profile info
app.get('/professor-profile', (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ message: "Email is required." });

  const sql = "SELECT name, email, profile_picture FROM professors WHERE email = ?";
  db.query(sql, [email], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ message: "Error fetching profile." });
    }

    res.json(results[0]);
  });
});

//  Get all professors
app.get('/all-professors', (req, res) => {
  const sql = "SELECT name, email, profile_picture FROM professors";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching professors:", err);
      return res.status(500).json({ message: "Server error." });
    }
    res.json(results);
  });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
