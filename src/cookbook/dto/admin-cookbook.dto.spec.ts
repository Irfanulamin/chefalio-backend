import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { AdminUpdateCookbookDto } from './admin-update-cookbook.dto';
import { ApplyGlobalDiscountDto } from './apply-global-discount.dto';
import { CookbookController } from '../cookbook.controller';

/**
 * The two admin cookbook writes used to take an untyped body — a bare
 * `@Body('discount') discount: number` and an inline TypeScript type literal.
 * Neither gives ValidationPipe a class to validate, and TypeScript types are
 * erased at runtime, so *any* JSON reached the database. Both writes then land
 * on `$set`, where Mongoose skips schema validators by default — so the
 * schema's `min: 0, max: 15` on discount was never consulted either.
 *
 * The bounds below are the ones the schema declares and the admin UI already
 * enforces client-side, so this closes the gap without moving the goalposts.
 */
describe('admin cookbook write validation', () => {
  // The app's global pipe, configured exactly as main.ts configures it.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    forbidUnknownValues: true,
  });

  const meta = (metatype: unknown): ArgumentMetadata => ({
    type: 'body',
    metatype: metatype as ArgumentMetadata['metatype'],
  });

  async function reject(dto: unknown, body: unknown) {
    await expect(pipe.transform(body, meta(dto))).rejects.toThrow();
  }
  async function accept(dto: unknown, body: unknown) {
    return pipe.transform(body, meta(dto));
  }

  describe('ApplyGlobalDiscountDto', () => {
    it('accepts the range the admin UI offers', async () => {
      for (const discount of [0, 5, 10, 15]) {
        await expect(
          accept(ApplyGlobalDiscountDto, { discount }),
        ).resolves.toMatchObject({ discount });
      }
    });

    it('rejects a discount above the schema maximum', async () => {
      await reject(ApplyGlobalDiscountDto, { discount: 16 });
      await reject(ApplyGlobalDiscountDto, { discount: 900 });
    });

    it('rejects a negative discount, which would raise every price', async () => {
      await reject(ApplyGlobalDiscountDto, { discount: -50 });
    });

    it('rejects a missing or non-numeric discount', async () => {
      await reject(ApplyGlobalDiscountDto, {});
      await reject(ApplyGlobalDiscountDto, { discount: 'ten' });
      await reject(ApplyGlobalDiscountDto, { discount: null });
    });

    it('rejects a fractional discount', async () => {
      await reject(ApplyGlobalDiscountDto, { discount: 7.5 });
    });

    it('coerces the numeric string a form sends', async () => {
      await expect(
        accept(ApplyGlobalDiscountDto, { discount: '10' }),
      ).resolves.toMatchObject({ discount: 10 });
    });

    it('rejects unknown fields', async () => {
      await reject(ApplyGlobalDiscountDto, { discount: 10, role: 'admin' });
    });
  });

  describe('AdminUpdateCookbookDto', () => {
    it('accepts the payload the admin cookbooks page sends', async () => {
      await expect(
        accept(AdminUpdateCookbookDto, {
          price: 25,
          stockCount: 100,
          discount: 10,
        }),
      ).resolves.toMatchObject({ price: 25, stockCount: 100, discount: 10 });
    });

    it('accepts a partial payload — every field is optional', async () => {
      await expect(accept(AdminUpdateCookbookDto, {})).resolves.toEqual({});
      await expect(
        accept(AdminUpdateCookbookDto, { title: 'New title' }),
      ).resolves.toMatchObject({ title: 'New title' });
    });

    it('holds discount to the same bounds as the global write', async () => {
      await reject(AdminUpdateCookbookDto, { discount: 16 });
      await reject(AdminUpdateCookbookDto, { discount: -1 });
    });

    it('rejects a negative price or stock count', async () => {
      await reject(AdminUpdateCookbookDto, { price: -1 });
      await reject(AdminUpdateCookbookDto, { stockCount: -5 });
    });

    it('rejects a fractional stock count', async () => {
      await reject(AdminUpdateCookbookDto, { stockCount: 2.5 });
    });

    it('rejects an empty title or description', async () => {
      await reject(AdminUpdateCookbookDto, { title: '' });
      await reject(AdminUpdateCookbookDto, { description: '' });
    });

    it('rejects fields an admin has no business setting here', async () => {
      await reject(AdminUpdateCookbookDto, { authorId: 'someone-else' });
      await reject(AdminUpdateCookbookDto, {
        cookbook_image: 'http://x/y.png',
      });
    });
  });

  /**
   * The DTOs above are only worth anything if the routes actually declare them.
   * ValidationPipe works off the parameter's runtime metatype, so this reads
   * the same metadata Nest reads. Without it, someone could revert a handler to
   * an inline type literal and every test above would still pass.
   */
  describe('the admin routes declare those DTOs', () => {
    const paramTypes = (method: string): unknown[] =>
      Reflect.getMetadata(
        'design:paramtypes',
        CookbookController.prototype,
        method,
      ) as unknown[];

    it('binds ApplyGlobalDiscountDto to the global discount route', () => {
      expect(paramTypes('applyGlobalDiscount')).toEqual([
        ApplyGlobalDiscountDto,
      ]);
    });

    it('binds AdminUpdateCookbookDto to the admin update route', () => {
      expect(paramTypes('adminUpdate')).toEqual([
        String,
        AdminUpdateCookbookDto,
      ]);
    });
  });
});
