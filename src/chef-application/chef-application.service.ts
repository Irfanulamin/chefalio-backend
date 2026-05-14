import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChefApplication } from './schemas/chef-application.schema';
import { User } from '../user/schema/user.schema';
import { CloudinaryService } from '../services/cloudinary.service';
import { CreateChefApplicationDto } from './dto/create-chef-application.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';

@Injectable()
export class ChefApplicationService {
  private readonly logger = new Logger(ChefApplicationService.name);

  constructor(
    @InjectModel(ChefApplication.name)
    private readonly applicationModel: Model<ChefApplication>,

    @InjectModel(User.name)
    private readonly userModel: Model<User>,

    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private parseAchievements(raw?: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((a) => typeof a === 'string' && a.trim())
        : [];
    } catch {
      return [];
    }
  }

  async submit(
    userId: string,
    dto: CreateChefApplicationDto,
    kycFile: Express.Multer.File,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.role !== 'user') {
      throw new ForbiddenException('Only regular users can apply to become a chef');
    }

    const existing = await this.applicationModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (existing) {
      if (existing.status === 'pending') {
        throw new ConflictException(
          'You already have a pending application under review',
        );
      }
      if (existing.status === 'approved') {
        throw new ConflictException('Your application has already been approved');
      }
      // rejected — user must use the resubmit endpoint
      throw new ConflictException(
        'You have a rejected application. Please use the resubmit option to apply again',
      );
    }

    const kycDocumentUrl = await this.cloudinaryService.uploadImage(
      kycFile,
      'chef_kyc_documents',
    );

    const application = await this.applicationModel.create({
      userId: new Types.ObjectId(userId),
      fullName: dto.fullName,
      bio: dto.bio,
      specialty: dto.specialty,
      yearsOfExperience: dto.yearsOfExperience,
      kycType: dto.kycType,
      kycDocumentUrl,
      referenceUrl: dto.referenceUrl,
      youtubeUrl: dto.youtubeUrl,
      achievements: this.parseAchievements(dto.achievements),
      instagramUrl: dto.instagramUrl,
      facebookUrl: dto.facebookUrl,
      twitterUrl: dto.twitterUrl,
      status: 'pending',
    });

    return {
      success: true,
      message: 'Application submitted successfully. We will review it shortly.',
      data: application,
    };
  }

  async resubmit(
    userId: string,
    dto: CreateChefApplicationDto,
    kycFile?: Express.Multer.File,
  ) {
    const application = await this.applicationModel.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!application) {
      throw new NotFoundException(
        'No existing application found. Please submit a new application',
      );
    }

    if (application.status !== 'rejected') {
      throw new BadRequestException(
        `Cannot resubmit an application with status "${application.status}"`,
      );
    }

    let kycDocumentUrl = application.kycDocumentUrl;

    if (kycFile) {
      const oldPublicId = this.cloudinaryService.getCloudinaryPublicId(
        application.kycDocumentUrl,
      );
      if (oldPublicId) {
        await this.cloudinaryService.deleteImage(oldPublicId).catch(() => {});
      }
      kycDocumentUrl = await this.cloudinaryService.uploadImage(
        kycFile,
        'chef_kyc_documents',
      );
    }

    const updated = await this.applicationModel.findByIdAndUpdate(
      application._id,
      {
        $set: {
          fullName: dto.fullName,
          bio: dto.bio,
          specialty: dto.specialty,
          yearsOfExperience: dto.yearsOfExperience,
          kycType: dto.kycType,
          kycDocumentUrl,
          referenceUrl: dto.referenceUrl,
          youtubeUrl: dto.youtubeUrl,
          achievements: this.parseAchievements(dto.achievements),
          instagramUrl: dto.instagramUrl,
          facebookUrl: dto.facebookUrl,
          twitterUrl: dto.twitterUrl,
          status: 'pending',
          rejectionNote: undefined,
          reviewedBy: undefined,
          reviewedAt: undefined,
        },
        $unset: { rejectionNote: 1, reviewedBy: 1, reviewedAt: 1 },
      },
      { new: true },
    );

    return {
      success: true,
      message: 'Application resubmitted successfully. We will review it shortly.',
      data: updated,
    };
  }

  async getMyApplication(userId: string) {
    const application = await this.applicationModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .lean();

    return {
      success: true,
      data: application ?? null,
    };
  }

  async findAll(status?: string, page = 1, limit = 20) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      this.applicationModel
        .find(filter)
        .populate('userId', 'fullName username email profile_url')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.applicationModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const application = await this.applicationModel
      .findById(id)
      .populate('userId', 'fullName username email profile_url')
      .populate('reviewedBy', 'fullName username')
      .lean();

    if (!application) throw new NotFoundException('Application not found');

    return { success: true, data: application };
  }

  async approve(adminId: string, applicationId: string) {
    const application = await this.applicationModel.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');

    if (application.status !== 'pending') {
      throw new BadRequestException(
        `Application is already "${application.status}"`,
      );
    }

    await this.userModel.findByIdAndUpdate(application.userId, {
      $set: { role: 'chef' },
    });

    const updated = await this.applicationModel.findByIdAndUpdate(
      applicationId,
      {
        $set: {
          status: 'approved',
          reviewedBy: new Types.ObjectId(adminId),
          reviewedAt: new Date(),
        },
      },
      { new: true },
    );

    this.logger.log(
      `Chef application ${applicationId} approved by admin ${adminId}`,
    );

    return {
      success: true,
      message: 'Application approved. User role updated to chef.',
      data: updated,
    };
  }

  async reject(adminId: string, applicationId: string, dto: RejectApplicationDto) {
    const application = await this.applicationModel.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');

    if (application.status !== 'pending') {
      throw new BadRequestException(
        `Application is already "${application.status}"`,
      );
    }

    const updated = await this.applicationModel.findByIdAndUpdate(
      applicationId,
      {
        $set: {
          status: 'rejected',
          rejectionNote: dto.rejectionNote,
          reviewedBy: new Types.ObjectId(adminId),
          reviewedAt: new Date(),
        },
      },
      { new: true },
    );

    this.logger.log(
      `Chef application ${applicationId} rejected by admin ${adminId}`,
    );

    return {
      success: true,
      message: 'Application rejected.',
      data: updated,
    };
  }

  async getStats() {
    const [pending, approved, rejected] = await Promise.all([
      this.applicationModel.countDocuments({ status: 'pending' }),
      this.applicationModel.countDocuments({ status: 'approved' }),
      this.applicationModel.countDocuments({ status: 'rejected' }),
    ]);
    return { success: true, data: { pending, approved, rejected, total: pending + approved + rejected } };
  }
}
