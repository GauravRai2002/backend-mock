const express = require("express");
const router = express.Router();

router.get("/", async(requestAnimationFrame, res)=>{

});


router.all("/:projectSlug/*", async(req, res)=>{
    const projectSlug = req.params.projectSlug;
    const path = req.params[0];
    const method = req.method;

    try{

    }catch(error){
        console.error(error);
        res.status(500).json({message:'Error executing command', error:error})
    }
});