import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { SuggestRecipesDto } from './dto/suggest.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('suggest')
  @UseGuards(AuthGuard)
  suggest(@Body() dto: SuggestRecipesDto) {
    return this.aiService.suggestRecipes(dto.ingredients);
  }
}
