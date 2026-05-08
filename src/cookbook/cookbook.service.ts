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
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class CookbookService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Cookbook.name) private cookbookModel: Model<Cookbook>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationService: NotificationService,
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
      authorId: user._id,
    });

    const populated = await cookbook.populate(
      'authorId',
      'fullName username email profile_url',
    );

    this.notificationService
      .create({
        type: 'new_cookbook',
        title: 'New Cookbook',
        message: `${user.fullName} just published a new cookbook: "${createCookbookDto.title}"`,
        actorName: user.fullName,
        actorAvatar: user.profile_url,
        targetId: cookbook._id as Types.ObjectId,
        thumbnail: cookbook_image,
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Cookbook created successfully',
      data: populated,
    };
  }

  async findAll(page: number, limit: number, search: string, author: string) {
    const query: Record<string, any> = { stockCount: { $gt: 0 } };

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    if (author) {
      const authorUsers = await this.userModel
        .find({ fullName: { $regex: author, $options: 'i' } })
        .select('_id');
      if (!authorUsers.length) return this.emptyCookbookResponse(page, limit);
      query.authorId = { $in: authorUsers.map((u) => u._id) };
    }

    const [data, total] = await Promise.all([
      this.cookbookModel
        .find(query)
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select('-__v -updatedAt -createdAt'),
      this.cookbookModel.countDocuments(query),
    ]);

    return {
      success: true,
      message: 'Cookbooks retrieved successfully',
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findMyCookbooks(
    page: number,
    limit: number,
    search: string,
    userId: string,
  ) {
    const query: Record<string, any> = {
      authorId: new Types.ObjectId(userId),
    };

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const [data, total] = await Promise.all([
      this.cookbookModel
        .find(query)
        .populate('authorId', 'fullName username email profile_url')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),

      this.cookbookModel.countDocuments(query),
    ]);

    return {
      success: true,
      message: 'My Cookbooks retrieved successfully',
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private emptyCookbookResponse(page: number, limit: number) {
    return {
      success: true,
      message: 'Cookbooks retrieved successfully',
      data: [],
      pagination: { total: 0, page, limit, totalPages: 0 },
    };
  }

  async findOne(id: string) {
    const cookbook = await this.cookbookModel
      .findById(id)
      .populate('authorId', 'fullName username email profile_url');
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
    if (cookbook.authorId.toString() !== userId) {
      throw new ForbiddenException(
        'You are not authorized to update this cookbook',
      );
    }
    let cookbook_image = cookbook.cookbook_image;
    if (image && cookbook.cookbook_image) {
      const publicId = this.cloudinaryService.getCloudinaryPublicId(
        cookbook.cookbook_image,
      );
      if (publicId) await this.cloudinaryService.deleteImage(publicId); // pass publicId, not URL
      cookbook_image = await this.cloudinaryService.uploadImage(image);
    }
    const updatedCookbook = await this.cookbookModel
      .findByIdAndUpdate(
        id,
        { ...updateCookbookDto, cookbook_image },
        { new: true },
      )
      .populate('authorId', 'fullName username email profile_url');

    return {
      success: true,
      message: 'Cookbook updated successfully',
      data: updatedCookbook,
    };
  }

  async applyGlobalDiscount(discount: number) {
    await this.cookbookModel.updateMany({}, { $set: { discount } });

    if (discount > 0) {
      this.notificationService
        .create({
          type: 'discount',
          title: 'Sale — Cookbooks on Discount!',
          message: `All cookbooks are now ${discount}% off. Grab one before the sale ends!`,
          discount,
        })
        .catch(() => {});
    }

    return {
      success: true,
      message: `Global discount of ${discount}% applied to all cookbooks`,
    };
  }

  async adminUpdate(
    id: string,
    dto: { price?: number; stockCount?: number; discount?: number; title?: string; description?: string },
  ) {
    const cookbook = await this.cookbookModel.findById(id);
    if (!cookbook) throw new NotFoundException('Cookbook not found');
    const updated = await this.cookbookModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .populate('authorId', 'fullName username email profile_url');
    return { success: true, message: 'Cookbook updated', data: updated };
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

    if (cookbook.authorId.toString() !== userId && userRole !== 'admin') {
      throw new ForbiddenException(
        'You are not authorized to delete this cookbook',
      );
    }

    const publicId = this.cloudinaryService.getCloudinaryPublicId(
      cookbook.cookbook_image,
    );
    if (publicId) await this.cloudinaryService.deleteImage(publicId); // same fix
    await this.cookbookModel.findByIdAndDelete(id);
    return {
      success: true,
      message: 'Cookbook removed successfully',
    };
  }
}
