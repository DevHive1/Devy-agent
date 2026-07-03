---
name: database
description: Design schemas, write migrations, optimize queries, manage connections, and implement data access patterns for SQL and NoSQL databases.
allowed-tools: [write_file, edit_file, read_file, search_code, execute_command, detect_project]
---
# Database Workflow

## Steps

1. **Identify database stack**: Use `detect_project` and search for config files (knexfile.js, prisma/schema.prisma, sequelize config, .env with DATABASE_URL, mongod refs).
2. **Schema design**:
   - Normalize tables to 3NF for relational DBs
   - Define proper data types, constraints, and defaults
   - Add foreign keys with appropriate ON DELETE/UPDATE actions
   - Create indexes for frequently queried columns
   - Add created_at/updated_at timestamps with auto-update triggers
3. **Migration management**:
   - Create migration files with UP and DOWN operations
   - Use the project's migration tool (Knex, Prisma, Sequelize, Alembic, Django)
   - Name migrations descriptively: `20240101_create_users_table`
   - Always provide rollback logic in DOWN
4. **Query optimization**:
   - Use EXPLAIN/EXPLAIN ANALYZE to check query plans
   - Add composite indexes for multi-column WHERE clauses
   - Avoid SELECT * — specify needed columns
   - Use pagination (LIMIT/OFFSET or cursor-based)
   - Implement connection pooling
5. **Data access layer**:
   - Repository pattern: one file per entity with CRUD methods
   - Parameterized queries to prevent SQL injection
   - Transaction wrappers for multi-step operations
   - Error handling with specific database error codes
6. **Seeding**: Create seed files with realistic test data for development.
7. **NoSQL patterns** (if MongoDB/Redis):
   - Design document schemas with embedded vs referenced relationships
   - Create indexes for query patterns
   - Implement caching strategies with Redis
8. **Backup & safety**: Document backup procedures, add pre-migration backup step.
