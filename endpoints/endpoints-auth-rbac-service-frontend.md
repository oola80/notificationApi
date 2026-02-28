# Auth RBAC Service Frontend — Route Reference

> **Info:** This file tracks all planned pages/routes for the Auth RBAC Service Frontend (port 3161). Update the **Status** column as routes are implemented.

## Pages

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/` | Token Receipt | Receives app-scoped token from ecommerce-backoffice redirect, validates, stores in memory, redirects to /applications | Not Started |
| `/applications` | Application List | List all registered applications with search and status filtering | Not Started |
| `/applications/new` | Create Application | Form to register a new application (name, code, description, frontend URL) | Not Started |
| `/applications/:id` | Application Detail | Application details with tabs for roles, permissions, and assigned users | Not Started |
| `/users` | User List | List all users with search and status filtering | Not Started |
| `/users/new` | Create User | Form to create a new user (email, full name, temporary password) | Not Started |
| `/users/:id` | User Detail | User profile, status management, application assignments with role editing | Not Started |
