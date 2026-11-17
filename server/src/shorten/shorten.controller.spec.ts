import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../common/types/auth.types.js';
import { Role } from '../common/enums/role.enum.js';
import { ShortenController } from './shorten.controller.js';
import { ShortenService } from './shorten.service.js';

function makeRequest(): AuthenticatedRequest {
  const mock: unknown = {
    user: { id: 1, email: 'user@example.com', role: Role.MEMBER },
  };

  if (!isAuthenticatedRequest(mock)) {
    throw new Error('request mock is not an AuthenticatedRequest');
  }

  return mock;
}

function isAuthenticatedRequest(value: unknown): value is AuthenticatedRequest {
  return typeof value === 'object' && value !== null && 'user' in value;
}

describe('ShortenController', () => {
  let controller: ShortenController;
  let shortenService: Record<string, ReturnType<typeof vi.fn>>;

  const request: AuthenticatedRequest = makeRequest();

  beforeEach(async () => {
    shortenService = {
      getAllStats: vi.fn(),
      create: vi.fn(),
      getOneStats: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      findOriginal: vi.fn(),
    };

    const module = await Test.createTestingModule({
      controllers: [ShortenController],
      providers: [{ provide: ShortenService, useValue: shortenService }],
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

  it('delegates all-stats retrieval with the authenticated user', async () => {
    shortenService.getAllStats.mockResolvedValue([{ id: '1' }]);

    await expect(controller.getAllStats(request)).resolves.toEqual([{ id: '1' }]);
    expect(shortenService.getAllStats).toHaveBeenCalledWith(request.user);
  });

  it('delegates creation with the dto and authenticated user', async () => {
    const dto = { url: 'https://example.com', nickname: 'example' };
    shortenService.create.mockResolvedValue({ id: '1', ...dto, shortCode: 'abc123' });

    await expect(controller.create(dto, request)).resolves.toMatchObject({ shortCode: 'abc123' });
    expect(shortenService.create).toHaveBeenCalledWith(dto, request.user);
  });

  it('propagates creation errors from the service', async () => {
    shortenService.create.mockRejectedValue(new NotFoundException('creation failed'));

    await expect(controller.create({ url: 'https://example.com' }, request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delegates single stats retrieval with the short code and user', async () => {
    shortenService.getOneStats.mockResolvedValue({ id: '1', accessCount: 3 });

    await expect(controller.getStats('abc123', request)).resolves.toHaveProperty('accessCount', 3);
    expect(shortenService.getOneStats).toHaveBeenCalledWith('abc123', request.user);
  });

  it('propagates stats errors from the service', async () => {
    shortenService.getOneStats.mockRejectedValue(new NotFoundException('short url not found'));

    await expect(controller.getStats('missing', request)).rejects.toThrow(NotFoundException);
  });

  it('delegates updates with the short code, dto and user', async () => {
    const dto = { url: 'https://updated.example.com', nickname: null };
    shortenService.update.mockResolvedValue({ id: '1', url: dto.url, nickname: null });

    await expect(controller.update('abc123', dto, request)).resolves.toMatchObject({
      url: dto.url,
    });
    expect(shortenService.update).toHaveBeenCalledWith('abc123', dto, request.user);
  });

  it('propagates update errors from the service', async () => {
    shortenService.update.mockRejectedValue(new NotFoundException('short url not found'));

    await expect(controller.update('missing', { url: 'https://example.com' }, request)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delegates removal with the short code and user', async () => {
    shortenService.remove.mockResolvedValue(undefined);

    await expect(controller.remove('abc123', request)).resolves.toBeUndefined();
    expect(shortenService.remove).toHaveBeenCalledWith('abc123', request.user);
  });

  it('propagates removal errors from the service', async () => {
    shortenService.remove.mockRejectedValue(new NotFoundException('short url not found'));

    await expect(controller.remove('missing', request)).rejects.toThrow(NotFoundException);
  });

  it('delegates public retrieval with the short code', async () => {
    shortenService.findOriginal.mockResolvedValue({ url: 'https://example.com' });

    await expect(controller.findOne('abc123')).resolves.toEqual({ url: 'https://example.com' });
    expect(shortenService.findOriginal).toHaveBeenCalledWith('abc123');
  });

  it('propagates public retrieval errors from the service', async () => {
    shortenService.findOriginal.mockRejectedValue(new NotFoundException('short url not found'));

    await expect(controller.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});

function getControllerMethod(methodName: string) {
  const method = Object.getOwnPropertyDescriptor(ShortenController.prototype, methodName)?.value;

  if (typeof method !== 'function') {
    throw new Error(`ShortenController method ${methodName} was not found`);
  }

  return method;
}
