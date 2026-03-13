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
} from '@nestjs/common';
import { CookbookService } from './cookbook.service';
import { CreateCookbookDto } from './dto/create-cookbook.dto';
import { UpdateCookbookDto } from './dto/update-cookbook.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Role, Roles } from 'src/auth/roles.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('cookbooks')
export class CookbookController {
  constructor(private readonly cookbookService: CookbookService) {}

  @Post('create')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  @UseInterceptors(FilesInterceptor('image'))
  create(
    @Req() req,
    @Body() dto: CreateCookbookDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: '.(jpg|jpeg|png)',
        })
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
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string,
    @Query('author') author: string,
  ) {
    return this.cookbookService.findAll(page, limit, search, author);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cookbookService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  update(
    @Param('id') id: string,
    @Req() req,
    @Body() updateCookbookDto: UpdateCookbookDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: '.(jpg|jpeg|png)',
        })
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

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.Chef)
  remove(@Param('id') id: string) {
    return this.cookbookService.remove(id);
  }
}
