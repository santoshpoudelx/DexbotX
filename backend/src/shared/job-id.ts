export function makeJobId(...parts: Array<string | number>): string {
  const result = parts
    .map((part) => String(part))
    .join('-');
  if (
    !result
    || result.length > 100
    || /^\d+$/.test(result)
    || !/^[A-Za-z0-9_-]+$/.test(result)
  ) {
    throw new Error(`Invalid BullMQ job id: ${result || '<empty>'}`);
  }
  return result;
}
