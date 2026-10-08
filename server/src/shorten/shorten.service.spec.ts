import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Shorten } from './entities/shorten.entity.js';
import { ShortenService } from './shorten.service.js';

describe('ShortenService', () => {
  let service: ShortenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShortenService,
        {
          provide: getRepositoryToken(Shorten),
          useValue: {
            create: vi.fn(),
            save: vi.fn(),
            findOne: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ShortenService>(ShortenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
