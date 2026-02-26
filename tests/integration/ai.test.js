const request = require('supertest');
const app = require('../../index');

// Mock the AI service to avoid hitting the actual Gemini API during tests
jest.mock('../../services/ai.service', () => ({
    generateProjectEndpoints: jest.fn(),
    generateMockData: jest.fn(),
}));

const aiService = require('../../services/ai.service');
const { clerkMiddleware } = require('@clerk/express');
const { requireAuth } = require('@clerk/express');

jest.mock('../../middleware/billing', () => ({
    getLimits: jest.fn(() => ({ maxMocksPerProject: 5, maxResponsesPerMock: 3 })),
    enforceProjectLimit: jest.fn((req, res, next) => next()),
    enforceMockLimit: jest.fn((req, res, next) => next()),
    enforceResponseLimit: jest.fn((req, res, next) => next())
}));

// We need to mock Clerk authentication to pass the `authenticate` middleware
jest.mock('@clerk/express', () => ({
    clerkMiddleware: jest.fn(() => (req, res, next) => next()),
    requireAuth: jest.fn(() => (req, res, next) => {
        // For these tests, we will simulate an authenticated user
        req.auth = { userId: 'user_test123' };
        next();
    }),
    getAuth: jest.fn(() => ({ userId: 'user_test123' }))
}));

// Provide a fake mock generator response
const mockEndpointsResponse = [
    {
        method: 'GET',
        route: '/api/posts',
        description: 'Get all posts',
        scenarios: [
            {
                name: 'Success',
                status: 200,
                responseBody: [{ id: 1, title: 'Hello World' }]
            }
        ]
    }
];

const mockDataResponse = {
    users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
};

describe('AI Generators API', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /ai/generate/project', () => {
        it('should generate project endpoints given a valid prompt', async () => {
            aiService.generateProjectEndpoints.mockResolvedValue(mockEndpointsResponse);

            const response = await request(app)
                .post('/ai/generate/project')
                .send({ prompt: 'A simple blog API' })
                .expect(200);

            expect(aiService.generateProjectEndpoints).toHaveBeenCalledWith('A simple blog API', { maxMocksPerProject: 5, maxResponsesPerMock: 3 });
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toEqual(mockEndpointsResponse);
        });

        it('should return 400 if prompt is missing', async () => {
            const response = await request(app)
                .post('/ai/generate/project')
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should return 400 if prompt is too long', async () => {
            const longPrompt = 'a'.repeat(1001);
            const response = await request(app)
                .post('/ai/generate/project')
                .send({ prompt: longPrompt })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle AI service errors gracefully', async () => {
            aiService.generateProjectEndpoints.mockRejectedValue(new Error('AI failed'));

            const response = await request(app)
                .post('/ai/generate/project')
                .send({ prompt: 'A simple blog API' })
                .expect(500);

            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('details', 'Failed to generate project endpoints validly. Please try rephrasing your prompt.');
        });
    });

    describe('POST /ai/generate/mock-data', () => {
        it('should generate mock data given a valid prompt', async () => {
            aiService.generateMockData.mockResolvedValue(mockDataResponse);

            const response = await request(app)
                .post('/ai/generate/mock-data')
                .send({ prompt: 'Generate 2 users' })
                .expect(200);

            expect(aiService.generateMockData).toHaveBeenCalledWith('Generate 2 users');
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toEqual(mockDataResponse);
        });

        it('should return 400 if prompt is missing', async () => {
            const response = await request(app)
                .post('/ai/generate/mock-data')
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should return 400 if prompt is too long', async () => {
            const longPrompt = 'a'.repeat(1001);
            const response = await request(app)
                .post('/ai/generate/mock-data')
                .send({ prompt: longPrompt })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle AI service errors gracefully', async () => {
            aiService.generateMockData.mockRejectedValue(new Error('AI failed'));

            const response = await request(app)
                .post('/ai/generate/mock-data')
                .send({ prompt: 'Generate 2 users' })
                .expect(500);

            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('details', 'Failed to generate mock data. Please ensure your prompt asks for a JSON object or array.');
        });
    });
});
