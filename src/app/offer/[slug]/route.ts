import { NextResponse } from 'next/server';

const DESTINATIONS = new Set([
    'instagram',
    'pinterest',
    'youtube',
    'newsletter',
]);

export async function GET(request: Request, { params }: { params: { slug: string } }) {
    const { slug } = params;

    if (DESTINATIONS.has(slug)) {
        const url = new URL('/editor?mode=quick', request.url);
        url.searchParams.set('utm_source', slug);
        url.searchParams.set('utm_medium', 'social');
        url.searchParams.set('utm_campaign', 'post_pack');
        url.searchParams.set('utm_content', 'generic');

        return NextResponse.redirect(url, 307);
