# Docs Copilot Backend

A TypeScript Express.js backend API for receiving GitLab repository connection details from the frontend.

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## 📡 API Endpoints

### Health Check

```
GET /health
```

Returns server status and timestamp.

### GitLab Connection

```
POST /api/gitlab/connect
Content-Type: application/json

{
  "repoUrl": "https://gitlab.com/username/repository",
  "accessToken": "glpat-xxxxxxxxxxxxxxxxxxxx"
}
```

**Response:**

```json
{
  "success": true,
  "message": "GitLab connection details received successfully",
  "data": {
    "repoUrl": "https://gitlab.com/username/repository",
    "connected": true,
    "timestamp": "2025-06-16T05:51:53.835Z"
  }
}
```

### GitLab Disconnection

```
POST /api/gitlab/disconnect
```

**Response:**

```json
{
  "success": true,
  "message": "Disconnected from GitLab successfully",
  "data": {
    "connected": false,
    "timestamp": "2025-06-16T05:52:00.936Z"
  }
}
```

### Repository Files (Placeholder)

```
GET /api/gitlab/files
```

Returns empty files array (for future GitLab API integration).

## 🛠 Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Default configuration:

- **Port:** 3001
- **CORS Origin:** http://localhost:3000 (for frontend)
- **Environment:** development

## 🏗 Architecture

```
src/
├── index.ts              # Server entry point
├── routes/
│   └── gitlab.ts         # GitLab API routes
├── controllers/
│   └── gitlabController.ts # Request handlers
└── types/
    └── index.ts          # TypeScript definitions
```

## 🔒 Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-origin resource sharing
- **Input validation** - URL and token validation
- **Error handling** - Structured error responses

## 📝 Current Features

✅ Receives GitLab repository URL and access token  
✅ Basic input validation  
✅ In-memory connection storage  
✅ RESTful API design  
✅ TypeScript with strict mode  
✅ Development hot reload

## 🔮 Future Enhancements

- GitLab API integration
- File system operations
- Database persistence
- Authentication & sessions
- Rate limiting
- Logging system

## 🧪 Testing

Test the API endpoints:

```bash
# Health check
curl http://localhost:3001/health

# Connect to GitLab
curl -X POST http://localhost:3001/api/gitlab/connect \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://gitlab.com/example/repo", "accessToken": "your-token"}'

# Disconnect
curl -X POST http://localhost:3001/api/gitlab/disconnect
```
