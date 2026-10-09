import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { testConnection, resetTokenCache } from '@/lib/asc-client';
import { getCredentials } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  resetTokenCache();
  return NextResponse.json(await testConnection(getCredentials().vendor_number));
}
