export function extractValue(
  payload: Record<string, any> | null | undefined,
  path: string,
): any {
  if (!payload || !path) {
    return undefined;
  }

  const segments = path.split('.');
  let current: any = payload;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

export function extractValues(
  payload: Record<string, any> | null | undefined,
  paths: string[],
): any[] {
  return paths.map((path) => extractValue(payload, path));
}
