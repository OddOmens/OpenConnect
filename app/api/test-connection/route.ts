import { NextResponse } from 'next/server';
import { testConnection, resetTokenCache } from '@/lib/asc-client';
import { getCredentials } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST() {
  resetTokenCache();
  return NextResponse.json(await testConnection(getCredentials().vendor_number));
}
