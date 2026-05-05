declare namespace Express {
  interface User {
    sub?: string;
    role: 'user' | 'chef' | 'admin';
    [key: string]: any;
  }

  interface Request {
    user?: User;
  }
}
