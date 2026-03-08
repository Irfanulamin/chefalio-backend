# Chefalio Backend

A backend service for the Chefalio application.

## Overview

Chefalio Backend provides the server-side API and business logic for the Chefalio platform. It handles user authentication, data management, and core application features.

## Features

- RESTful API endpoints
- User management and authentication
- Data persistence and database integration
- Error handling and validation

## Getting Started

### Installation

```bash
git clone <repository>
cd chefalio-backend
npm install
```

### Running the Server

```bash
npm start
```

The server will start on the configured port.

## Project Structure

```
src/
  ├── auth/              # Authentication module
  │   ├── auth.controller.ts
  │   ├── auth.service.ts
  │   ├── auth.module.ts
  │   └── auth.guard.ts
  ├── recipes/           # Recipes module
  │   ├── recipes.controller.ts
  │   ├── recipes.service.ts
  │   ├── recipes.module.ts
  │   └── recipe.schemas.ts
  ├── users/            # Users module
  │   ├── users.controller.ts
  │   ├── users.service.ts
  │   ├── users.module.ts
  │   └── user.schemas.ts
  ├── services/           # Shared utilities
  │   ├── mail.service.ts
  │   └── cloudinary.service.ts
  ├── app.module.ts
  └── main.ts
```

```

```
