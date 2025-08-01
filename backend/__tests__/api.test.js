const request = require('supertest');
const { app, db } = require('../index');
const jwt = require('jsonwebtoken');

// Mock Google OAuth verification
jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        verifyIdToken: jest.fn().mockResolvedValue({
          getPayload: () => ({
            sub: 'test-google-id',
            email: 'test@example.com'
          })
        }),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            refresh_token: 'test-refresh-token'
          }
        })
      }))
    }
  }
}));

describe('API Endpoints', () => {
  let token;

  beforeAll(() => {
    const JWT_SECRET = 'a-super-secret-key-that-should-be-in-a-env-file';
    token = jwt.sign({ id: 1, email: 'test@example.com' }, JWT_SECRET);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /messages', () => {
    it('should return 401 Unauthorized if no token is provided', async () => {
      const response = await request(app).get('/messages');
      expect(response.status).toBe(401);
    });

    it('should return 200 and a list of messages if token is valid', async () => {
      const mockMessages = [{ id: 1, subject: 'Test Message' }];
      
      // Mock the db.all method to return our test data
      db.all = jest.fn((query, params, callback) => {
        callback(null, mockMessages);
      });
      
      const response = await request(app)
        .get('/messages')
        .set('Authorization', `Bearer ${token}`);
        
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMessages);
      expect(db.all).toHaveBeenCalled();
    });
  });

  describe('GET /senders', () => {
    it('should return 200 and a list of senders', async () => {
      const mockSenders = [{ id: 1, name: 'Sender A' }];
      db.all = jest.fn((query, params, callback) => callback(null, mockSenders));

      const response = await request(app)
        .get('/senders')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSenders);
    });
  });

  describe('POST /subscriptions/toggle', () => {
    it('should return 200 and success message', async () => {
      db.run = jest.fn(function(query, params, callback) {
        // @ts-ignore
        this.changes = 1;
        if (callback) callback(null);
      });

      const response = await request(app)
        .post('/subscriptions/toggle')
        .set('Authorization', `Bearer ${token}`)
        .send({ senderId: 1, isActive: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /devices', () => {
    it('should return 200 and success message', async () => {
      db.run = jest.fn(function(query, params, callback) {
        // @ts-ignore
        this.lastID = 1;
        if (callback) callback(null);
      });

      const response = await request(app)
        .post('/devices')
        .set('Authorization', `Bearer ${token}`)
        .send({ fcmToken: 'test-token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /login', () => {
    it('should return 200 and an access token', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      db.get = jest.fn((query, params, callback) => callback(null, mockUser));

      const response = await request(app)
        .post('/login')
        .send({ idToken: 'test-id-token' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });
  });
}); 