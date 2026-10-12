import { NextResponse } from 'next/server'
import { mainCategories as categories } from '@/lib/categories'

export async function GET() {
  return NextResponse.json(categories)
}
