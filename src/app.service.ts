import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): any {
    return {
      message: 'Welcome to ChefAlio API!',
      version: '1.0.0',
      description:
        'ChefAlio is a recipe management application that allows users to create, manage, and share their favorite recipes. The API provides endpoints for user authentication, recipe CRUD operations, and more.',
    };
  }
}
