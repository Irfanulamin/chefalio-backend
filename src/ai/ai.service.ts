import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { Recipe } from '../recipe/schemas/recipe.schema';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
  ) {}

  async suggestRecipes(ingredients: string[]) {
    const [matches, generated] = await Promise.all([
      this.findMatchingRecipes(ingredients),
      this.generateRecipe(ingredients),
    ]);

    return { matches, generated };
  }

  private async findMatchingRecipes(ingredients: string[]) {
    try {
      return await this.recipeModel.aggregate([
        {
          $addFields: {
            matchCount: {
              $size: {
                $filter: {
                  input: '$ingredients',
                  as: 'ing',
                  cond: {
                    $or: ingredients.map((i) => ({
                      $regexMatch: { input: '$$ing', regex: i, options: 'i' },
                    })),
                  },
                },
              },
            },
          },
        },
        { $match: { matchCount: { $gte: 1 } } },
        { $sort: { matchCount: -1 } },
        { $limit: 4 },
        {
          $lookup: {
            from: 'users',
            localField: 'authorId',
            foreignField: '_id',
            as: 'authorId',
            pipeline: [
              { $project: { fullName: 1, profile_url: 1, username: 1 } },
            ],
          },
        },
        { $unwind: { path: '$authorId', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            description: 1,
            difficulty: 1,
            images: { $slice: ['$images', 1] },
            tags: 1,
            lovedCount: 1,
            matchCount: 1,
            authorId: 1,
          },
        },
      ]);
    } catch (err) {
      this.logger.error('Recipe search failed', err);
      return [];
    }
  }

  private async generateRecipe(ingredients: string[]) {
    const prompt = `You are a culinary expert. The user has these ingredients: ${ingredients.join(', ')}.

Create ONE creative, practical recipe they can make. Respond ONLY with valid JSON — no markdown, no explanation, just the JSON object:
{
  "title": "Recipe Name",
  "description": "Brief appetizing description (1-2 sentences)",
  "difficulty": "beginner",
  "servings": 4,
  "cookTime": "30 minutes",
  "ingredients": ["200g chicken breast", "3 cloves garlic"],
  "instructions": [
    { "step": 1, "instruction": "Clear, practical step description." }
  ],
  "tags": ["tag1", "tag2"]
}

Rules:
- difficulty must be exactly "beginner", "intermediate", or "advance"
- 5-10 ingredients max
- 4-8 instruction steps
- Use the user's ingredients as the primary base`;

    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        message.content[0].type === 'text' ? message.content[0].text : '';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]) as {
        title: string;
        description: string;
        difficulty: string;
        servings: number;
        cookTime: string;
        ingredients: string[];
        instructions: { step: number; instruction: string }[];
        tags: string[];
      };
    } catch (err) {
      this.logger.error('AI generation failed', err);
      return null;
    }
  }
}
