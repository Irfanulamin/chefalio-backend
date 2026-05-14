import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { SuggestRecipesDto } from './dto/suggest.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('suggest')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  suggest(@Body() dto: SuggestRecipesDto) {
    return this.aiService.suggestRecipes(dto.ingredients);
  }
}
