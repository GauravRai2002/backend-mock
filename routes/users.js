const express = require("express");
const router = express.Router();
const turso = require("../db");

//get user details
router.get("/:id", async(req, res)=>{
  try{
    const { id } = req.params
    const user = await turso.execute("SELECT * FROM users WHERE user_id = ?",[id])
    res.status(200).json({data:user.rows})
  }catch(error){
    console.error(error);
    res.status(500).json({ message:"failed to get user", error:error})
  }
});


// create a new user
router.post("/:id", async (req, res) => {
    try{
        const id = req.params.id;
        const { userName, firstName, lastName, email, createdAt } = req.body;
        const user = await turso.execute(
          "INSERT INTO users (user_id, user_name, first_name, last_name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, userName, firstName, lastName, email, createdAt]
        );
        res.status(201).json({data:user.rows});
    }catch(error){
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});


// get all the organizations of the user
router.get("/get-organizations/:userId", async(req, res)=>{
  try{
    const { userId } = req.params;
    const userOrganizations = turso.execute("SELECT * from members where user_id = ?",[userId]);
    res.status(200).json({data:userOrganizations.rows})
  }catch(error){
    console.error(error);
    res.status(500).json({ error : error})
  }
});



// add user to the organization
router.post("/add-user-to-organization/:userId", async(req, res)=>{
  try{

  }catch(error){
    console.error(error);
    res.status(500).json({message:'cound not add user to the organization', error:error});
  }
});

module.exports = router;