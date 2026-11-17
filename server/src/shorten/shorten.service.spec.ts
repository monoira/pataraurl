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

  const member = { id: 1, role: Role.MEMBER, email: 'user@example.com' };
  const otherMember = { id: 2, role: Role.MEMBER, email: 'other@example.com' };
  const admin = { id: 3, role: Role.ADMIN, email: 'admin@example.com' };
  const owner = { id: 4, role: Role.OWNER, email: 'owner@example.com' };

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
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

    it('stores a null nickname and the acting user id when no nickname is given', async () => {
      shortenRepository.findOne.mockResolvedValue(null);

      await service.create({ url: 'https://example.com' }, member);

      expect(shortenRepository.create).toHaveBeenCalledWith({
        url: 'https://example.com',
        nickname: null,
        shortCode: expect.stringMatching(/^[a-zA-Z0-9]{6}$/),
        userId: 1,
      });
      expect(shortenRepository.save).toHaveBeenCalled();
    });

    it('regenerates the short code when the first candidate already exists', async () => {
      const randomSpy = vi.spyOn(Math, 'random');
      for (let i = 0; i < 6; i++) {
        randomSpy.mockReturnValueOnce(0);
      }
      for (let i = 0; i < 6; i++) {
        randomSpy.mockReturnValueOnce(1 / 62);
      }
      shortenRepository.findOne
        .mockResolvedValueOnce({ shortCode: 'aaaaaa' })
        .mockResolvedValueOnce(null);

      const result = await service.create({ url: 'https://example.com' }, member);

      expect(shortenRepository.findOne).toHaveBeenCalledTimes(2);
      expect(shortenRepository.findOne).toHaveBeenNthCalledWith(1, { where: { shortCode: 'aaaaaa' } });
      expect(shortenRepository.findOne).toHaveBeenNthCalledWith(2, { where: { shortCode: 'bbbbbb' } });
      expect(result.shortCode).toBe('bbbbbb');
    });
  });

  describe('findOriginal', () => {
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
      await expect(service.findOriginal('missing')).rejects.toThrow(
        'short url with code missing not found',
      );
      expect(shortenRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getOneStats', () => {
    it('returns stats for the owner of the short url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        nickname: 'example',
        shortCode: 'abc123',
        accessCount: 5,
        userId: 1,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      });

      await expect(service.getOneStats('abc123', member)).resolves.toEqual({
        id: '1',
        url: 'https://example.com',
        nickname: 'example',
        shortCode: 'abc123',
        accessCount: 5,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
    });

    it('allows admins to view stats of another user url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 5,
        userId: otherMember.id,
      });

      await expect(service.getOneStats('abc123', admin)).resolves.toHaveProperty('accessCount', 5);
    });

    it('allows owners to view stats of another user url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 5,
        userId: otherMember.id,
      });

      await expect(service.getOneStats('abc123', owner)).resolves.toHaveProperty('accessCount', 5);
    });

    it('allows any user to view stats of an unowned short url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 2,
        userId: undefined,
      });

      await expect(service.getOneStats('abc123', otherMember)).resolves.toHaveProperty(
        'accessCount',
        2,
      );
    });

    it('throws NotFoundException when the short code does not exist', async () => {
      shortenRepository.findOne.mockResolvedValue(null);

      await expect(service.getOneStats('missing', member)).rejects.toThrow(NotFoundException);
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

  describe('getAllStats', () => {
    it('returns formatted stats for every short url owned by the user', async () => {
      shortenRepository.find.mockResolvedValue([
        {
          id: 1,
          url: 'https://example.com',
          nickname: 'example',
          shortCode: 'abc123',
          accessCount: 5,
          userId: 1,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 2,
          url: 'https://other.example.com',
          nickname: null,
          shortCode: 'def456',
          accessCount: 0,
          userId: 1,
          createdAt: new Date('2024-02-01T00:00:00.000Z'),
          updatedAt: new Date('2024-02-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getAllStats(member);

      expect(shortenRepository.find).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(result).toEqual([
        {
          id: '1',
          url: 'https://example.com',
          nickname: 'example',
          shortCode: 'abc123',
          accessCount: 5,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: '2',
          url: 'https://other.example.com',
          nickname: null,
          shortCode: 'def456',
          accessCount: 0,
          createdAt: '2024-02-01T00:00:00.000Z',
          updatedAt: '2024-02-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns an empty list when the user has no short urls', async () => {
      shortenRepository.find.mockResolvedValue([]);

      await expect(service.getAllStats(member)).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('updates the url and nickname of an owned short url', async () => {
      const existing = {
        id: 1,
        url: 'https://old.example.com',
        nickname: 'old',
        shortCode: 'abc123',
        accessCount: 0,
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.save.mockImplementation(async (entity) => entity);

      await expect(
        service.update('abc123', { url: 'https://new.example.com', nickname: 'new' }, member),
      ).resolves.toHaveProperty('url', 'https://new.example.com');

      expect(existing.url).toBe('https://new.example.com');
      expect(existing.nickname).toBe('new');
      expect(shortenRepository.save).toHaveBeenCalledWith(existing);
    });

    it('clears the nickname when null is supplied', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        nickname: 'old',
        shortCode: 'abc123',
        accessCount: 0,
        userId: 1,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.save.mockImplementation(async (entity) => entity);

      await service.update('abc123', { nickname: null }, member);

      expect(existing.nickname).toBeNull();
    });

    it('leaves the nickname untouched when the field is omitted', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        nickname: 'keep-me',
        shortCode: 'abc123',
        accessCount: 0,
        userId: 1,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.save.mockImplementation(async (entity) => entity);

      await service.update('abc123', { url: 'https://changed.example.com' }, member);

      expect(existing.nickname).toBe('keep-me');
      expect(existing.url).toBe('https://changed.example.com');
    });

    it('allows admins and owners to update another user url', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        nickname: null,
        shortCode: 'abc123',
        accessCount: 0,
        userId: otherMember.id,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.save.mockImplementation(async (entity) => entity);

      await expect(service.update('abc123', { url: 'https://admin.example.com' }, admin)).resolves.toBeDefined();
      await expect(service.update('abc123', { url: 'https://owner.example.com' }, owner)).resolves.toBeDefined();
    });

    it('allows any user to update an unowned short url', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        nickname: null,
        shortCode: 'abc123',
        accessCount: 0,
        userId: undefined,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.save.mockImplementation(async (entity) => entity);

      await expect(service.update('abc123', { url: 'https://changed.example.com' }, otherMember)).resolves.toBeDefined();
    });

    it('throws NotFoundException when the short code does not exist', async () => {
      shortenRepository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { url: 'https://example.com' }, member)).rejects.toThrow(
        NotFoundException,
      );
      expect(shortenRepository.save).not.toHaveBeenCalled();
    });

    it('blocks members from updating another user url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 0,
        userId: otherMember.id,
      });

      await expect(
        service.update('abc123', { url: 'https://hijacked.example.com' }, member),
      ).rejects.toThrow(ForbiddenException);
      expect(shortenRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an owned short url', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 0,
        userId: 1,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.remove.mockResolvedValue(existing);

      await expect(service.remove('abc123', member)).resolves.toBeUndefined();
      expect(shortenRepository.remove).toHaveBeenCalledWith(existing);
    });

    it('allows admins and owners to delete another user url', async () => {
      const existing = {
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 0,
        userId: otherMember.id,
      };
      shortenRepository.findOne.mockResolvedValue(existing);
      shortenRepository.remove.mockResolvedValue(existing);

      await expect(service.remove('abc123', admin)).resolves.toBeUndefined();
      await expect(service.remove('abc123', owner)).resolves.toBeUndefined();
      expect(shortenRepository.remove).toHaveBeenCalledTimes(2);
    });

    it('throws NotFoundException when the short code does not exist', async () => {
      shortenRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('missing', member)).rejects.toThrow(NotFoundException);
      expect(shortenRepository.remove).not.toHaveBeenCalled();
    });

    it('blocks members from deleting another user url', async () => {
      shortenRepository.findOne.mockResolvedValue({
        id: 1,
        url: 'https://example.com',
        shortCode: 'abc123',
        accessCount: 0,
        userId: otherMember.id,
      });

      await expect(service.remove('abc123', member)).rejects.toThrow(ForbiddenException);
      expect(shortenRepository.remove).not.toHaveBeenCalled();
    });
  });
});
