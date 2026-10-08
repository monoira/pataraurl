import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ShortenController } from './shorten.controller.js';
import { ShortenService } from './shorten.service.js';

describe('ShortenController', () => {
  let controller: ShortenController;

  beforeEach(() => {
    controller = new ShortenController({} as ShortenService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect management endpoints with JwtAuthGuard and leave retrieval public', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ShortenController.prototype.create),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        ShortenController.prototype.getStats,
      ),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ShortenController.prototype.update),
    ).toContain(JwtAuthGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ShortenController.prototype.remove),
    ).toContain(JwtAuthGuard);

    expect(
      Reflect.getMetadata(GUARDS_METADATA, ShortenController.prototype.findOne),
    ).toBeUndefined();
  });
});
