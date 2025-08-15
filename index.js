const cors = require("cors");
const dotenv = require("dotenv");
const dotenvConfig = dotenv.config();

const express = require("express");
const app = express();
const usersRouter = require("./routes/users");
const organizationRouter = require("./routes/organization");
const membersRouter = require("./routes/members");
const mock = require('./routes/m')
const authenticate = require("./middleware/auth")

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
app.use("/users", authenticate ,usersRouter);
app.use("/organization", authenticate, organizationRouter);
app.use("/members", authenticate, membersRouter);
app.use("/m", authenticate, mock);

module.exports = app;
