const express = require("express");
const router = express.Router();
const turso = require("../db");


//create a new organization
router.post("create-organization/:id", async(req, res) => {
    try{
        const id = req.params.id;
        const { organizationName, createdAt, createdBy, slug, subscriptionTier, updatedAt } = req.body;
        const createOrganization = await turso.execute("INSERT INTO organization (organization_id, organization_name, slug, susbcription_tier, created_at, created_by, updated_at) values (?, ?, ?, ?, ?, ?, ?)", [id, organizationName, slug, subscriptionTier, createdAt, createdBy, updatedAt]);
        res.status(200).json({data:createOrganization});
    }catch(error){
        console.error("Error creating organization:", error);
        res.status(500).json({ error: "Failed to create organization" });
    }
});

// get organization details
router.get("/get-organization-by-id/:id", async(req, res) => {
    try{
        const id = req.params.id;
        const organization = await turso.execute("SELECT * FROM organization WHERE organization_id = ?", [id]);
        res.status(200).json({data:organization});
    }catch(error){
        console.error("Error fetching organization:", error);
        res.status(500).json({ error: "Failed to fetch organization" });
    }
});

module.exports = router;