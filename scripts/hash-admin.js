/**
 * hash-admin.js
 *
 * Run ONCE to convert any plaintext passwords in the users table to bcrypt hashes.
 * Safe to run multiple times — already-hashed passwords are skipped.
 *
 * Usage:
 *   node scripts/hash-admin.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const db     = require("../db");

async function hashAllPlainPasswords() {
  console.log("🔐 Checking users for plaintext passwords...\n");

  const [users] = await db.query("SELECT id, username, password FROM users");

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.password.startsWith("$2")) {
      console.log(`  ✅ ${user.username} — already hashed, skipping.`);
      skipped++;
      continue;
    }

    const hashed = await bcrypt.hash(user.password, 12);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
    console.log(`  🔒 ${user.username} — plaintext password hashed.`);
    updated++;
  }

  console.log(`\nDone! ${updated} password(s) hashed, ${skipped} already secure.`);
  process.exit(0);
}

hashAllPlainPasswords().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
