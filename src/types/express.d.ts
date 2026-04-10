declare namespace Express {
  interface User {
    sub: string;
    role: 'user' | 'chef' | 'admin';
  }

  interface Request {
    user?: User;
  }
}
