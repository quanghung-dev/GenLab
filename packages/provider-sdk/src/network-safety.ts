import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '@genflow/shared';

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) return true;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertSafeHttpUrl(rawUrl: string, allowPrivateNetwork: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new AppError({
      code: 'INVALID_INPUT',
      message: 'Provider URL is invalid.',
      statusCode: 400,
      cause: error,
    });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError({
      code: 'INVALID_INPUT',
      message: 'Provider URL must use HTTP(S) and must not contain embedded credentials.',
      statusCode: 400,
    });
  }

  if (allowPrivateNetwork) return url;
  if (url.hostname.toLowerCase() === 'localhost') {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Private provider addresses are disabled.',
      statusCode: 403,
    });
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Provider URL resolves to a private or reserved address.',
      statusCode: 403,
    });
  }

  return url;
}
