import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CookbookService } from './cookbook.service';
import { CreateCookbookDto } from './dto/create-cookbook.dto';
import { UpdateCookbookDto } from './dto/update-cookbook.dto';

@Controller('cookbook')
export class CookbookController {
  constructor(private readonly cookbookService: CookbookService) {}

  @Post()
  create(@Body() createCookbookDto: CreateCookbookDto) {
    return this.cookbookService.create(createCookbookDto);
  }

  @Get()
  findAll() {
    return this.cookbookService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cookbookService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCookbookDto: UpdateCookbookDto) {
    return this.cookbookService.update(+id, updateCookbookDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cookbookService.remove(+id);
  }
}
