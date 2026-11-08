# AVNL Tapal Manager — Complete Setup Guide

## Project Structure

```
avnl-tapal/
├── index.html            ← Frontend (tri-lingual: Hindi / English / Tamil)
├── server.js             ← Express backend entry point
├── db.js                 ← MySQL connection pool
├── .env                  ← Environment variables (DB + SESSION_SECRET)
├── mysql.sql             ← Full database setup + seed data
├── package.json
├── avnl.webp             ← AVNL logo
│
├── middleware/
│   └── auth.js           ← requireLogin / requireAdmin guards
│
├── routes/
│   ├── auth.js           ← POST /api/auth/login|logout|me|change-password|register
│   ├── masters.js        ← CRUD /api/masters/:key (officers/cities/factories/tapal-types)
│   └── upload.js         ← POST/GET/DELETE /api/upload (PDF files)
│
├── scripts/
│   └── hash-admin.js     ← One-time: hash plaintext passwords in DB
│
└── uploads/              ← PDF attachments (auto-created)
```

---

## One-Time Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create the database
```bash
mysql -u root -p < mysql.sql
```
This creates `tapal_manager` with all tables and seeds master data.

### 3. Configure environment
Edit `.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=tapal_manager
PORT=3000

# Generate a strong secret:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=paste_your_generated_secret_here
```

### 4. Hash the default admin password
```bash
node scripts/hash-admin.js
```
This converts `admin123` (the seed password) to a bcrypt hash.

### 5. Start the server
```bash
npm start          # production
npm run dev        # auto-restart on file change (uses Node --watch)
```

Open **http://localhost:3000** in your browser.

---

## Default Login

| Username | Password | Role  |
|----------|----------|-------|
| `admin`  | `admin123` | admin |

**Change the password immediately** after first login via Settings → Change Password.

---

## API Reference

### Auth  `/api/auth/...`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | `{ username, password }` → session cookie |
| POST | `/api/auth/logout` | — | Destroy session |
| GET | `/api/auth/me` | — | Returns current session user |
| POST | `/api/auth/change-password` | Login | `{ currentPassword, newPassword }` |
| POST | `/api/auth/register` | Admin | `{ username, password, fullName, role? }` |

### Tapals  `/api/tapals`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tapals` | Public | List all tapals |
| GET | `/api/tapals/:id` | Public | Single tapal |
| POST | `/api/tapals` | Login | Create tapal |
| PUT | `/api/tapals/:id` | Login | Edit tapal |
| DELETE | `/api/tapals/:id` | Login | Delete tapal |
| PUT | `/api/tapals/:id/verify` | Login | Toggle verified |
| PUT | `/api/tapals/:id/status` | Login | Cycle status |

### Masters  `/api/masters/:key`
`:key` = `officers` · `cities` · `factories` · `tapal-types`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/masters/:key` | Public | List all |
| POST | `/api/masters/:key` | Login | Add item `{ name }` |
| PUT | `/api/masters/:key/:id` | Login | Rename item |
| DELETE | `/api/masters/:key/:id` | Admin | Delete item |

### File Upload  `/api/upload`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload` | Login | Upload PDF (field: `attachment`, max 10MB) |
| GET | `/api/upload/:filename` | Public | Serve/view PDF inline |
| DELETE | `/api/upload/:filename` | Admin | Delete PDF from disk |

Upload response:
```json
{ "success": true, "fileName": "letter.pdf", "filePath": "/api/upload/1234_letter.pdf" }
```

---

## Security Notes

- Sessions stored in MySQL (`sessions` table, auto-created on first start)
- Passwords stored as **bcrypt** hashes (cost factor 12)
- Rate limiting: 200 req/15min globally, 10 req/15min on auth endpoints
- Helmet.js security headers enabled (CSP disabled to allow inline scripts)
- PDF uploads: type-checked (PDF only), max 10MB, stored with unique timestamped filenames
- Directory traversal prevention on file serving

---

## Adding Users (Admin Only)

```bash
# Via API (curl example):
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -b "tapal_sid=YOUR_SESSION_COOKIE" \
  -d '{"username":"jdoe","password":"secret123","fullName":"John Doe","role":"user"}'
```

Or use any HTTP client / Postman after logging in as admin.

---

## Troubleshooting

**MySQL connection error:**
- Check `.env` credentials
- Ensure MySQL is running: `sudo systemctl start mysql`

**Session not persisting:**
- The `sessions` table is created automatically on first start
- Set a proper `SESSION_SECRET` in `.env`

**PDF upload fails with 401:**
- User must be logged in. The frontend will show the login modal automatically.

**Port already in use:**
- Change `PORT` in `.env` or kill the existing process: `npx kill-port 3000`
