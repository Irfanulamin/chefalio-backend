import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  Req,
  ParseFilePipeBuilder,
  HttpStatus,
  Query,
  UploadedFile,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CookbookService } from './cookbook.service';
import { CreateCookbookDto } from './dto/create-cookbook.dto';
import { UpdateCookbookDto } from './dto/update-cookbook.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Role, Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { Throttle } from '@nestjs/throttler';

@Controller('cookbooks')
export class CookbookController {
  constructor(private readonly cookbookService: CookbookService) {}

  @Post('create')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @UseInterceptors(FileInterceptor('image'))
  create(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: CreateCookbookDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'Each image must be under 5MB',
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    image: Express.Multer.File,
  ) {
    return this.cookbookService.create(req.user.sub, dto, image);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search: string = '',
    @Query('author') author: string = '',
  ) {
    return this.cookbookService.findAll(page, limit, search, author);
  }

  @Get('my-cookbooks')
  @UseGuards(AuthGuard)
  findMyCookbooks(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search: string = '',
    @Req() req: Request & { user: { sub: string } },
  ) {
    return this.cookbookService.findMyCookbooks(
      page,
      limit,
      search,
      req.user.sub,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.cookbookService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @UseInterceptors(FileInterceptor('image'))
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: Request & { user: { sub: string } },
    @Body() updateCookbookDto: UpdateCookbookDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: 5 * 1024 * 1024,
          message: 'Each image must be under 5MB',
        })
        .build({
          fileIsRequired: false,
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    image: Express.Multer.File,
  ) {
    return this.cookbookService.update(
      id,
      req.user.sub,
      updateCookbookDto,
      image,
    );
  }

  @Patch('admin/discount/global')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  applyGlobalDiscount(@Body('discount') discount: number) {
    return this.cookbookService.applyGlobalDiscount(discount);
  }

  @Patch('admin/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Admin)
  adminUpdate(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: { price?: number; stockCount?: number; discount?: number; title?: string; description?: string },
  ) {
    return this.cookbookService.adminUpdate(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef, Role.Admin)
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req()
    req: Request & { user: { sub: string; role: 'user' | 'chef' | 'admin' } },
  ) {
    return this.cookbookService.remove(id, req.user.sub, req.user.role);
  }
}
