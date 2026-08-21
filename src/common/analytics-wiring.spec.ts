import 'reflect-metadata';
import { RecipeModule } from '../recipe/recipe.module';
import { RecipeAnalyticsService } from '../recipe/recipe-analytics.service';
import { RecipeInteractionModule } from '../recipe-interaction/recipe-interaction.module';
import { EngagementAnalyticsService } from '../recipe-interaction/engagement-analytics.service';
import { CookbookPurchaseModule } from '../cookbook-purchase/cookbook-purchase.module';
import { EarningsAnalyticsService } from '../cookbook-purchase/earnings-analytics.service';
import { RecipeController } from '../recipe/recipe.controller';
import { RecipeInteractionController } from '../recipe-interaction/recipe-interaction.controller';
import { CookbookPurchaseController } from '../cookbook-purchase/cookbook-purchase.controller';

/**
 * Analytics moved out of three CRUD services into three providers of their
 * own. A provider that a controller injects but its module never registers
 * type-checks fine and crashes at boot — so this reads the module metadata
 * Nest reads, and checks the controller really does depend on it.
 *
 * Deliberately static: compiling the real AppModule would be a stronger test,
 * but it drags a live Mongoose connection in, and when compilation fails the
 * pending socket keeps Jest alive instead of failing. A test that hangs
 * instead of going red is worse than no test.
 */
describe('analytics providers are wired into their modules', () => {
  const providersOf = (mod: object): unknown[] =>
    (Reflect.getMetadata('providers', mod) as unknown[]) ?? [];
  const injectedBy = (ctrl: object): unknown[] =>
    (Reflect.getMetadata('design:paramtypes', ctrl) as unknown[]) ?? [];

  const CASES: [string, object, object, object][] = [
    ['recipe', RecipeModule, RecipeAnalyticsService, RecipeController],
    [
      'recipe-interaction',
      RecipeInteractionModule,
      EngagementAnalyticsService,
      RecipeInteractionController,
    ],
    [
      'cookbook-purchase',
      CookbookPurchaseModule,
      EarningsAnalyticsService,
      CookbookPurchaseController,
    ],
  ];

  it.each(CASES)('%s registers its analytics service', (_n, mod, svc) => {
    expect(providersOf(mod)).toContain(svc);
  });

  it.each(CASES)('%s controller injects it', (_n, _mod, svc, ctrl) => {
    expect(injectedBy(ctrl)).toContain(svc);
  });
});
