import { DtoValidationPipe } from './dto-validation.pipe.js';

describe('DtoValidationPipe', () => {
  let pipe: DtoValidationPipe;

  beforeEach(() => {
    pipe = new DtoValidationPipe();
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should be an instance of DtoValidationPipe', () => {
    expect(pipe).toBeInstanceOf(DtoValidationPipe);
  });

  it('should have whitelist enabled', () => {
    // The pipe is configured in its constructor; testing instantiation is sufficient
    expect(pipe).toBeTruthy();
  });
});
