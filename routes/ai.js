const express = require("express");
const router = express.Router();
const aiService = require("../services/ai.service");
const { getAuth } = require('@clerk/express');
const { getLimits } = require('../middleware/billing');

/**
 * POST /ai/generate/project
 * Generates an array of API endpoints given a text prompt.
 * Body: { prompt: "string" }
 */
router.post("/generate/project", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ error: "A valid 'prompt' string is required." });
        }

        if (prompt.length > 1000) {
            return res.status(400).json({ error: "Prompt is too long. Please keep it under 1000 characters." });
        }

        // Fetch user billings limits to constrain the AI
        const auth = getAuth(req);
        const limits = await getLimits(auth);

        const endpoints = await aiService.generateProjectEndpoints(prompt, limits);

        // Format scenarios' responseBody from stringified JSON back to real JSON objects
        // for the frontend to consume easily, since we asked the AI to give us strings to ensure structure.
        const formattedEndpoints = endpoints.map(ep => ({
            ...ep,
            scenarios: ep.scenarios.map(sc => {
                let parsedBody = sc.responseBody;
                try {
                    if (typeof parsedBody === 'string') {
                        parsedBody = JSON.parse(parsedBody);
                    }
                } catch (e) {
                    // If it fails to parse, leave it as a raw string
                }
                return {
                    ...sc,
                    responseBody: parsedBody
                };
            })
        }));

        res.status(200).json({ data: formattedEndpoints });
    } catch (error) {
        console.error("\n=== AI GENERATION ERROR ===");
        console.error("Timestamp:", new Date().toISOString());
        console.error("Endpoint: POST /ai/generate/project");
        console.error("User Prompt:", req.body?.prompt);
        console.error("Error Message:", error.message);
        if (error.stack) console.error("Stack Trace:", error.stack);
        console.error("===========================\n");

        const userMessage = error.type === 'PROVIDER_ERROR'
            ? "The AI service is currently unavailable or overloaded. Please try again later."
            : "Failed to generate project endpoints validly. Please try rephrasing your prompt.";

        res.status(500).json({
            error: "AI Generation Failed",
            details: userMessage
        });
    }
});

/**
 * POST /ai/generate/mock-data
 * Generates a realistic mock JSON payload given a text prompt.
 * Body: { prompt: "string" }
 */
router.post("/generate/mock-data", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== "string") {
            return res.status(400).json({ error: "A valid 'prompt' string is required." });
        }

        if (prompt.length > 1000) {
            return res.status(400).json({ error: "Prompt is too long. Please keep it under 1000 characters." });
        }

        const mockData = await aiService.generateMockData(prompt);

        res.status(200).json({ data: mockData });
    } catch (error) {
        console.error("\n=== AI GENERATION ERROR ===");
        console.error("Timestamp:", new Date().toISOString());
        console.error("Endpoint: POST /ai/generate/mock-data");
        console.error("User Prompt:", req.body?.prompt);
        console.error("Error Message:", error.message);
        if (error.stack) console.error("Stack Trace:", error.stack);
        console.error("===========================\n");

        const userMessage = error.type === 'PROVIDER_ERROR'
            ? "The AI service is currently unavailable or overloaded. Please try again later."
            : "Failed to generate mock data. Please ensure your prompt asks for a JSON object or array.";

        res.status(500).json({
            error: "AI Generation Failed",
            details: userMessage
        });
    }
});

module.exports = router;
