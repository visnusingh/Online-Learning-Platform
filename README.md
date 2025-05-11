# Online Learning Platform 🎓

An academic full-stack web application that enables **students to access educational content for free** and allows **professors to upload and manage video courses** securely.

Built using Node.js, Express, MySQL, and modern front-end technologies, this project aims to **provide a user-friendly, secure, and accessible online learning environment**.

---

## 🔗 Live Preview

> (Localhost-based for academic use — not deployed publicly)

---

## ✨ Features

- 👨‍🎓 Student and Professor Registration & Login (Role-based access)
- 🔐 Secure Authentication using **JSON Web Tokens (JWT)**
- 🤖 Bot Protection with **Cloudflare Turnstile CAPTCHA**
- 📚 Course Upload (Video file or link) by professors
- 🔎 Course Search and Filtering for students
- 🖼️ Profile picture uploads for professors
- 📂 Dynamic course display with thumbnails
- 🛡️ Manual database schema setup for learning

---

## 🛠️ Tech Stack

**Frontend:**  
- HTML5, CSS3, JavaScript  
- FontAwesome Icons  
- Responsive design (mobile-friendly)

**Backend:**  
- Node.js  
- Express.js  
- JSON Web Token (JWT)  
- Multer (for file uploads)  
- Cloudflare Turnstile CAPTCHA API  
- MySQL (manually created via terminal)

---

## 🧱 Database Schema

- `students`: id, name, email, password  
- `professors`: id, name, email, password, profile_picture  
- `videos`: id, title, video_url, thumbnail_url, professor_id (FK)

> All tables created manually using MySQL CLI (not ORM).

---

## 📂 Project Structure

