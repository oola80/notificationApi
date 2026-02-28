# eCommerce Backoffice — Route Reference

> **Info:** This file tracks all planned pages/routes for the eCommerce Backoffice (port 3162). Update the **Status** column as routes are implemented.

## Pages

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/login` | Login | Email/password login form; authenticates via POST /auth/login to auth-rbac-service-backend | Not Started |
| `/forgot-password` | Forgot Password | Email form to request password reset; always shows success message | Not Started |
| `/reset-password` | Reset Password | New password form with strength indicator; receives ?token= from email link | Not Started |
| `/apps` | Application Launcher | Grid of application cards the user has access to; click launches app with app-scoped token redirect | Not Started |
