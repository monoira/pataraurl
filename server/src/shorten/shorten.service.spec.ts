import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Shorten } from './entities/shorten.entity.js';
import { ShortenService } from './shorten.service.js';
import { Role } from '../common/enums/role.enum.js';

describe('ShortenService', () => {
  let service: ShortenService;
  let shortenRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    shortenRepository = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((dto) => dto),
      save: vi.fn(async (entity) => ({
        id: 1,
        ...entity,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShortenService,
        {
          provide: getRepositoryToken(Shorten),
          useValue: shortenRepository,
        },
      ],
    }).compile();

    service = module.get<ShortenService>(ShortenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a short url', async () => {
    shortenRepository.findOne.mockResolvedValue(null);

    const result = await service.create(
      { url: 'https://example.com', nickname: 'example' },
      { id: 1, role: Role.MEMBER, email: 'user@example.com' },
    );

    expect(result).toHaveProperty('shortCode');
    expect(result.url).toBe('https://example.com');
    expect(shortenRepository.save).toHaveBeenCalled();
  });

  it('finds original url and increments access count', async () => {
    const mockShorten = {
      id: 1,
      url: 'https://example.com',
      shortCode: 'abc123',
      accessCount: 5,
      userId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    shortenRepository.findOne.mockResolvedValue(mockShorten);

    const result = await service.findOriginal('abc123');

    expect(result.url).toBe('https://example.com');
    expect(mockShorten.accessCount).toBe(6);
    expect(shortenRepository.save).toHaveBeenCalledWith(mockShorten);
  });

  it('throws NotFoundException when short code is not found', async () => {
    shortenRepository.findOne.mockResolvedValue(null);

    await expect(service.findOriginal('missing')).rejects.toThrow(NotFoundException);
  });

  it('blocks non-owners from viewing stats of another user url', async () => {
    const mockShorten = {
      id: 1,
      url: 'https://example.com',
      shortCode: 'abc123',
      accessCount: 5,
      userId: 2,
    };
    shortenRepository.findOne.mockResolvedValue(mockShorten);

    await expect(
      service.getOneStats('abc123', { id: 1, role: Role.MEMBER, email: 'user@example.com' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
