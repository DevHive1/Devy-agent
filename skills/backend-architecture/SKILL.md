---
name: backend-architecture
description: Design and implement backend services, APIs, middleware, authentication, and server-side logic following production best practices.
allowed-tools: [write_file, edit_file, read_file, search_code, execute_command, detect_project]
---
# Backend Architecture Workflow

## Steps

1. **Analyze project structure**: Use `detect_project` and `read_file` to understand the current backend setup (Express, Fastify, Koa, Django, Flask, etc.).
2. **Review existing routes/controllers**: Search for route definitions, middleware, and handler patterns.
3. **Design API structure**:
   - Follow RESTful conventions: `GET /resources`, `POST /resources`, `PUT /resources/:id`, `DELETE /resources/:id`
   - Use proper HTTP status codes (200, 201, 204, 400, 401, 403, 404, 500)
   - Implement consistent JSON response format: `{ success, data, error, meta }`
4. **Implement middleware**:
   - Error handling middleware with structured error responses
   - Request validation (check required fields, types, constraints)
   - Rate limiting pattern (in-memory or Redis-backed)
   - CORS configuration
   - Request logging with timestamps
5. **Authentication & Authorization**:
   - JWT token flow: issue, verify, refresh
   - Role-based access control (RBAC) middleware
   - Password hashing with bcrypt or argon2
   - API key authentication for service-to-service
6. **Database integration**:
   - Connection pooling configuration
   - Migration scripts structure
   - Repository/DAO pattern for data access
   - Transaction handling
7. **Testing**: Write integration tests for each endpoint using the project's test framework.
8. **Documentation**: Generate or update API docs (OpenAPI/Swagger format preferred).
