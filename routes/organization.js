const express = require("express");
const router = express.Router();
const turso = require("../db");

router.get("/get-all-organizations", async(req, res) => {
    try{
        const organizations = await turso.execute("SELECT * FROM organization");
        res.status(200).send(organizations);
    }catch(error){
        console.error("Error fetching organizations:", error);
        res.status(500).json({ error: "Failed to fetch organizations" });
    }
});

router.post("create-organization/:id", async(req, res) => {
    try{
        const id = req.params.id;
        const { organizationName, createdAt, createdBy } = req.body;
        const createOrganization = await turso.execute("INSERT INTO organization (organization_id, organization_name, created_at, created_by) values (?, ?, ?, ?)", [id, organizationName, createdAt, createdBy]);
        res.status(200).send(createOrganization);
    }catch(error){
        console.error("Error creating organization:", error);
        res.status(500).json({ error: "Failed to create organization" });
    }
});


router.get("/get-organization-by-id/:id", async(req, res) => {
    try{
        const id = req.params.id;
        const organization = await turso.execute("SELECT * FROM organization WHERE organization_id = ?", [id]);
        res.status(200).send(organization);
    }catch(error){
        console.error("Error fetching organization:", error);
        res.status(500).json({ error: "Failed to fetch organization" });
    }
});

module.exports = router;