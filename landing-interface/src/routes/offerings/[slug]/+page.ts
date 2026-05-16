import { error } from '@sveltejs/kit';
import { offeringPages } from '$lib/landing/data';

export const prerender = true;

export function entries() {
  return offeringPages.map((p) => ({ slug: p.slug }));
}

export function load({ params }) {
  const page = offeringPages.find((p) => p.slug === params.slug);
  if (!page) {
    throw error(404, 'Offering not found');
  }
  return { page };
}
