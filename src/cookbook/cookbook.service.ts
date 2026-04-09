import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCookbookDto } from './dto/create-cookbook.dto';
import { UpdateCookbookDto } from './dto/update-cookbook.dto';
import { CloudinaryService } from '../services/cloudinary.service';
import { User } from '../user/schema/user.schema';
import { Cookbook } from './schemas/cookbook.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CookbookService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Cookbook.name) private cookbookModel: Model<Cookbook>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}
  async create(
    userId: string,
    createCookbookDto: CreateCookbookDto,
    image: Express.Multer.File,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const cookbook_image = await this.cloudinaryService.uploadImage(image);

    const cookbook = await this.cookbookModel.create({
      ...createCookbookDto,
      cookbook_image,
      author: {
        userId: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        image: user.profile_url,
      },
    });
    return {
      success: true,
      message: 'Cookbook created successfully',
      data: cookbook,
    };
  }

  async findAll(page: number, limit: number, search: string, author: string) {
    const skip = (page - 1) * limit;

    const query: Record<string, any> = {
      stockCount: { $gt: 0 },
    };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (author) {
      query['author.username'] = author;
    }

    const data = await this.cookbookModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .select('-__v -updatedAt -createdAt');

    const total = await this.cookbookModel.countDocuments(query);

    return {
      success: true,
      message: 'Cookbooks retrieved successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const cookbook = await this.cookbookModel.findById(id);
    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }
    return {
      success: true,
      message: 'Cookbook retrieved successfully',
      data: cookbook,
    };
  }

  async update(
    id: string,
    userId: string,
    updateCookbookDto: UpdateCookbookDto,
    image?: Express.Multer.File,
  ) {
    const cookbook = await this.cookbookModel.findById(id);
    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }
    if (cookbook.author.userId.toString() !== userId) {
      throw new ForbiddenException(
        'You are not authorized to update this cookbook',
      );
    }
    let cookbook_image = cookbook.cookbook_image;
    if (image && cookbook.cookbook_image) {
      await this.cloudinaryService.deleteImage(cookbook.cookbook_image);
      cookbook_image = await this.cloudinaryService.uploadImage(image);
    }
    const updatedCookbook = await this.cookbookModel.findByIdAndUpdate(
      id,
      { ...updateCookbookDto, cookbook_image },
      { new: true },
    );
    return {
      success: true,
      message: 'Cookbook updated successfully',
      data: updatedCookbook,
    };
  }

  async remove(
    id: string,
    userId: string,
    userRole: 'user' | 'chef' | 'admin',
  ) {
    const cookbook = await this.cookbookModel.findById(id);
    if (!cookbook) {
      throw new NotFoundException('Cookbook not found');
    }

    if (cookbook.author.userId.toString() !== userId && userRole !== 'admin') {
      throw new ForbiddenException(
        'You are not authorized to delete this cookbook',
      );
    }

    await this.cloudinaryService.deleteImage(cookbook.cookbook_image);
    await this.cookbookModel.findByIdAndDelete(id);
    return {
      success: true,
      message: 'Cookbook removed successfully',
    };
  }

  async findOtherCookbooks(excludeId: string, limit: number) {
    const cookbooks = await this.cookbookModel
      .find({ _id: { $ne: excludeId } })
      .limit(limit);
    return {
      success: true,
      message: 'Other cookbooks retrieved successfully',
      data: cookbooks,
    };
  }
}
