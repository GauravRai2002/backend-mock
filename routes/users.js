const express = require("express");
const router = express.Router();
const turso = require("../db");

/**
 * GET /users - Retrieve all users from the database
 * @returns {Array} Array of user objects
 */
router.get("/", async (req, res) => {
  try {
    const users = await turso.execute("SELECT * FROM users");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});


router.post("/:id", async (req, res) => {
  const id = req.params.id;
  const { userName, firstName, lastName, email, createdAt } = req.body;
  const user = await turso.execute(
    "INSERT INTO users (user_id, user_name, first_name, last_name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, userName, firstName, lastName, email, createdAt]
  );
  res.status(201).json(user);
});

module.exports = router;