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
    try{
        const id = req.params.id;
        const { userName, firstName, lastName, email, createdAt } = req.body;
        const user = await turso.execute(
          "INSERT INTO users (user_id, user_name, first_name, last_name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, userName, firstName, lastName, email, createdAt]
        );
        res.status(201).json(user);
    }catch(error){
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});

router.get("/get-organizations/:userId", async(req, res)=>{
  try{
    const { userId } = req.params;
    const userOrganizations = turso.execute("SELECT * from members where user_id = ?",[userId]);
    res.status(200).send(userOrganizations)
  }catch(error){
    console.error(error);
    res.status(500).json({ error : error})
  }
});


router.post("/add-user-to-organization/:userId", async(req, res)=>{
  try{

  }catch(error){
    console.error(error);
    res.status(500).json({message:'cound not add user to the organization', error:error});
  }
});

module.exports = router;