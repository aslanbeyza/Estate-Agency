import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('returns API metadata at root', () => {
    const res = controller.getRoot();
    expect(res.name).toBe('Estate Agency API');
    expect(res.docs).toBe('/api/docs');
    expect(res.health).toBe('/health');
  });
});
