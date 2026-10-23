import { Test } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ShortenController } from './shorten.controller.js';
import { ShortenService } from './shorten.service.js';

describe('ShortenController', () => {
  let controller: ShortenController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ShortenController],
      providers: [{ provide: ShortenService, useValue: {} }],
    }).compile();

    controller = module.get(ShortenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect management endpoints with JwtAuthGuard and leave retrieval public', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('create'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('getStats'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('update'))).toContain(
      JwtAuthGuard,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('remove'))).toContain(
      JwtAuthGuard,
    );

    expect(Reflect.getMetadata(GUARDS_METADATA, getControllerMethod('findOne'))).toBeUndefined();
  });
});

function getControllerMethod(methodName: string) {
  const method = Object.getOwnPropertyDescriptor(ShortenController.prototype, methodName)?.value;

  if (typeof method !== 'function') {
    throw new Error(`ShortenController method ${methodName} was not found`);
  }

  return method;
}
