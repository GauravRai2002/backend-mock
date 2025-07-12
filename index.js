const cors = require("cors");
const dotenv = require("dotenv");
const dotenvConfig = dotenv.config();

const express = require("express");
const app = express();
const usersRouter = require("./routes/users");
const organizationRouter = require("./routes/organization");
const membersRouter = require("./routes/members");

/**
 * Express middleware configuration
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

/**
 * Root endpoint for health check
 */
app.get("/", (req, res) => {
  res.status(200).send("Hello World");
});

/**
 * Start the server on port 3001
 */
app.listen(3001, () => {
  console.log("Server is running on port 3001");
});

/**
 * Route handlers
 */
app.use("/users", usersRouter);
app.use("/organization", organizationRouter);
app.use("/members", membersRouter);

module.exports = app;

// USAGE EXAMPLES FOR TURSO CLIENT:
// TO EXECUTE SQL QUERIES
// await turso.execute("SELECT * FROM users");

// TO EXECUTE SQL QUERIES WITH ARGUMENTS
// await turso.execute({
//   sql: "SELECT * FROM users WHERE id = ?",
//   args: [1],
// });