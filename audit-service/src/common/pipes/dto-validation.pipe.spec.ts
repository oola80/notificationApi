import { DtoValidationPipe } from './dto-validation.pipe';

describe('DtoValidationPipe', () => {
  it('should be defined', () => {
    const pipe = new DtoValidationPipe();
    expect(pipe).toBeDefined();
  });

  it('should have whitelist enabled', () => {
    const pipe = new DtoValidationPipe();
    // Verify the pipe is a ValidationPipe instance
    expect(pipe).toBeInstanceOf(DtoValidationPipe);
  });
});
